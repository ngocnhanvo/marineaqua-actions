import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn',OUT='sharing-header-evidence';
const targets=[
 {id:82506,label:'Tổng quan về bể cá biển',slug:'tong-quan-ve-be-ca',count:5},
 {id:82507,label:'Setup bể cá biển mini',slug:'set-up-be-ca-bien-mini',count:4},
 {id:82508,label:'Kinh nghiệm xử lý bể cá (rêu hại, tảo hại, bệnh cá, san hô...)',slug:'kinh-nghiem-tri-reu-hai-tao-hai-trong-be-ca',count:48},
 {id:82516,label:'Cách chọn muối, vi sinh và hóa chất tốt nhất cho bể cá',slug:'cach-chon-muoi-vi-sinh-va-hoa-chat-tot-nhat-cho-be-ca',count:36},
 {id:82517,label:'Cách chọn thức ăn tốt cho cá và san hô',slug:'cach-chon-thuc-an-tot-cho-ca-va-san-ho',count:16},
 {id:82518,label:'Tin kiến thức',slug:'tin-kien-thuc',count:24},
 {id:82519,label:'Các thiết bị trong bể cá (đèn, skimmer, máy bơm…)',slug:'cac-thiet-bi-trong-be-ca-den-skimmer-may-bom',count:32}
];
const report={status:'STARTED',results:[],errors:[],modified:false};
const must=(condition,reason)=>{if(!condition)throw Error(reason)};
const canonical=v=>String(v||'').normalize('NFC').replace(/\s+/g,' ').trim();
const route=v=>String(v||'').replace(/^https?:\/\/[^/]+/,'').replace(/^\/+|\/+$/g,'');
const flatten=(nodes,parent=null)=>nodes.flatMap(n=>[{...n,parentLabel:parent?.label||null},...flatten(n.children||[],n)]);
const checksum=(nodes,ignore)=>JSON.stringify(flatten(nodes).filter(n=>!ignore.has(Number(n.id))).map(n=>[n.id,n.key,n.label,n.href,n.slug,n.linkType,n.parentLabel,n.position]));
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 must(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'Missing WordPress credentials');
 const context=await browser.newContext();
 const read=async(path)=>{
  const r=await context.request.get(WP+path,{failOnStatusCode:false,timeout:35000});
  must(r.ok(),'REST HTTP '+r.status()+' '+path);
  return r.json();
 };
 const getMenu=async()=>{
  const response=await read('/wp-json/esc-api/v1/menus');
  must(response?.success===true&&Array.isArray(response.menus?.Header?.vi?.items),'Header VI REST menu missing');
  return response.menus.Header.vi.items;
 };
 // Refuse to publish links until all content is present.
 const posts=await read('/wp-json/wp/v2/posts?status=publish&per_page=1&_fields=id');
 must(Array.isArray(posts),'WordPress Post index unavailable');
 for(const t of targets){
  const categories=await read('/wp-json/wp/v2/categories?slug='+t.slug+'&_fields=id,slug,count');
  must(categories.length===1&&categories[0].slug===t.slug&&Number(categories[0].count)===t.count,'Category Post parity mismatch '+t.slug);
  const pages=await read('/wp-json/wp/v2/pages?status=publish&slug='+t.slug+'&_fields=id,slug,acf');
  must(pages.length===1&&pages[0].acf?.action==='PostsPage'&&(pages[0].acf?.key==='ssr-posts'||(t.slug==='tin-kien-thuc'&&pages[0].acf?.key==='knowledge')),'Published SSR category Page missing '+t.slug);
 }
 // Independent source/target Post parity check: same 133 unique slugs and
 // exact category memberships, without duplicating multi-category articles.
 const listPosts=async(origin)=>{
  const all=[];
  for(let pageNumber=1;pageNumber<=3;pageNumber++){
   const response=await context.request.get(origin+'/wp-json/wp/v2/posts?status=publish&per_page=100&page='+pageNumber+'&_fields=id,slug,categories',{timeout:45000,failOnStatusCode:false});
   must(response.ok(),'Post inventory HTTP '+response.status()+' '+origin+' page '+pageNumber);
   const items=await response.json();
   must(Array.isArray(items),'Post inventory malformed '+origin);
   all.push(...items);
   if(items.length<100)break;
  }
  return all;
 };
 const [sourcePosts,targetPosts,sourceTerms,targetTerms]=await Promise.all([
  listPosts('https://marine-aqua.vn'),listPosts(WP),
  context.request.get('https://marine-aqua.vn/wp-json/wp/v2/categories?per_page=100&_fields=id,slug').then(r=>{must(r.ok(),'Source terms HTTP '+r.status());return r.json()}),
  read('/wp-json/wp/v2/categories?per_page=100&_fields=id,slug')
 ]);
 must(sourcePosts.length===133&&targetPosts.length===133,'Published Post inventory count mismatch source='+sourcePosts.length+' target='+targetPosts.length);
 const sourceCatById=new Map(sourceTerms.map(t=>[t.id,t.slug]));
 const targetCatById=new Map(targetTerms.map(t=>[t.id,t.slug]));
 const sourceIndex=new Map(sourcePosts.map(p=>[p.slug,p]));
 const targetIndex=new Map(targetPosts.map(p=>[p.slug,p]));
 must(sourceIndex.size===133&&targetIndex.size===133,'Duplicate slug in source or target Posts');
 for(const [slug,post] of sourceIndex){
  const target=targetIndex.get(slug);
  must(target,'Missing published Post slug '+slug);
  const a=post.categories.map(id=>sourceCatById.get(id)).sort();
  const b=target.categories.map(id=>targetCatById.get(id)).sort();
  must(JSON.stringify(a)===JSON.stringify(b),'Post taxonomy membership differs '+slug);
 }
 report.postsParity={unique:133,memberships:'PASS'};
 const before=await getMenu(),flat=flatten(before);
 const ignore=new Set(targets.map(t=>t.id));
 const savedChecksum=checksum(before,ignore);
 const edits=[];
 for(const t of targets){
  const candidates=flat.filter(item=>Number(item.id)===t.id);
  must(candidates.length===1,'Missing Header item '+t.id);
  must(canonical(candidates[0].label)===canonical(t.label),'Header label differs '+t.id);
  must(canonical(candidates[0].parentLabel)==='Chia sẻ','Header parent not Chia sẻ '+t.id);
  const desired='cat/'+t.slug;
  if(route(candidates[0].href||candidates[0].slug)!==desired)edits.push({...t,destination:desired});
 }
 if(edits.length){
  const page=await context.newPage();
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  must(!page.url().includes('wp-login.php'),'WordPress login failure');
  await page.goto(WP+'/wp-admin/nav-menus.php',{waitUntil:'domcontentloaded',timeout:45000});
  must(await page.locator('#menu-name').inputValue()==='Marine Aqua Header VI','Wrong native Header menu selected');
  must(await page.locator('#esc-menu-code').inputValue()==='Header'&&await page.locator('#esc-menu-lang').inputValue()==='vi','Wrong menu code/locale');
  must(checksum(await getMenu(),ignore)===savedChecksum,'Concurrent Header edit outside scope');
  for(const item of edits){
   await page.locator('#edit-'+item.id).evaluate(node=>node.click());
   await page.evaluate(({id,url})=>{
    const select=document.querySelector('select[name="esc-menu-item-link-type['+id+']"]');
    const field=document.querySelector('input[name="esc-menu-item-custom-url['+id+']"]');
    if(!(select instanceof HTMLSelectElement)||!(field instanceof HTMLInputElement))throw Error('Missing native edit fields '+id);
    if(![...select.options].some(option=>option.value==='custom'))throw Error('Unsupported custom link type');
    select.value='custom';select.dispatchEvent(new Event('change',{bubbles:true}));
    field.value='/'+url;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
   },{id:item.id,url:item.destination});
  }
  await page.locator('#save_menu_footer').click();
  await page.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{});
  report.modified=true;
  await page.screenshot({path:OUT+'/header-native-after.png'});
 }
 const after=await getMenu();
 must(checksum(after,ignore)===savedChecksum,'Unrelated Header items changed');
 for(const t of targets){
  const item=flatten(after).find(x=>Number(x.id)===t.id);
  must(item&&route(item.href||item.slug)==='cat/'+t.slug,'Saved Header URL mismatch '+t.id);
  must(canonical(item.parentLabel)==='Chia sẻ','Header hierarchy changed '+t.id);
  report.results.push({id:t.id,label:item.label,slug:t.slug,url:item.href||item.slug,postCount:t.count});
 }
 report.status='PASS';
 console.log('SHARING_HEADER_PASS='+JSON.stringify(report.results));
}catch(e){report.status='FAIL';report.errors.push(String(e.message||e).slice(0,600));console.error('SHARING_HEADER_FAIL='+report.errors.at(-1));process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
