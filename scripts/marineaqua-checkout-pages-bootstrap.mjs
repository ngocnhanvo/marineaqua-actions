import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP = 'https://admin.marine-aqua.io.vn';
const DIR = 'checkout-pages-bootstrap-evidence';
const defs = [
  { slug: 'gio-hang', title:'Giỏ hàng', key:'ssr-cart', action:'CartPage' },
  { slug: 'thanh-toan', title:'Thanh toán', key:'ssr-checkout', action:'CheckoutPage' },
  { slug: 'dat-hang-thanh-cong', title:'Hoàn tất đơn hàng', key:'ssr-checkoutdone', action:'CheckoutDonePage' },
];
const result={ scope:defs.map(x=>x.slug), created:[], reused:[], verified:[], errors:[], cleanup_remaining:[] };
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('WordPress credentials missing');
  const page=await browser.newPage();
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  await page.goto(WP+'/wp-admin/post-new.php?post_type=page',{waitUntil:'domcontentloaded',timeout:45000});
  if(page.url().includes('wp-login.php'))throw Error('No WordPress page permissions');
  const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||(await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'})).text());
  if(!/^[a-zA-Z0-9]{8,32}$/.test(nonce))throw Error('Missing REST nonce');
  async function api(method,path,body) {
    const response=await page.evaluate(async({method,path,body,nonce})=>{
      const r=await fetch(path,{method,credentials:'same-origin',headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      let data;try{data=await r.json()}catch{data=null}
      return{ok:r.ok,status:r.status,data};
    },{method,path,body,nonce});
    if(!response.ok)throw Error(method+' '+path.split('?')[0]+' HTTP '+response.status+' '+String(response.data?.code||''));
    return response.data;
  }
  const pages=[];
  for(let i=1;i<=30;i++){
    let chunk;
    try {chunk=await api('GET','/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&page='+i+'&_fields=id,slug,status,acf,title,content');}
    catch(error){if(i>1&&String(error.message).includes('400'))break;throw error;}
    if(!Array.isArray(chunk))throw Error('Invalid Page inventory');
    pages.push(...chunk);
    if(chunk.length<100)break;
  }
  const touched=[];
  for(const def of defs) {
    const exact=pages.filter(p=>p.slug===def.slug || p.acf?.key===def.key);
    if(exact.length>1)throw Error('Conflicting Page slug/key for '+def.slug);
    const current=exact[0];
    if(current){
      if(current.slug!==def.slug || current.acf?.key!==def.key || current.acf?.action!==def.action || current.status!=='publish'){
        throw Error('Existing Page differs; no automatic overwrite: '+def.slug);
      }
      result.reused.push({id:current.id,slug:def.slug});result.verified.push({id:current.id,slug:def.slug});continue;
    }
    let createdId=null;
    try {
      const draft=await api('POST','/wp-json/wp/v2/pages',{
        title:def.title, slug:def.slug, status:'draft',
        content:'', acf:{key:def.key,action:def.action,product_lang:'vi'}
      });
      createdId=draft?.id;
      if(!Number.isInteger(createdId))throw Error('Draft create returned no Page ID');
      touched.push(createdId);
      const before=await api('GET','/wp-json/wp/v2/pages/'+createdId+'?context=edit');
      if(before.slug!==def.slug||before.acf?.key!==def.key||before.acf?.action!==def.action||before.status!=='draft')throw Error('Draft ACF readback mismatch');
      await api('POST','/wp-json/wp/v2/pages/'+createdId,{status:'publish'});
      const after=await api('GET','/wp-json/wp/v2/pages/'+createdId+'?context=edit');
      if(after.slug!==def.slug||after.acf?.key!==def.key||after.acf?.action!==def.action||after.status!=='publish')throw Error('Publish readback mismatch');
      result.created.push({id:createdId,slug:def.slug});result.verified.push({id:createdId,slug:def.slug});
      touched.splice(touched.indexOf(createdId),1);
    } catch(error) {
      if(createdId){
        try {const deleted=await api('DELETE','/wp-json/wp/v2/pages/'+createdId);if(deleted?.status!=='trash')result.cleanup_remaining.push(createdId);}
        catch{result.cleanup_remaining.push(createdId);}
      }
      throw error;
    }
  }
  if(result.verified.length!==defs.length)throw Error('Not all checkout Page actions verified');
  result.status='PASS';
  console.log('MARINEAQUA_CHECKOUT_PAGES=PASS '+JSON.stringify(result));
}catch(error){
  result.status='FAIL';result.errors.push(String(error?.message||error).slice(0,400));
  process.exitCode=1;console.error('MARINEAQUA_CHECKOUT_PAGES=FAIL '+JSON.stringify(result));
}finally{await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
