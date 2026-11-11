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
 const tab=page.locator("#content-html");
 if(await tab.isVisible()){
   await tab.click();
   // Classic Editor asynchronously toggles from TinyMCE to Quicktags.
   // Do not switch back to Visual before the native TablePress control appears.
   await page.waitForFunction(
     ()=>document.querySelector("#wp-content-wrap")?.classList.contains("html-active"),
     null,{timeout:12000}
   );
 }
 const contentBefore=await page.locator("#content").inputValue();
 log("PAGE_BEFORE",{chars:contentBefore.length,hasTable:contentBefore.includes(TABLE)});
 if(contentBefore.includes(TABLE)){report.saved=true;log("ALREADY_ATTACHED",{id:TABLE});}
 else{
   if(contentBefore.trim())throw Error("Existing content not empty; refuse overwrite");
   // Insert only through the registered WordPress ESC Table toolbar control.
   let chosenEditor="";
   const quick=page.locator("#qt_content_tablepress_quicktags_button");
   if(!await quick.isVisible())await quick.waitFor({state:"visible",timeout:12000}).catch(()=>{});
   if(await quick.isVisible()){
     chosenEditor="quicktags";
     await quick.click();
   }else{
     const visual=page.locator("#content-tmce");
     if(await visual.isVisible())await visual.click();
     const button=page.locator("#content_tablepress_insert_table, #content_tablepress_insert_table-button, .mce-btn[aria-label*='ESC Table']").first();
     const controls=await page.locator("#wp-content-wrap .mce-btn").evaluateAll(els=>els.slice(0,40).map(el=>({
       id:el.id,title:el.title,aria:el.getAttribute("aria-label"),text:(el.textContent||"").slice(0,35)
     })));
     const snapshot=await page.evaluate(()=>{
       const ids=["wp-content-wrap","content-html","content-tmce","qt_content_tablepress_quicktags_button","wp-acf_content-wrap","acf_content-html","acf_content-tmce","qt_acf_content_tablepress_quicktags_button"];
       const info=ids.map(id=>{const el=document.getElementById(id);if(!el)return {id,found:false};
         const rect=el.getBoundingClientRect(),css=getComputedStyle(el);return{id,found:true,tag:el.tagName,
           visible:rect.width>0&&rect.height>0&&css.visibility!=="hidden"&&css.display!=="none",
           rect:[Math.round(rect.x),Math.round(rect.y),Math.round(rect.width),Math.round(rect.height)],
           cls:String(el.className||"").slice(0,140),title:el.getAttribute("title"),text:(el.textContent||"").slice(0,100)};
       });
       const buttons=[...document.querySelectorAll("button,input[type=button],a")].filter(el=>/table|insert|chèn|mã|trực quan/i.test((el.textContent||"")+" "+(el.title||"")+" "+(el.value||"")))
         .slice(0,60).map(el=>({id:el.id,tag:el.tagName,title:el.title,text:(el.textContent||el.value||"").slice(0,55),
           visible:Boolean(el.getClientRects().length)}));
       return {info,buttons,wpActiveEditor:window.wpActiveEditor||"",
         tinyMceReady:Boolean(window.tinymce?.get("content")),quicktagsReady:Boolean(window.QTags),
         nativePluginReady:typeof window.tablepress_open_shortcode_thickbox==="function"};
     });
     log("NATIVE_EDITOR_DOM_DIAGNOSTICS",snapshot);
     await page.screenshot({path:evidence+"/editor-controls-before.png",fullPage:false});
     log("NATIVE_EDITOR_CONTROLS",{quickVisible:await quick.isVisible(),buttonVisible:await button.isVisible(),controls});
     if(!await button.isVisible())throw Error("No native ESC Table Insert Code control visible");
     chosenEditor="tinymce";
     await button.click();
   }
   log("NATIVE_BUTTON_CLICKED",{editor:chosenEditor});
   const frame=page.frameLocator("#TB_iframeContent");
   const insert=frame.locator('input.insert-shortcode[title*="home_00"]').first();
   await insert.waitFor({state:"visible",timeout:20000});
   const title=await insert.getAttribute("title");
   if(title!=="[table id=home_00 /]")throw Error("Native insertion target mismatch");
   await insert.click();
   await page.waitForTimeout(900);
   let probe=await page.evaluate(()=>({
      active:String(window.wpActiveEditor||""),
      pageText:String(document.querySelector("#content")?.value||""),
      acfText:String(document.querySelector("#acf_content")?.value||""),
      tinymceText:String(window.tinymce?.get("content")?.getContent()||"")
   }));
   log("INSERT_PROBE",{editor:chosenEditor,active:probe.active,pageChars:probe.pageText.length,
       pageOccurrences:(probe.pageText.match(/home_00/g)||[]).length,
       acfOccurrences:(probe.acfText.match(/home_00/g)||[]).length,
       tinymceOccurrences:(probe.tinymceText.match(/home_00/g)||[]).length});
   if(chosenEditor==="tinymce"){
     const textTab=page.locator("#content-html");
     if(await textTab.isVisible())await textTab.click();
     await page.waitForTimeout(400);
     probe=await page.evaluate(()=>({
       active:String(window.wpActiveEditor||""),
       pageText:String(document.querySelector("#content")?.value||""),
       tinymceText:String(window.tinymce?.get("content")?.getContent()||"")
     }));
   }
   if((probe.pageText.match(/home_00/g)||[]).length!==1)throw Error("Native Insert Code did not insert precisely one shortcode");
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
