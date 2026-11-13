// Production header QA after successful canonical deploy 43354941020.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const ROOT='https://marine-aqua.io.vn';
const OUT='sharing-header-visual-evidence';
const slugs=['tin-kien-thuc','tong-quan-ve-be-ca','set-up-be-ca-bien-mini','kinh-nghiem-tri-reu-hai-tao-hai-trong-be-ca','cach-chon-muoi-vi-sinh-va-hoa-chat-tot-nhat-cho-be-ca','cach-chon-thuc-an-tot-cho-ca-va-san-ho','cac-thiet-bi-trong-be-ca-den-skimmer-may-bom'];
const results={status:'STARTED',checks:[],errors:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext();
 for(const viewport of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const page=await context.newPage();
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  for(const slug of slugs){
   const response=await page.goto(ROOT+'/cat/'+slug,{waitUntil:'domcontentloaded',timeout:60000});
   const item=await page.evaluate(()=>{
    const main=document.querySelector('main#main-content');
    const hero=main?.querySelector('section[aria-labelledby="archive-heading"]');
    const h1=hero?.querySelector('h1#archive-heading');
    const search=main?.querySelector('#search-form');
    const grid=main?.querySelector('#posts-grid');
    const rect=(node)=>{const r=node?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};
    return {heading:h1?.textContent?.trim()||'',h1Count:main?.querySelectorAll('h1').length||0,
     hero:rect(hero),headingBox:rect(h1),searchBox:rect(search),grid:rect(grid),
     topLevelText:[...main?.childNodes||[]].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim()).map(n=>n.textContent.trim().slice(0,120)),
     viewport:innerWidth,document:document.documentElement.scrollWidth,
     cards:main?.querySelectorAll('#posts-grid a[href]').length||0};
   });
   const valid=response?.status()===200&&item.heading&&item.h1Count===1&&item.hero&&item.searchBox&&item.grid&&item.cards>0&&
     item.searchBox.y>=item.hero.y+item.hero.height-1&&item.grid.y>=item.searchBox.y&&
     item.headingBox.x>=15&&item.document<=item.viewport+2&&!item.topLevelText.length;
   const row={viewport:viewport.name,slug,http:response?.status(),...item,pass:Boolean(valid)};
   results.checks.push(row);
   if(!valid)results.errors.push({viewport:viewport.name,slug,reason:'archive-hero-layout',row});
   if(slug==='tin-kien-thuc')await page.screenshot({path:OUT+'/tin-kien-thuc-'+viewport.name+'.png',fullPage:false});
   console.log('SHARING_HEADER_VISUAL_CHECK='+JSON.stringify({slug,viewport:viewport.name,pass:row.pass,h1:row.heading,hero:row.hero,search:row.searchBox}));
  }
  await page.close();
 }
 results.status=results.errors.length?'FAIL':'PASS';
 if(results.errors.length)process.exitCode=1;
} catch(e){results.status='FAIL';results.errors.push({error:String(e.message||e).slice(0,500)});process.exitCode=1;}
finally{await writeFile(OUT+'/result.json',JSON.stringify(results,null,2)+'\n');await browser.close()}
