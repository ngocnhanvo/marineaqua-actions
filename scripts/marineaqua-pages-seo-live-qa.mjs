import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn', FRONT='https://marine-aqua.io.vn', OUT='pages-seo-live-qa';
const report={status:'STARTED',pages:[],errors:[]};await mkdir(OUT,{recursive:true});
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const readHead=()=>({title:document.title,description:document.querySelector('meta[name="description"]')?.content||'',canonical:document.querySelector('link[rel="canonical"]')?.href||'',h1:[...document.querySelectorAll('h1')].map(x=>(x.innerText||x.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean),robots:document.querySelector('meta[name="robots"]')?.content||''});
const routeFor=p=>{
 const key=String(p.acf?.key||'');
 if(key==='home')return '/';
 if(key==='ssr-cart')return '/ssr/cart/'+p.slug;
 if(key==='ssr-posts'||(key==='knowledge'&&p.slug==='tin-kien-thuc'))return '/cat/'+p.slug;
 return '/'+p.slug;
};
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1366,height:900}});
 const api=await ctx.request.get(WP+'/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,status,title,acf,yoast_head_json');
 if(!api.ok())throw Error('WordPress Page API HTTP '+api.status());
 const pages=await api.json();if(!Array.isArray(pages))throw Error('Page API invalid payload');
 if(pages.length!==19)throw Error('Expected 19 published Pages, received '+pages.length);
 const page=await ctx.newPage();
 for(const p of pages){
  const rec={id:p.id,slug:p.slug,key:p.acf?.key||'',action:p.acf?.action||'',route:routeFor(p),issues:[]};
  try{
   const res=await page.goto(FRONT+rec.route,{waitUntil:'domcontentloaded',timeout:30000});
   rec.http=res?.status()||0;rec.finalUrl=page.url();
   if(rec.http!==200)rec.issues.push('HTTP_'+rec.http);
   if(rec.http===200){
    rec.head=await page.evaluate(readHead);
    rec.wpSeoTitle=p.yoast_head_json?.title||'';
    rec.wpSeoDescription=p.yoast_head_json?.description||'';
    if(!rec.head.title)rec.issues.push('TITLE_EMPTY');
    if(!rec.head.description)rec.issues.push('DESCRIPTION_EMPTY');
    if(/\[table\s/i.test(rec.head.description))rec.issues.push('DESCRIPTION_HAS_SHORTCODE');
    if(!rec.head.canonical.startsWith(FRONT+'/')&&!rec.head.canonical.endsWith(FRONT))rec.issues.push('CANONICAL_WRONG');
    if(rec.wpSeoTitle&&normalize(rec.head.title)!==normalize(rec.wpSeoTitle))rec.issues.push('TITLE_NOT_MATCH_WP_YOAST');
    if(rec.wpSeoDescription&&normalize(rec.head.description)!==normalize(rec.wpSeoDescription))rec.issues.push('DESCRIPTION_NOT_MATCH_WP_YOAST');
    if(rec.head.h1.length!==1)rec.issues.push('H1_COUNT_'+rec.head.h1.length);
    rec.h1MatchesPageTitle=rec.head.h1.some(h=>normalize(h)===normalize(p.title?.rendered));
   }
   if(rec.key==='ssr-posts'||rec.key==='knowledge'){
    rec.alternativeRoutes=[];
    for(const alt of ['/cat/'+p.slug,'/ssr/posts/'+p.slug+'/1','/'+p.slug]){
     if(alt===rec.route)continue;
     const response=await ctx.request.get(FRONT+alt,{timeout:20000,maxRedirects:3});
     rec.alternativeRoutes.push({route:alt,status:response.status(),finalUrl:response.url()});
    }
   }
  }catch(e){rec.issues.push('ERROR');rec.error=String(e.message||e).slice(0,220)}
  rec.verdict=rec.issues.length?'REVIEW':'PASS';report.pages.push(rec);
  console.log('PAGES_SEO_LIVE_QA='+JSON.stringify(rec));
 }
 report.summary={total:pages.length,pass:report.pages.filter(x=>x.verdict==='PASS').length,review:report.pages.filter(x=>x.verdict!=='PASS').length,route404:report.pages.filter(x=>x.issues.some(i=>i.startsWith('HTTP_'))).length};
 report.status=report.summary.review?'QA_FAILED':'QA_PASS';
 console.log('PAGES_SEO_LIVE_QA_SUMMARY='+JSON.stringify(report.summary));
 if(report.status!=='QA_PASS')process.exitCode=1;
 await ctx.close();
}catch(e){report.status='FAIL';report.errors.push(String(e.stack||e).slice(0,1000));process.exitCode=1;console.error('PAGES_SEO_LIVE_QA_FAIL='+String(e.message||e).slice(0,250))}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
