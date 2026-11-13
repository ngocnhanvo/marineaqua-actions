// Postdeployment layout verification for canonical run 43358461460.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const OUT='sharing-unified-toolbar-evidence',SITE='https://marine-aqua.io.vn';
const slugs=['tin-kien-thuc','tong-quan-ve-be-ca','kinh-nghiem-tri-reu-hai-tao-hai-trong-be-ca'];
const report={status:'STARTED',checks:[],errors:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const ctx=await browser.newContext();
 for(const viewport of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const page=await ctx.newPage();
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  for(const slug of slugs){
   const resp=await page.goto(SITE+'/cat/'+slug,{waitUntil:'domcontentloaded',timeout:60000});
   const data=await page.evaluate(()=>{
     const input=document.querySelector('#search-form'),sort=document.querySelector('#post-sort-form');
     const rect=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};
     const main=document.querySelector('#main-content');
     return {search:rect(input),sort:rect(sort),sortValue:document.querySelector('#post-sort')?.value,
       totalLabel:[...main?.querySelectorAll('p')||[]].some(p=>p.textContent?.includes('Tổng cộng')&&p.textContent?.includes('bài viết')),
       viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};
   });
   const pass=resp?.status()===200&&data.search&&data.sort&&!data.totalLabel&&Math.abs(data.search.y-data.sort.y)<3&&
    data.search.x+data.search.width<=data.sort.x+1&&data.scrollWidth<=viewport.width+2&&data.sortValue==='latest';
   report.checks.push({viewport:viewport.name,slug,http:resp?.status(),...data,pass:Boolean(pass)});
   if(!pass)report.errors.push({viewport:viewport.name,slug,message:'Search/sort alignment or total label validation failed'});
   if(slug==='tin-kien-thuc')await page.screenshot({path:OUT+'/'+viewport.name+'.png',fullPage:false});
  }
  await page.close();
 }
 report.status=report.errors.length?'FAIL':'PASS';
 if(report.status==='FAIL')process.exitCode=1;
}catch(e){report.status='FAIL';report.errors.push({error:String(e.message||e).slice(0,700)});process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
