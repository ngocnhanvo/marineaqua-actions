import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const OUT='header-information-links-evidence';
const target=[
 {label:'Chính sách đổi trả hàng',href:'/chinh-sach-doi-tra-hang',parent:'Chính sách và hướng dẫn'},
 {label:'Phí ship hàng',href:'/thong-bao',parent:'Chính sách và hướng dẫn'},
 {label:'Hướng dẫn mua hàng ở xa',href:'/huong-dan-mua-hang-o-xa',parent:'Chính sách và hướng dẫn'},
 {label:'Hướng dẫn mua hàng tại nhà',href:'/huong-dan-mua-hang-tai-nha',parent:'Chính sách và hướng dẫn'},
 {label:'Thời gian bán hàng',href:'/thoi-gian-ban-hang',parent:null},
];
const report={status:'STARTED',source:WP,changes:[],targets:target,errors:[]};
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const norm=v=>String(v||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
const path=v=>String(v||'').replace(/^https?:\/\/[^/]+/i,'').replace(/^\/+|\/+$/g,'');
const flatten=(arr,parent=null)=>arr.flatMap(i=>[{...i,parentLabel:parent?.label||null},...flatten(i.children||[],i)]);
const snapshot=arr=>JSON.stringify(flatten(arr).map(i=>[i.id,i.key,i.label,i.href,i.slug,i.linkType,i.parentLabel,i.position]));
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 assert(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'WordPress credentials missing');
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 const load=async()=>{
  const res=await context.request.get(WP+'/wp-json/esc-api/v1/menus',{timeout:35000,failOnStatusCode:false});
  assert(res.ok(),'Header REST API HTTP '+res.status());
  const payload=await res.json();
  const header=payload?.menus?.Header?.vi;
  assert(payload?.success===true&&Array.isArray(header?.items),'WordPress Header VI menu missing');
  return header.items;
 };
 const before=await load();
 const flat=flatten(before);
 report.before=target.map(t=>{
  const candidates=flat.filter(x=>norm(x.label)===norm(t.label));
  assert(candidates.length===1,'Expected one menu item '+t.label+' found '+candidates.length);
  const item=candidates[0];
  assert(norm(item.parentLabel)===norm(t.parent),'Menu parent mismatch for '+t.label+': '+item.parentLabel);
  assert(Number.isSafeInteger(Number(item.id))&&Number(item.id)>0,'Invalid menu item ID for '+t.label);
  return {label:t.label,id:item.id,href:item.href,slug:item.slug,linkType:item.linkType,parent:item.parentLabel};
 });
 const toEdit=target.map((t,i)=>({...t,...report.before[i]})).filter(t=>path(t.href||t.slug)!==path(t.href==='__never__'?'':target.find(e=>e.label===t.label).href));
 report.toEdit=toEdit.map(({id,label,href,slug,linkType})=>({id,label,href,slug,linkType}));
 if(toEdit.length){
  const page=await context.newPage();
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  assert(!page.url().includes('wp-login.php'),'WordPress login failed');
  await page.goto(WP+'/wp-admin/nav-menus.php',{waitUntil:'domcontentloaded',timeout:45000});
  assert(await page.locator('#menu-name').inputValue()==='Marine Aqua Header VI','Wrong selected WordPress nav menu');
  assert(await page.locator('#esc-menu-code').inputValue()==='Header'&&await page.locator('#esc-menu-lang').inputValue()==='vi','Wrong Header menu code or language');
  assert(snapshot(await load())===snapshot(before),'Header changed concurrently; refuse mutation');
  for(const item of toEdit){
   const mode=page.locator('select[name="esc-menu-item-link-type['+item.id+']"]');
   const field=page.locator('input[name="esc-menu-item-custom-url['+item.id+']"]');
   const edit=page.locator('#edit-'+item.id);
   assert(await mode.count()===1&&await field.count()===1&&await edit.count()===1,'Native editor fields missing for '+item.label);
   await edit.click();
   // Set only the URL/type for the existing item, leaving order, caption and parent intact.
   await mode.selectOption('custom');
   await field.fill(item.hrefTarget||target.find(x=>x.label===item.label).href);
  }
  const save=page.locator('#save_menu_footer');
  assert(await save.count()===1,'WordPress native save menu button not found');
  await save.click();
  await page.waitForLoadState('domcontentloaded',{timeout:25000}).catch(()=>{});
  await page.waitForTimeout(700);
  report.changed=true;
  await page.screenshot({path:OUT+'/wordPress-header-after-save.png',fullPage:false});
 }
 const after=await load();
 const afterFlat=flatten(after);
 const changedIds=new Set(toEdit.map(t=>Number(t.id)));
 const untouched=x=>JSON.stringify(flatten(x).filter(i=>!changedIds.has(Number(i.id))).map(i=>[i.id,i.key,i.label,i.href,i.slug,i.linkType,i.parentLabel,i.position]));
 assert(untouched(before)===untouched(after),'Unrelated menu entries changed');
 for(const t of target){
  const item=afterFlat.find(i=>norm(i.label)===norm(t.label));
  assert(item&&path(item.href||item.slug)===path(t.href),'Header destination mismatch '+t.label+' actual '+(item?.href||item?.slug));
  assert(norm(item.parentLabel)===norm(t.parent),'Header hierarchy changed '+t.label);
  report.changes.push({id:item.id,label:item.label,parent:item.parentLabel,url:item.href||item.slug,changed:changedIds.has(Number(item.id))});
 }
 report.status='PASS';
 console.log('MARINEAQUA_HEADER_INFO_LINKS_PASS='+JSON.stringify(report.changes));
}catch(e){
 report.status='FAIL';report.errors.push(String(e.message||e).slice(0,700));
 console.error('MARINEAQUA_HEADER_INFO_LINKS_FAIL='+report.errors.at(-1));
 process.exitCode=1;
}finally{
 await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
