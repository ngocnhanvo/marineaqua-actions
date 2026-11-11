import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn", PAGE=82454, TABLE="home_00";
const evidence="home00-native-evidence";
await mkdir(evidence,{recursive:true});
const report={page:PAGE,table:TABLE,saved:false,steps:[]};
function log(step,meta={}){report.steps.push({step,...meta});console.log("ATTACH_"+step+"="+JSON.stringify(meta));}
const u=process.env.WP_ADMIN_USERNAME,p=process.env.WP_ADMIN_PASSWORD;
if(!u||!p)throw new Error("Missing WordPress admin credentials");
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 page.on("dialog",async d=>d.type()==="confirm"||d.type()==="beforeunload"?d.accept():d.dismiss());
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(u);
 await page.locator("#user_pass").fill(p);
 await page.locator("#wp-submit").click();
 const t=await context.request.get(WP+"/wp-json/tablepress/v1/table/home_00",{timeout:25000});
 if(!t.ok())throw new Error("ESC Table absent");
 const body=await t.text();
 if(!body.includes("banner1-1-690x336")||!body.includes("<img"))throw new Error("ESC Table has no verified media");
 log("TABLE_VERIFIED",{http:t.status(),hasImage:true});
 const src=await context.request.get(WP+"/wp-json/wp/v2/pages/"+PAGE+"?_fields=id,slug,acf,status,content",{timeout:25000});
 if(!src.ok())throw new Error("WordPress Page missing");
 const home=await src.json();
 if(home.id!==PAGE||home.slug!=="trang-chu"||home.acf?.key!=="home"||home.acf?.action!=="HomePage"||home.status!=="publish")throw Error("Unexpected WordPress homepage identity");
 await page.goto(WP+"/wp-admin/post.php?post="+PAGE+"&action=edit",{waitUntil:"domcontentloaded",timeout:45000});
 if(page.url().includes("wp-login.php"))throw new Error("Editor unauthenticated");
 const tab=page.locator("#content-html");if(await tab.count())await tab.click();
 const contentBefore=await page.locator("#content").inputValue();
 log("PAGE_BEFORE",{chars:contentBefore.length,hasTable:contentBefore.includes(TABLE)});
 if(contentBefore.includes(TABLE)){report.saved=true;log("ALREADY_ATTACHED",{id:TABLE});}
 else{
   if(contentBefore.trim())throw Error("Existing content not empty; refuse overwrite");
   // Activate the correct Classic Editor before using native ESC Table Insert Code.
   await page.evaluate(()=>{window.wpActiveEditor="content";if(window.QTags?.instances?.content){window.QTags.instances.content.canvas.focus();}});
   const trigger=page.locator("#qt_content_tablepress_quicktags_button");
   await trigger.waitFor({state:"visible",timeout:15000});
   await trigger.click();
   const frame=page.frameLocator("#TB_iframeContent");
   const insert=frame.locator('input.insert-shortcode[title*="home_00"]').first();
   await insert.waitFor({state:"visible",timeout:20000});
   const title=await insert.getAttribute("title");
   if(title!=="[table id=home_00 /]")throw Error("Native insertion target mismatch");
   await insert.click();
   await page.waitForTimeout(900);
   const probe=await page.evaluate(()=>({
      active:String(window.wpActiveEditor||""),
      pageText:String(document.querySelector("#content")?.value||""),
      acfText:String(document.querySelector("#acf_content")?.value||""),
      tinymceText:String(window.tinymce?.get("content")?.getContent()||"")
   }));
   log("INSERT_PROBE",{active:probe.active,pageChars:probe.pageText.length,
       pageOccurrences:(probe.pageText.match(/home_00/g)||[]).length,
       acfOccurrences:(probe.acfText.match(/home_00/g)||[]).length,
       tinymceOccurrences:(probe.tinymceText.match(/home_00/g)||[]).length});
   if((probe.pageText.match(/home_00/g)||[]).length!==1)throw Error("Native button did not insert into Page content");
   await page.locator("#publish").click();
   await page.waitForLoadState("domcontentloaded",{timeout:45000});
   await page.goto(WP+"/wp-admin/post.php?post="+PAGE+"&action=edit",{waitUntil:"domcontentloaded",timeout:45000});
   const persisted=await page.locator("#content").inputValue();
   if((persisted.match(/home_00/g)||[]).length!==1)throw Error("Native Page Save readback mismatch");
   report.saved=true;log("PAGE_SAVED",{source:"native_insert_code",id:TABLE,occurrences:1});
 }
 await page.screenshot({path:evidence+"/home-editor-after.png",fullPage:false});
 await context.close();
}catch(e){
 report.error=String(e.message||e).slice(0,320);log("FAIL",{error:report.error});process.exitCode=1;
}finally{
 await browser.close();
 await writeFile(evidence+"/attach-result.json",JSON.stringify(report,null,2)+"\n");
 console.log("ATTACH_RESULT="+JSON.stringify({saved:report.saved,steps:report.steps.map(x=>x.step)}));
}
