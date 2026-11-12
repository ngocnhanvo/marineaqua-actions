import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const SITE='https://marine-aqua.io.vn';
const DIR='information-pages-live-evidence';
const targets=[
 {slug:'chinh-sach-doi-tra-hang',title:'Chính sách đổi trả hàng'},
 {slug:'thong-bao',title:'Phí ship hàng'},
 {slug:'huong-dan-mua-hang-o-xa',title:'Hướng dẫn mua hàng ở xa'},
 {slug:'huong-dan-mua-hang-tai-nha',title:'Hướng dẫn mua hàng tại nhà'},
 {slug:'thoi-gian-ban-hang',title:'Thời gian bán hàng'},
];
await mkdir(DIR,{recursive:true});
const result={site:SITE,records:[],failures:[]};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 for (const target of targets){
  const row={...target};
  try{
   const page=await context.newPage();
   const response=await page.goto(SITE+'/'+target.slug,{waitUntil:'domcontentloaded',timeout:55000});
   row.status=response?.status();
   row.url=page.url();
   const details=await page.evaluate(()=>{
     const main=document.querySelector('main#main-content');
     const info=document.querySelector('.marine-information-content');
     return {h1:main?.querySelector('h1')?.textContent?.trim()||'',bodyLength:(info?.textContent||'').trim().length,
       htmlWidth:document.documentElement.scrollWidth,viewportWidth:window.innerWidth,
       listing:Boolean(document.querySelector('#search-form'))};
   });
   Object.assign(row,details);
   if(row.status!==200 || !row.bodyLength || row.bodyLength<85 || !row.h1 || row.listing)throw Error('Invalid informational page rendering');
   await page.screenshot({path:DIR+'/'+target.slug+'-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:DIR+'/'+target.slug+'-mobile.png',fullPage:true});
   row.mobile=await page.evaluate(()=>({width:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
   if(row.mobile.scrollWidth>row.mobile.width+2)throw Error('Mobile horizontal overflow');
   row.verdict='PASS';
   await page.close();
  }catch(e){row.verdict='FAIL';row.error=String(e.message||e).slice(0,260);result.failures.push(row)}
  result.records.push(row);
  console.log('MARINEAQUA_INFORMATION_LIVE_QA='+JSON.stringify(row));
 }
 if(result.failures.length)process.exitCode=1;
}finally{
 await writeFile(DIR+'/result.json',JSON.stringify(result,null,2)+'\n');
 await browser.close();
}
