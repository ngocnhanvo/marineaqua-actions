import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP='https://admin.marine-aqua.io.vn';
const ASSET='https://marine-aqua.vn/wp-content/uploads/2026/08/banner1-1-690x336.jpg';
const ID='home_00';
const PAGE=82454;
const evidence='home00-native-evidence';
await mkdir(evidence,{recursive:true});
let phase='preflight';
const result={scope:{pageId:PAGE,tableId:ID,mediaFilename:'banner1-1-690x336.jpg'},steps:[],asset:null,tableId:null,mediaId:null,attached:false};
function record(name,details={}){result.steps.push({name,...details});console.log('HOME00_'+name+'='+JSON.stringify(details));}
async function save(){await writeFile(evidence+'/result.json',JSON.stringify(result,null,2)+'\n');}
const authUser=process.env.WP_ADMIN_USERNAME,authPass=process.env.WP_ADMIN_PASSWORD;
if(!authUser||!authPass)throw Error('Admin secrets unavailable');
const remote=await fetch(ASSET,{signal:AbortSignal.timeout(30000)});
if(!remote.ok)throw Error('Approved original banner unavailable: '+remote.status);
const bytes=Buffer.from(await remote.arrayBuffer());
if(bytes.length<3000||bytes.length>9000000||bytes[0]!==255||bytes[1]!==216)throw Error('Original banner is not valid JPEG');
result.asset={origin:'marine-aqua.vn',filename:'banner1-1-690x336.jpg',bytes:bytes.length};
record('ASSET_VERIFIED',{bytes:bytes.length});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({baseURL:WP,viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 page.on('dialog',async d=>{if(d.type()==='confirm'||d.type()==='beforeunload')await d.accept();else await d.dismiss()});
 await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#user_login').fill(authUser);
 await page.locator('#user_pass').fill(authPass);
 await page.locator('#wp-submit').click();
 await page.goto(WP+'/wp-admin/post.php?post='+PAGE+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
 if(page.url().includes('wp-login.php'))throw Error('WordPress admin login not accepted');
 const pageCheck=await context.request.get('/wp-json/wp/v2/pages/'+PAGE+'?_fields=id,slug,status,acf,content',{timeout:30000});
 if(!pageCheck.ok())throw Error('Cannot read Home Page: '+pageCheck.status());
 const pageData=await pageCheck.json();
 if(pageData.id!==PAGE||pageData.slug!=='trang-chu'||pageData.status!=='publish'||
    pageData.acf?.key!=='home'||pageData.acf?.action!=='HomePage')throw Error('Unexpected WordPress Home Page identity');
 const content=String(pageData.content?.rendered||'');
 if(content.trim()&&!content.includes('[table'))throw Error('Home Page has unexpected existing content; refuse overwrite');
 record('PAGE_PREFLIGHT',{id:PAGE,slug:pageData.slug,existingTableShortcodes:(content.match(/\[table\b/g)||[]).length});
 phase='media';
 const listMedia=async()=>{
   const response=await context.request.get('/wp-json/wp/v2/media?per_page=100&_fields=id,slug,source_url',{timeout:30000});
   if(!response.ok())throw Error('Cannot read WordPress Media Library: '+response.status());
   const items=await response.json();
   return Array.isArray(items)?items:[];
 };
 let currentMedia=await listMedia();
 record('MEDIA_PRECHECK',{count:currentMedia.length});
 let found=currentMedia.find(x=>x.slug==='banner1-1-690x336' && /^banner1-1-690x336(?:-1)?\.jpg$/i.test(String(x.source_url||'').split('/').pop()));
 if(found){result.mediaId=found.id;record('MEDIA_REUSED',{id:found.id,file:String(found.source_url).split('/').pop()});}
 if(!result.mediaId){
   // Use WordPress's authenticated Media REST endpoint. The ESC Table
   // image itself is subsequently inserted using the native Insert Image control.
   await page.goto(WP+'/wp-admin/media-new.php',{waitUntil:'domcontentloaded',timeout:45000});
   const nonce=await page.evaluate(()=>String(window.wpApiSettings?.nonce||''));
   record('MEDIA_NONCE_AVAILABLE',{yes:Boolean(nonce)});
   if(!nonce)throw Error('WordPress media REST nonce not exposed; cannot safely upload');
   const response=await context.request.post('/wp-json/wp/v2/media',{
      headers:{'X-WP-Nonce':nonce,'Content-Type':'image/jpeg',
       'Content-Disposition':'attachment; filename="banner1-1-690x336.jpg"'},
      data:bytes,timeout:60000,failOnStatusCode:false,
   });
   if(!response.ok()){
     record('MEDIA_UPLOAD_REJECTED',{status:response.status()});
     throw Error('WordPress media upload returned HTTP '+response.status());
   }
   const uploaded=await response.json();
   if(!Number.isInteger(uploaded?.id)||uploaded.id<=0)throw Error('Media upload gave no id');
   result.mediaId=uploaded.id;
   record('MEDIA_UPLOADED',{id:uploaded.id});
   currentMedia=await listMedia();
   found=currentMedia.find(x=>x.id===result.mediaId);
   if(!found||!String(found.source_url||'').includes('banner1-1-690x336.jpg')){
     throw Error('Media readback missing expected asset after REST upload');
   }
 }
 phase='table';
 const all=await context.request.get('/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1',{timeout:30000});
 if(!all.ok())throw Error('ESC table list unreadable');
 const tables=await all.json();
 const preexisting=Array.isArray(tables)&&tables.some(t=>t.id===ID);
 if(!preexisting){
   if(Array.isArray(tables)&&tables.some(t=>/banner trang ch.u/i.test(String(t.name||t.title||''))))throw Error('Similar table exists, refuse duplicate');
   await page.goto(WP+'/wp-admin/admin.php?page=tablepress_add',{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('input[name="table[name]"]').fill('Banner trang chủ');
   await page.locator('input[name="table[rows]"]').fill('2');
   await page.locator('input[name="table[columns]"]').fill('4');
   await page.getByRole('button',{name:/Add Table/i}).click();
   await page.waitForURL(/table_id=|action=edit|tablepress_edit/i,{timeout:45000});
   record('TABLE_CREATED',{urlPath:new URL(page.url()).pathname});
 }else{
   await page.goto(WP+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+ID,{waitUntil:'domcontentloaded',timeout:45000});
   record('TABLE_REUSED',{id:ID});
 }
 await page.locator('#table-id').waitFor({state:'visible',timeout:30000});
 const currentId=await page.locator('#table-id').inputValue();
 if(currentId!==ID){
   await page.locator('#table-id').fill(ID);
   await page.locator('#table-information-shortcode').focus();
 }
 const supportsEditor=await page.evaluate(()=>Boolean(window.tp?.editor?.setValueFromCoords&&window.tp?.table?.data));
 if(!supportsEditor)throw Error('Native ESC Table editor not ready');
 const patch={
   headers:['title','image','link','mobile'],
   row:['Banner Marine Aqua','','','0']
 };
 await page.evaluate(({headers,row})=>{
   for(let x=0;x<4;x++){
     window.tp.editor.setValueFromCoords(x,0,headers[x]);
     window.tp.editor.setValueFromCoords(x,1,row[x]);
   }
 },patch);
 await page.getByRole('button',{name:/Save Changes/i}).first().click();
 await page.waitForTimeout(1500);
 if(await page.locator('#table-id').inputValue()!==ID)throw Error('Table id save did not persist');
 result.tableId=ID;
 record('TABLE_SCHEMA_SAVED',{id:ID,headers:patch.headers});
 phase='native-image';
 // Use the official ESC Table Insert Image control in the current selected cell.
 await page.evaluate(()=>window.tp.editor.updateSelectionFromCoords(1,1,1,1));
 const controls=await page.locator('button, input[type=button]').evaluateAll(els=>els.filter(x=>/insert image|ch.n .*nh|image/i.test((x.innerText||'')+' '+(x.title||'')+' '+(x.value||''))).slice(0,15).map(x=>({tag:x.tagName,id:x.id,txt:(x.innerText||x.value||'').trim().slice(0,45),title:x.title})));
 record('IMAGE_CONTROLS',{controls});
 const insertImage=page.getByRole('button',{name:/Insert Image|Chèn ảnh/i}).first();
 if(await insertImage.count()===0){
   // The official React Insert Image button may be hidden by an editor panel.
   // Call the exact native TablePress callback used by that button.
   await page.evaluate(()=>window.tp.callbacks.insert_image.open_dialog());
 }else{
   await insertImage.click();
 }
 const picker=page.locator('.media-modal');
 await picker.waitFor({state:'visible',timeout:15000});
 const tile=picker.locator('li.attachment[data-id="'+result.mediaId+'"]').first();
 await tile.waitFor({state:'visible',timeout:20000});
 await tile.click();
 const altInput=picker.locator('input[data-setting="alt"]').first();
 if(await altInput.count()){await altInput.fill('Banner sản phẩm FISHLOVERSHOP');await altInput.blur();}
 const selectedState=await tile.getAttribute('aria-checked');
 const mediaButtons=await picker.locator('button').evaluateAll(els=>els
   .filter(el=>/insert|ch.n|media-button|select/i.test(el.className+' '+el.textContent))
   .slice(-15).map(el=>({cls:String(el.className).slice(0,90),label:(el.textContent||'').trim().slice(0,65),disabled:el.disabled})));
 record('IMAGE_MODAL_BUTTONS',{selectedState,buttons:mediaButtons});
 const nativeButton=picker.locator('button.media-button-insert').first();
 if(await nativeButton.count()===0)throw Error('Native Media Insert button not present');
 if(!await nativeButton.isEnabled())throw Error('Native Media Insert button remained disabled');
 await nativeButton.click();
 await picker.waitFor({state:'hidden',timeout:20000});
 await page.waitForTimeout(1300);
 const nativeResult=await page.evaluate(()=>({
    cell:String(window.tp.editor.getValueFromCoords(1,1)||''),
    helper:String(document.querySelector('#textarea-insert-helper')?.value||''),
    selected:window.tp.helpers.selection,
 }));
 record('IMAGE_PICKER_READBACK',{cellLength:nativeResult.cell.length,helperLength:nativeResult.helper.length,
   cellHasImg:nativeResult.cell.includes('<img'),helperHasImg:nativeResult.helper.includes('<img'),
   selection:nativeResult.selected});
 let value=nativeResult.cell;
 if(!value.includes('<img')){
   // WordPress Media Editor has selected the attachment but failed to update
   // TablePress's helper textarea. Retrieve HTML using its native server-side
   // send-attachment-to-editor API and notify the existing TablePress change
   // callback; do not craft an <img> string or inject an image URL ourselves.
   const fallback=await page.evaluate(async (id)=>{
     const attachment=window.wp.media.attachment(id);
     if(!attachment)throw Error('Selected native WordPress attachment disappeared');
     await new Promise((resolve,reject)=>attachment.fetch().done(resolve).fail(reject));
     const props={align:'none',size:'full',link:'none',alt:'Banner sản phẩm FISHLOVERSHOP'};
     const html=await new Promise((resolve,reject)=>
       window.wp.media.editor.send.attachment(props,attachment.toJSON()).done(resolve).fail(reject));
     const helper=document.querySelector('#textarea-insert-helper');
     if(!helper||typeof html!=='string'||!html.includes('<img'))throw Error('WordPress native media server returned no image HTML');
     helper.value=html;
     window.jQuery(helper).trigger('change');
     return {length:html.length,hasAlt:html.includes('alt=')};
   },result.mediaId);
   record('IMAGE_NATIVE_HELPER_RECOVERED',fallback);
   value=await page.evaluate(()=>String(window.tp.editor.getValueFromCoords(1,1)||''));
 }
 if(!value.includes('<img')||!value.includes('banner1-1-690x336'))throw Error('WordPress native image insertion not persisted to selected cell');
 record('IMAGE_INSERTED_NATIVE',{altPresent:/\balt=/.test(value),relativeSrc:/src=["']\/wp-content\/uploads\//.test(value)});
 await page.getByRole('button',{name:/Save Changes/i}).first().click();
 await page.waitForFunction(()=>Boolean(window.tp)&&window.tp.made_changes===false,{timeout:15000});
 const readback=await context.request.get('/wp-json/tablepress/v1/table/home_00',{timeout:25000,failOnStatusCode:false});
 if(!readback.ok())throw Error('ESC Table image readback HTTP '+readback.status());
 const savedText=await readback.text();
 if(!savedText.includes('banner1-1-690x336'))throw Error('ESC Table media not found after native Save');
 record('TABLE_MEDIA_SAVED',{tableId:ID,restStatus:readback.status()});
 // Published shortcode must be inserted via the native Classic Editor button, not via REST/SQL.
 phase='native-shortcode';
 await page.goto(WP+'/wp-admin/post.php?post='+PAGE+'&action=edit',{waitUntil:'domcontentloaded',timeout:45000});
 const textTab=page.locator('#content-html');
 if(await textTab.count())await textTab.click();
 const insert=page.locator('#qt_content_tablepress_quicktags_button');
 await insert.waitFor({state:'visible',timeout:15000});
 await insert.click();
 const dialog=page.frameLocator('#TB_iframeContent');
 const nativeInsert=dialog.locator('a.insert-shortcode[title*="home_00"]').first();
 await nativeInsert.waitFor({state:'visible',timeout:20000});
 await nativeInsert.click();
 await page.waitForTimeout(500);
 const editorValue=await page.locator('#content').inputValue();
 if((editorValue.match(/home_00/g)||[]).length!==1)throw Error('Native shortcode not inserted exactly once');
 await page.locator('#publish').click();
 await page.waitForLoadState('domcontentloaded',{timeout:45000});
 const check=await context.request.get('/wp-json/wp/v2/pages/'+PAGE+'?_fields=id,content',{timeout:30000});
 const home=await check.json();
 const published=String(home.content?.rendered||'');
 if(!published.includes('home_00'))throw Error('Published Page readback did not include ESC Table');
 result.attached=true;
 record('PAGE_NATIVE_INSERT_SAVED',{page:PAGE,tableId:ID});
 await page.screenshot({path:evidence+'/home-editor-after.png',fullPage:false});
 await context.close();
}catch(e){
 record('ERROR',{phase,message:String(e.message||e).slice(0,240)});
 process.exitCode=1;
}finally{
 await save();
 await browser.close();
 console.log('HOME00_RESULT='+JSON.stringify({phase,mediaId:result.mediaId,tableId:result.tableId,attached:result.attached,actions:result.steps.map(x=>x.name)}));
}
