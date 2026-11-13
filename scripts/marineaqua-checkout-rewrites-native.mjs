import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn', DIR='checkout-rewrites-evidence';
const routes=[
  {from:'/gio-hang',to:'/ssr/cart/gio-hang',key:'ssr-cart'},
  {from:'/thanh-toan',to:'/ssr/cart/thanh-toan',key:'ssr-checkout'},
  {from:'/dat-hang-thanh-cong',to:'/ssr/cart/dat-hang-thanh-cong',key:'ssr-checkoutdone'},
];
const result={scope:routes,created:[],reused:[],verified:[],cleanup_remaining:[],errors:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('WordPress credentials missing');
  const page=await browser.newPage();
  await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator('#wp-submit').click();
  await page.goto(WP+'/wp-admin/post-new.php?post_type=chuyen-huong-link',{waitUntil:'domcontentloaded',timeout:45000});
  if(page.url().includes('wp-login.php'))throw Error('WordPress redirect permission denied');
  const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||(await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'})).text());
  if(!/^[a-zA-Z0-9]{8,32}$/.test(nonce))throw Error('Invalid WordPress REST nonce');
  async function api(method,path,body){
    const response=await page.evaluate(async({method,path,body,nonce})=>{
      const res=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},body:body===undefined?undefined:JSON.stringify(body)});
      let data;try{data=await res.json()}catch{data=null}
      return{ok:res.ok,status:res.status,data};
    },{method,path,body,nonce});
    if(!response.ok)throw Error(method+' '+path.split('?')[0]+' HTTP '+response.status+' '+String(response.data?.code||''));
    return response.data;
  }
  const pages=[];
  for(let n=1;n<=20;n++){
    let arr;
    try{arr=await api('GET','/wp-json/wp/v2/pages?context=edit&status=any&per_page=100&page='+n+'&_fields=id,slug,acf,status');}
    catch(e){if(n>1&&String(e.message).includes('400'))break;throw e;}
    if(!Array.isArray(arr))throw Error('Invalid Page response');
    pages.push(...arr);if(arr.length<100)break;
  }
  for(const route of routes){
    const matches=pages.filter(p=>p.slug===route.from.slice(1)&&p.acf?.key===route.key&&p.status==='publish');
    if(matches.length!==1)throw Error('Required WordPress Page missing '+route.from);
  }
  const existing=[];
  for(let n=1;n<=20;n++){
    let arr;
    try{arr=await api('GET','/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page='+n+'&_fields=id,status,acf');}
    catch(e){if(n>1&&String(e.message).includes('400'))break;throw e;}
    if(!Array.isArray(arr))throw Error('Invalid Redirect response');
    existing.push(...arr);if(arr.length<100)break;
  }
  for(const route of routes){
    const matches=existing.filter(r=>r.acf?.from_link===route.from);
    if(matches.length>1)throw Error('Duplicate redirect '+route.from);
    const previous=matches[0];
    if(previous){
      if(previous.status!=='publish'||previous.acf?.to_link!==route.to||String(previous.acf?.type).toLowerCase()!=='rewrite'||String(previous.acf?.match_type).toLowerCase()!=='exact'||!previous.acf?.enable)throw Error('Conflicting redirect '+route.from);
      result.reused.push(previous.id);result.verified.push(previous.id);continue;
    }
    let id=null;
    try{
      const created=await api('POST','/wp-json/wp/v2/chuyen-huong-link',{
        title:'Marine Aqua WooCommerce '+route.key+' route',
        status:'draft',
        acf:{enable:true,from_link:route.from,to_link:route.to,type:'Rewrite',match_type:'Exact'}
      });
      id=created?.id;
      if(!Number.isInteger(id))throw Error('No redirect ID');
      const draft=await api('GET','/wp-json/wp/v2/chuyen-huong-link/'+id+'?context=edit');
      if(draft.acf?.from_link!==route.from||draft.acf?.to_link!==route.to||String(draft.acf?.type).toLowerCase()!=='rewrite'||!draft.acf?.enable)throw Error('Draft redirect mismatch');
      await api('POST','/wp-json/wp/v2/chuyen-huong-link/'+id,{status:'publish'});
      const published=await api('GET','/wp-json/wp/v2/chuyen-huong-link/'+id+'?context=edit');
      if(published.status!=='publish'||published.acf?.from_link!==route.from||published.acf?.to_link!==route.to||!published.acf?.enable)throw Error('Published redirect mismatch');
      result.created.push(id);result.verified.push(id);
    }catch(e){
      if(id){try{const d=await api('DELETE','/wp-json/wp/v2/chuyen-huong-link/'+id);if(d.status!=='trash')result.cleanup_remaining.push(id);}catch{result.cleanup_remaining.push(id);}}
      throw e;
    }
  }
  result.status=result.verified.length===3?'PASS':'FAIL';
  if(result.status!=='PASS')throw Error('Not all route readbacks passed');
  console.log('MARINEAQUA_CHECKOUT_REWRITES=PASS '+JSON.stringify(result));
}catch(e){result.status='FAIL';result.errors.push(String(e?.message||e).slice(0,400));process.exitCode=1;console.error('MARINEAQUA_CHECKOUT_REWRITES=FAIL '+JSON.stringify(result));}
finally{await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
