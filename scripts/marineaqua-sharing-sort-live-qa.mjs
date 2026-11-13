// Run after canonical sort-toolbar production deployment 43357439414.
import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const ROOT='https://marine-aqua.io.vn',OUT='sharing-sort-evidence';
const scenarios=[
 {slug:'tin-kien-thuc',count:24},
 {slug:'tong-quan-ve-be-ca',count:5},
 {slug:'kinh-nghiem-tri-reu-hai-tao-hai-trong-be-ca',count:48}
];
const report={status:'STARTED',checks:[],errors:[]};
const must=(test,message)=>{if(!test)throw Error(message)};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 for(const vp of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const page=await context.newPage();
  await page.setViewportSize({width:vp.width,height:vp.height});
  for(const s of scenarios){
   const base=ROOT+'/cat/'+s.slug;
   const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
   must(response?.status()===200,'Archive HTTP not 200: '+base);
   const form=page.locator('#post-sort-form');
   const select=page.locator('#post-sort');
   must(await form.count()===1&&await select.count()===1,'Missing sort selector '+s.slug);
   must((await page.locator('section[aria-label="Sắp xếp danh sách bài viết"]').innerText()).includes(String(s.count)),'Incorrect article count '+s.slug);
   must(await select.inputValue()==='latest','Expected default sort '+s.slug);
   const cards=page.locator('#posts-grid h2');
   must(await cards.count()>0,'Archive cards empty '+s.slug);
   const original=await cards.allTextContents();
   await select.selectOption('title_asc');
   await page.waitForURL(url=>url.searchParams.get('sort')==='title_asc',{timeout:45000});
   const alpha=await page.locator('#posts-grid h2').allTextContents();
   must(await page.locator('#post-sort').inputValue()==='title_asc','Sort selection lost '+s.slug);
   await page.locator('#post-sort').selectOption('title_desc');
   await page.waitForURL(url=>url.searchParams.get('sort')==='title_desc',{timeout:45000});
   const reverse=await page.locator('#posts-grid h2').allTextContents();
   must(alpha.length>0&&reverse.length>0,'Sorted cards empty '+s.slug);
   if(s.count>1)must(alpha[0]!==reverse[0],'Title order did not change '+s.slug);
   const width=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
   must(width.viewport===vp.width&&width.scroll<=vp.width+2,'Viewport/overflow '+vp.name+' '+s.slug);
   report.checks.push({viewport:vp.name,slug:s.slug,articleCount:s.count,originalFirst:original[0],titleAscFirst:alpha[0],titleDescFirst:reverse[0],width,pass:true});
   if(s.slug==='tin-kien-thuc')await page.screenshot({path:OUT+'/sort-'+vp.name+'.png',fullPage:false});
   if(s.count>12){
    const next=page.locator('nav[aria-label="Phân trang"] a[href*="/2"]');
    must(await next.count()>0,'Missing second-page link '+s.slug);
    const href=await next.first().getAttribute('href');
    must(href.includes('sort=title_desc'),'Pagination lost sort '+s.slug);
    const nextResponse=await page.goto(new URL(href,ROOT).href,{waitUntil:'domcontentloaded',timeout:60000});
    must(nextResponse?.status()===200,'Pagination HTTP error '+s.slug);
    must(await page.locator('#post-sort').inputValue()==='title_desc','Pagination changed selected sort '+s.slug);
   }
  }
  await page.close();
 }
 report.status='PASS';
 console.log('MARINEAQUA_SHARING_SORT_QA_PASS='+JSON.stringify({checks:report.checks.length}));
}catch(e){report.status='FAIL';report.errors.push(String(e.message||e).slice(0,700));console.error('MARINEAQUA_SHARING_SORT_QA_FAIL='+report.errors[0]);process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
