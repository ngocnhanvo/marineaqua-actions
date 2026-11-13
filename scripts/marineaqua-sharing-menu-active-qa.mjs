// Canonical public-page URL active state postdeploy QA for run 43360791173.
// Postdeploy verification after canonical active-menu release 43360262840.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const SITE='https://marine-aqua.io.vn',OUT='sharing-nav-active-evidence';
const targets=[
 {slug:'tong-quan-ve-be-ca',label:'Tổng quan về bể cá biển'},
 {slug:'tin-kien-thuc',label:'Tin kiến thức'},
 {slug:'set-up-be-ca-bien-mini',label:'Setup bể cá biển mini'}
];
const result={status:'STARTED',checks:[],errors:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 for(const vp of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const page=await context.newPage();
  await page.setViewportSize({width:vp.width,height:vp.height});
  for(const item of targets){
   const url=SITE+'/cat/'+item.slug;
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   const check=await page.evaluate(({label,mobile})=>{
    const root=document.querySelector(mobile?'#mobile-menu-container':'#desktop-menu');
    const links=[...root?.querySelectorAll('a[href]')||[]];
    const anchor=links.find(a=>a.textContent?.trim()===label);
    const button=[...root?.querySelectorAll('button')||[]].find(b=>b.textContent?.trim()==='Chia sẻ');
    const href=anchor?.getAttribute('href')||'';
    const classes=anchor?.getAttribute('class')||'';
    return {
      href,classes,active:anchor?.getAttribute('aria-current')==='page',
      parentActive:button?.classList.contains('text-[#0B5FA5]')||Boolean(button?.querySelector('.is-active'))||false,
      matchesPath:(new URL(href||'/',location.origin)).pathname==='/cat/'+label,
      viewport:innerWidth,documentWidth:document.documentElement.scrollWidth
    };
   },{label:item.label,mobile:vp.name==='mobile'});
   const hrefOk=check.href&&new URL(check.href,SITE).pathname==='/cat/'+item.slug;
   const pass=response?.status()===200&&hrefOk&&check.active&&check.parentActive&&check.documentWidth<=vp.width+2;
   const row={viewport:vp.name,slug:item.slug,http:response?.status(),hrefOk:Boolean(hrefOk),...check,pass:Boolean(pass)};
   result.checks.push(row);
   if(!pass)result.errors.push(row);
   if(item.slug==='tong-quan-ve-be-ca')await page.screenshot({path:OUT+'/'+vp.name+'.png',fullPage:false});
  }
  await page.close();
 }
 result.status=result.errors.length?'FAIL':'PASS';
 if(result.errors.length)process.exitCode=1;
 console.log('SHARING_NAV_ACTIVE='+JSON.stringify({status:result.status,checks:result.checks.length,errors:result.errors.length}));
}catch(e){result.status='FAIL';result.errors.push({message:String(e.message||e).slice(0,700)});process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
