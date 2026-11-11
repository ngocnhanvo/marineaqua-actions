import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const WP="https://admin.marine-aqua.io.vn", PAGE=82454;
const SECTIONS=[
  ["home_00","Banner trang chủ"],
  ["home_03","SẢN PHẨM"],
  ["home_04","TROPIC-MARIN"],
  ["home_05","PRODIBIO"],
  ["home_06","PRODAC"],
  ["home_07","RED SEA"],
  ["home_08","CONTINUUM AQUATICS"],
];
const user=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
if(!user||!password)throw Error("Missing configured WordPress admin credentials");
const dir="home-sections-native-evidence";
await mkdir(dir,{recursive:true});
const result={pageId:PAGE,added:[],reused:[],saved:false,steps:[]};
const log=(event,detail={})=>{result.steps.push({event,...detail});console.log("NATIVE_SECTIONS_"+event+"="+JSON.stringify(detail));};
const re=(id)=>new RegExp("\\[table\\s+id=[\"']?"+id+"[\"']?\\s*\\/\\]","gi");
const counts=(content)=>SECTIONS.map(([id])=>({id,n:(content.match(re(id))||[]).length}));
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const all=await context.request.get(WP+"/wp-json/tablepress/v1/tables/prefix/all?per_page=30&page=1",{timeout:30000});
 if(!all.ok())throw Error("ESC Table inventory unavailable");
 const tables=await all.json();
 if(!Array.isArray(tables))throw Error("Invalid ESC Table response");
 for(const [id,title] of SECTIONS){
   const hit=tables.find(t=>t.id===id);
   if(!hit||hit.title!==title)throw Error("Incorrect ESC Table ID/title: "+id);
 }
 const page=await context.newPage();
 page.on("dialog",async dialog=>{if(dialog.type()==="confirm")await dialog.accept();else await dialog.dismiss();});
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(user);
 await page.locator("#user_pass").fill(password);
 await page.locator("#wp-submit").click();
 const pageRest=await context.request.get(WP+"/wp-json/wp/v2/pages/"+PAGE+"?_fields=id,slug,status,acf",{timeout:30000});
 if(!pageRest.ok())throw Error("Home Page REST cannot read");
 const pd=await pageRest.json();
 if(pd.id!==PAGE||pd.slug!=="trang-chu"||pd.status!=="publish"||pd.acf?.key!=="home"||pd.acf?.action!=="HomePage")throw Error("Unexpected Home Page identity");
 await page.goto(WP+"/wp-admin/post.php?post="+PAGE+"&action=edit",{waitUntil:"domcontentloaded",timeout:45000});
 if(page.url().includes("wp-login.php"))throw Error("WordPress editor login failed");
 const editor=page.locator("#content");
 const before=await editor.inputValue();
 const extraIds=[...before.matchAll(/\[table\s+id=["']?([a-z0-9_-]+)["']?\s*\/\]/gi)].map(m=>m[1]).filter(id=>!SECTIONS.some(s=>s[0]===id));
 if(extraIds.length)throw Error("Unexpected existing shortcode; refuse overwrite");
 if(counts(before).some(c=>c.n>1))throw Error("Duplicated existing shortcode");
 if(before.replace(/\[table\s+id=["']?[a-z0-9_-]+["']?\s*\/\]/gi,"").replace(/<[^>]*>/g,"").trim())throw Error("Unrelated Page content exists; refuse overwriting");
 const button=page.locator('.mce-btn[aria-label="Insert a ESC Table"], #content_tablepress_insert_table').first();
 await button.waitFor({state:"visible",timeout:30000});
 for(const [id] of SECTIONS){
   const html=await page.evaluate(()=>String(window.tinymce?.get("content")?.getContent()||""));
   const n=(html.match(re(id))||[]).length;
   if(n===1){result.reused.push(id);log("REUSED",{id});continue;}
   if(n!==0)throw Error("Duplicate native shortcode: "+id);
   await page.evaluate(()=>{
     const ed=window.tinymce?.get("content");
     if(!ed||ed.isHidden())throw Error("TinyMCE native editor unavailable");
     ed.focus();
     ed.selection.setCursorLocation(ed.getBody(),ed.getBody().childNodes.length);
     window.wpActiveEditor="content";
   });
   await button.click();
   const native=page.frameLocator("#TB_iframeContent").locator('input.insert-shortcode[title="[table id='+id+' /]"]').first();
   await native.waitFor({state:"visible",timeout:25000});
   await native.click();
   await page.waitForFunction(id=>String(window.tinymce?.get("content")?.getContent()||"").includes("[table id="+id+" /]"),id,{timeout:25000});
   const next=await page.evaluate(()=>String(window.tinymce?.get("content")?.getContent()||""));
   if((next.match(re(id))||[]).length!==1)throw Error("Native shortcode insertion failed for "+id);
   result.added.push(id);
   log("INSERT_PASS",{id});
 }
 const finalHtml=await page.evaluate(()=>String(window.tinymce?.get("content")?.getContent()||""));
 const order=SECTIONS.map(([id])=>({id,at:finalHtml.indexOf("[table id="+id+" /]")}));
 log("PREVIEW_ORDER",{order});
 if(order.some((x,i)=>x.at<0||(i>0&&x.at<order[i-1].at)))throw Error("Native shortcode order differs from approved sections");
 await page.evaluate(()=>window.tinymce?.triggerSave());
 const raw=await editor.inputValue();
 log("PRE_SAVE",{size:raw.length,counts:counts(raw)});
 if(counts(raw).some(x=>x.n!==1))throw Error("Native TinyMCE did not sync Page data");
 await page.screenshot({path:dir+"/before-save.png",fullPage:false});
 await page.locator("#publish").click();
 await page.waitForTimeout(4500);
 await page.goto(WP+"/wp-admin/post.php?post="+PAGE+"&action=edit",{waitUntil:"domcontentloaded",timeout:45000});
 const persisted=await editor.inputValue();
 result.persisted=counts(persisted);
 log("AFTER_SAVE",{size:persisted.length,counts:result.persisted});
 if(result.persisted.some(x=>x.n!==1))throw Error("Native WordPress Update did not retain all ESC Table sections");
 result.saved=true;
 await page.screenshot({path:dir+"/after-save.png",fullPage:false});
 await context.close();
}catch(error){
 result.error=String(error.message||error).slice(0,300);
 log("FAIL",{reason:result.error});
 process.exitCode=1;
}finally{
 await browser.close();
 await writeFile(dir+"/result.json",JSON.stringify(result,null,2)+"\n");
 console.log("NATIVE_SECTIONS_RESULT="+JSON.stringify({saved:result.saved,added:result.added,reused:result.reused,error:result.error||null}));
}
