import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const DIR='home-builder-ui-evidence';
await mkdir(DIR,{recursive:true});
const out={status:'STARTED',screens:[],forms:{},builder:{},errors:[]};
const browser=await chromium.launch({headless:true});
try{
  const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage();
  const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
  if(!user||!pass)throw Error('Missing existing admin credentials');
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(user);
  await page.locator('#user_pass').fill(pass);
  await page.locator('#wp-submit').click({timeout:25000});
  if(page.url().includes('wp-login.php'))throw Error('WordPress login failed');
  await page.goto(WP+'/wp-admin/admin.php?page=tablepress&action=edit&table_id=home_00',
    {waitUntil:'domcontentloaded',timeout:45000});
  out.forms.editorUrl=page.url().split('?')[0];
  out.forms.buttons=await page.locator('button,input[type="button"],input[type="submit"],a').evaluateAll(els=>els
    .filter(el=>/column|row|save changes|table manip|insert|delete|cột|dòng|lưu thay đổi/i.test(
       String(el.textContent||'')+' '+String(el.getAttribute('value')||'')+' '+String(el.getAttribute('title')||'')+
       ' '+String(el.getAttribute('aria-label')||'')))
    .slice(0,100).map(el=>({tag:el.tagName,id:el.id,name:el.getAttribute('name'),
       text:String(el.textContent||el.getAttribute('value')||'').trim().slice(0,90),
       title:el.getAttribute('title'),className:String(el.className||'').slice(0,120)})));
  out.forms.tableStructure=await page.evaluate(()=>{
    const tp=window.tp;
    return {rows:Array.isArray(tp?.table?.data)?tp.table.data.length:null,
      columns:Array.isArray(tp?.table?.data?.[0])?tp.table.data[0].length:null,
      canSet:Boolean(tp?.editor?.setValueFromCoords),
      firstRow:Array.isArray(tp?.table?.data?.[0])?tp.table.data[0].map(x=>String(x||'').slice(0,90)):[],
      tableActions:Object.keys(tp?.table||{}).filter(key=>/row|col|data/i.test(key)).slice(0,40),
      editorActions:Object.keys(tp?.editor||{}).filter(key=>/row|col|insert|delete|save/i.test(key)).slice(0,40),
      insertColumnSignature:String(tp?.editor?.insertColumn||'').slice(0,2200),
      getSelectedColumnsSignature:String(tp?.editor?.getSelectedColumns||'').slice(0,1400),
      tableControls:[...document.querySelectorAll('button')].filter(el=>/Insert|Delete/i.test(el.textContent||'')).map(el=>({text:el.textContent?.trim(),outer:el.outerHTML.slice(0,500)})).slice(0,10)};
  });
  await page.screenshot({path:DIR+'/home00-editor.png',fullPage:false});
  await page.goto(WP+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page=82454',
    {waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(2500);
  out.builder.url=page.url().split('?')[0];
  out.builder.pageTitle=await page.title();
  out.builder.frames=await page.locator('iframe').evaluateAll(els=>els.map(el=>({
    id:el.id,title:el.getAttribute('title'),src:(el.getAttribute('src')||'').split('?')[0].slice(0,190)
  })).slice(0,15));
  out.builder.buttons=await page.locator('button,input[type="button"],input[type="submit"],a').evaluateAll(els=>els
   .filter(el=>{const text=String(el.textContent||'')+' '+String(el.getAttribute('value')||'')+' '+
     String(el.getAttribute('title')||'');return /lưu|save|sửa|edit|text|chọn|select|ảnh|image|section|bảng|table|banner|home_/i.test(text);})
   .slice(0,90).map(el=>({tag:el.tagName,id:el.id,
     text:String(el.textContent||el.getAttribute('value')||'').trim().slice(0,80),
     title:el.getAttribute('title'),className:String(el.className||'').slice(0,100)})));
  out.builder.iframeCount=out.builder.frames?.length||0;
  out.builder.bodyExcerpt=(await page.locator('body').innerText()).slice(0,5000);
  out.builder.inputs=await page.locator('input,select,textarea').evaluateAll(els=>els.slice(0,55)
    .map(el=>({tag:el.tagName,id:el.id,name:el.getAttribute('name'),placeholder:el.getAttribute('placeholder'),
      type:el.getAttribute('type')})));
  await page.screenshot({path:DIR+'/visual-builder.png',fullPage:false});
  out.status='PASS_READ_ONLY';
  await ctx.close();
}catch(e){out.status='FAIL';out.errors.push(String(e.message||e).slice(0,250));process.exitCode=1;}
finally{
  await browser.close();
  await writeFile(DIR+'/result.json',JSON.stringify(out,null,2)+'\n');
  console.log('MARINEAQUA_HOME_BUILDER_UI='+JSON.stringify({
    status:out.status,forms:out.forms,builder:{
      url:out.builder.url,frames:out.builder.frames,buttons:out.builder.buttons?.slice(0,30),
      bodyExcerpt:out.builder.bodyExcerpt?.slice(0,1700)
    },errors:out.errors}));
}
