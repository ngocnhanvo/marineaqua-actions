import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const pages=[83449,83451,83453,83459];
const report={status:'STARTED',pages:[],writes:0,errors:[]};
await mkdir('artifacts/commerce-editor-probe',{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await ctx.newPage();
 assert.ok(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD);
 await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
 await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator('#wp-submit').click();
 assert.ok((await page.locator('#wpadminbar').count())>0,'Not authenticated');
 for(const id of pages){
  const entry={id,controls:[],editor:{},error:''};
  try {
   await page.goto(WP+'/wp-admin/post.php?post='+id+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('#content').waitFor({state:'attached',timeout:30000});
   entry.editor=await page.evaluate(()=>{
    const el=document.getElementById('content');
    const quick=document.getElementById('qt_content_tablepress_quicktags_button');
    const tiny=window.tinymce?.get?.('content');
    const editor=el?.closest('form');
    const rect=(node)=>node?{visible:!!node.getClientRects().length,display:getComputedStyle(node).display,hidden:node.hidden}:null;
    return {
      textarea:rect(el),name:el?.getAttribute('name'),formId:editor?.id,formAction:editor?.action,
      textareaLength:el?.value?.length,quick:rect(quick),quickParent:rect(quick?.parentElement),
      htmlTab:rect(document.getElementById('content-html')),
      tmceTab:rect(document.getElementById('content-tmce')),
      tinyExists:!!tiny,tinyHidden:tiny?.isHidden?.(),tinyContentLength:tiny?.getContent?.().length,
      editorMode:window.switchEditors?.mode,wpActiveEditor:window.wpActiveEditor,
      tablepressControls:[...document.querySelectorAll('[id*="tablepress"],[class*="tablepress"]')].filter(n=>n.getClientRects().length).slice(0,15).map(n=>({tag:n.tagName,id:n.id,cls:String(n.className).slice(0,70)})),
      editorAttributes:el?Array.from(el.attributes).filter(a=>!(/nonce|token|auth|password/i.test(a.name))).map(a=>[a.name,a.value.slice(0,120)]):[],
    };
   });
  }catch(e){entry.error=String(e).slice(0,350);}
  report.pages.push(entry);
 }
 report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(String(e).slice(0,600));process.exitCode=1;}
finally {await writeFile('artifacts/commerce-editor-probe/report.json',JSON.stringify(report,null,2));console.log('COMMERCE_EDITOR_PROBE='+JSON.stringify(report));await browser.close();}
