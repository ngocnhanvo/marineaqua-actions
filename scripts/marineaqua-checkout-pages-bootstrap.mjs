import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const DIR = 'checkout-pages-bootstrap-evidence';
const args = process.argv.slice(2);
if(args.length && !(args.length===1 && args[0]==='--scope=account'))throw Error('Supported argument: --scope=account; omit for the original commerce Pages');
const mode = args.length ? 'account' : 'commerce';
const commerceDefs = [
  { slug: 'gio-hang', title:'Giỏ hàng', key:'ssr-cart', action:'CartPage' },
  { slug: 'thanh-toan', title:'Thanh toán', key:'ssr-checkout', action:'CheckoutPage' },
  { slug: 'dat-hang-thanh-cong', title:'Hoàn tất đơn hàng', key:'ssr-checkoutdone', action:'CheckoutDonePage' },
];
const accountDef = {slug:'tai-khoan',title:'Tài khoản',key:'account',action:'AccountPage'};
const defs = mode==='account' ? [accountDef] : commerceDefs;
const result={
  mode,scope:defs.map(x=>x.slug),
  write_scope:{post_type:'page',max_records:defs.length,keys:defs.map(x=>x.key),slugs:defs.map(x=>x.slug)},
  preflight:null,inventory:null,requests:[],created_drafts:[],created:[],reused:[],verified:[],cleaned_up:[],
  changed:0,skipped_unchanged:0,temporary_created:0,errors:[],cleanup_remaining:[]
};
const ownedIds = new Set();
let accountCreateAttempted = false;
const safeError = error => {
  let value=String(error?.message||error);
  for(const secret of [process.env.WP_ADMIN_USERNAME,process.env.WP_ADMIN_PASSWORD]){
    if(secret)value=value.split(secret).join('[REDACTED]');
  }
  return value.slice(0,500);
};
const langValue = value => typeof value==='string' ? value : value?.value;
const normalized = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
function accountCandidate(page){
  const keys=['account','myaccount','my-account','orderhistory','login','profile'];
  const slugs=['tai-khoan','my-account','myaccount','account','dang-nhap','login','lich-su-don-hang','order-history','thong-tin-tai-khoan'];
  const titles=['tai khoan','dang nhap','account','my account','login','lich su don hang','lich su mua hang','order history','thong tin tai khoan'];
  return keys.includes(String(page.acf?.key||'').toLowerCase()) ||
    ['accountpage','orderhistorypage'].includes(String(page.acf?.action||'').toLowerCase()) ||
    slugs.includes(page.slug) || titles.includes(normalized(page.title?.raw||page.title?.rendered));
}
function metadata(page){
  return{id:page.id,slug:page.slug,status:page.status,title:page.title?.raw||page.title?.rendered||'',key:page.acf?.key||'',action:page.acf?.action||'',lang:langValue(page.acf?.product_lang)||''};
}
function verifyPage(page,def,status){
  if(page.slug!==def.slug || page.acf?.key!==def.key || page.acf?.action!==def.action || page.status!==status)throw Error('Page identity/action/status readback mismatch: '+def.slug);
  if(mode==='account'){
    if(langValue(page.acf?.product_lang)!=='vi')throw Error('Account Page language readback must be vi');
    if(String(page.title?.raw||page.title?.rendered||'').normalize('NFC')!==def.title)throw Error('Account Page title differs; no automatic overwrite');
    if(typeof page.content?.raw!=='string' || page.content.raw.trim()!=='')throw Error('Account Page content is not empty; no automatic overwrite');
  }
}
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('WordPress credentials missing');
  const page=await browser.newPage();
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  // The listing is read-only; visiting post-new.php can create an auto-draft.
  await page.goto(WP+'/wp-admin/edit.php?post_type=page',{waitUntil:'domcontentloaded',timeout:45000});
  if(page.url().includes('wp-login.php'))throw Error('No WordPress page permissions');
  const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||(await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin',signal:AbortSignal.timeout(15000)})).text());
  if(!/^[a-zA-Z0-9]{8,32}$/.test(nonce))throw Error('Missing REST nonce');
  async function api(method,path,body) {
    if(mode==='account' && method!=='GET'){
      if(method==='POST' && path==='/wp-json/wp/v2/pages'){
        if(accountCreateAttempted)throw Error('Account WRITE_SCOPE permits at most one Page creation');
        if(body?.slug!==accountDef.slug || body?.title!==accountDef.title || body?.status!=='draft' || body?.content!=='' ||
          body?.acf?.key!==accountDef.key || body?.acf?.action!==accountDef.action || body?.acf?.product_lang!=='vi')throw Error('Account create payload exceeds WRITE_SCOPE');
        accountCreateAttempted=true;
      }else{
        const match=path.match(/^\/wp-json\/wp\/v2\/pages\/(\d+)$/);
        if(!match || !ownedIds.has(Number(match[1])))throw Error('Account WRITE_SCOPE refuses writes to an existing or unrelated record');
        if(method==='POST' && !(body?.status==='publish' && Object.keys(body).length===1))throw Error('Account WRITE_SCOPE only permits publish after creation');
        if(method!=='POST' && method!=='DELETE')throw Error('Account WRITE_SCOPE method is not allowed');
      }
    }
    const request={method,path:path.split('?')[0],http:null};
    result.requests.push(request);
    const started=Date.now();
    const response=await page.evaluate(async({method,path,body,nonce})=>{
      const r=await fetch(path,{method,credentials:'same-origin',headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
      let data;try{data=await r.json()}catch{data=null}
      return{ok:r.ok,status:r.status,data};
    },{method,path,body,nonce});
    request.http=response.status;
    request.elapsed_ms=Date.now()-started;
    if(!response.ok)throw Error(method+' '+path.split('?')[0]+' HTTP '+response.status+' '+String(response.data?.code||''));
    return response.data;
  }
  if(mode==='account'){
    // REST route metadata only: never submit credentials or read customer data.
    const index=await api('GET','/wp-json');
    const route=index?.routes?.['/custom/v1/login'];
    const methodNames=value=>Array.isArray(value)?value:
      value && typeof value==='object'?Object.keys(value).filter(key=>value[key]):
      typeof value==='string'?value.split(/[,\s]+/):[];
    const methods=[...new Set([
      ...methodNames(route?.methods),
      ...(Array.isArray(route?.endpoints)?route.endpoints.flatMap(endpoint=>methodNames(endpoint?.methods)):[])
    ].map(method=>String(method).toUpperCase()).filter(Boolean))].sort();
    result.preflight={login:{path:'/custom/v1/login',routePresent:Boolean(route),methods,postSupported:methods.includes('POST')}};
  }
  const pages=[];
  let inventoryComplete=false;
  for(let i=1;i<=30;i++){
    let chunk;
    try {chunk=await api('GET','/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&page='+i+'&_fields=id,slug,status,acf,title');}
    catch(error){if(i>1&&String(error.message).includes('rest_post_invalid_page_number')){inventoryComplete=true;break;}throw error;}
    if(!Array.isArray(chunk))throw Error('Invalid Page inventory');
    pages.push(...chunk);
    if(chunk.length<100){inventoryComplete=true;break;}
  }
  if(!inventoryComplete)throw Error('Page inventory exceeded its bound; refusing to create from a partial inventory');
  const candidates=mode==='account'?pages.filter(accountCandidate):[];
  result.inventory={complete:true,status:'any',pages_read:pages.length,account_candidates:candidates.map(metadata)};
  if(mode==='account' && !result.preflight?.login?.postSupported)throw Error('Account prerequisite missing: REST route /custom/v1/login must register POST; no Page was created');
  if(mode==='account' && (candidates.length>1 || (candidates.length===1 && candidates[0].slug!==accountDef.slug && candidates[0].acf?.key!==accountDef.key))){
    throw Error('Existing account/login Page candidates need reconciliation; no duplicate Page will be created');
  }
  for(const def of defs) {
    const exact=pages.filter(p=>p.slug===def.slug || p.acf?.key===def.key);
    if(exact.length>1)throw Error('Conflicting Page slug/key for '+def.slug);
    const current=exact[0];
    if(current){
      if(current.slug!==def.slug || current.acf?.key!==def.key || current.acf?.action!==def.action || current.status!=='publish'){
        throw Error('Existing Page differs; no automatic overwrite: '+def.slug);
      }
      if(mode==='account')verifyPage(await api('GET','/wp-json/wp/v2/pages/'+current.id+'?context=edit'),def,'publish');
      result.skipped_unchanged++;
      result.reused.push({id:current.id,slug:def.slug});result.verified.push({id:current.id,slug:def.slug});continue;
    }
    let createdId=null;
    try {
      const draft=await api('POST','/wp-json/wp/v2/pages',{
        title:def.title, slug:def.slug, status:'draft',
        content:'', acf:{key:def.key,action:def.action,product_lang:'vi'}
      });
      createdId=draft?.id;
      if(!Number.isInteger(createdId)||createdId<=0)throw Error('Draft create returned no Page ID');
      if(mode==='account' && pages.some(existing=>existing.id===createdId))throw Error('Create response reused a pre-existing Page ID; refusing ownership or further writes');
      ownedIds.add(createdId);
      result.created_drafts.push({id:createdId,slug:def.slug});
      const before=await api('GET','/wp-json/wp/v2/pages/'+createdId+'?context=edit');
      verifyPage(before,def,'draft');
      await api('POST','/wp-json/wp/v2/pages/'+createdId,{status:'publish'});
      const after=await api('GET','/wp-json/wp/v2/pages/'+createdId+'?context=edit');
      verifyPage(after,def,'publish');
      result.created.push({id:createdId,slug:def.slug});result.verified.push({id:createdId,slug:def.slug});
      result.changed++;
    } catch(error) {
      if(createdId && ownedIds.has(createdId)){
        try {
          const deleted=await api('DELETE','/wp-json/wp/v2/pages/'+createdId);
          if(deleted?.status!=='trash')throw Error('Cleanup did not trash the owned Page');
          const cleanupReadback=await api('GET','/wp-json/wp/v2/pages/'+createdId+'?context=edit');
          if(cleanupReadback.status!=='trash')throw Error('Cleanup trash readback failed');
          result.cleaned_up.push({id:createdId,status:'trash'});
        }catch(cleanupError){
          result.cleanup_remaining.push(createdId);
          result.errors.push('CLEANUP_FAILED: '+safeError(cleanupError));
        }
      }else if(mode==='account' && accountCreateAttempted){
        result.cleanup_remaining.push({slug:def.slug,id:null,reason:'Create outcome has no confirmed Page ID; reconcile authenticated inventory before retry'});
      }
      throw error;
    }
  }
  if(result.verified.length!==defs.length)throw Error('Not all Page actions in the selected scope were verified');
  result.status='PASS';
  console.log('MARINEAQUA_CHECKOUT_PAGES=PASS '+JSON.stringify(result));
}catch(error){
  result.status='FAIL';result.errors.push(safeError(error));
  process.exitCode=1;console.error('MARINEAQUA_CHECKOUT_PAGES=FAIL '+JSON.stringify(result));
}finally{await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close();}

