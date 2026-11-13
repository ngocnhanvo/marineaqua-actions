import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const HOST='https://marine-aqua.io.vn',OUT='sharing-live-qa-evidence';
const targets=[
 ['Tổng quan về bể cá biển','tong-quan-ve-be-ca',5],
 ['Setup bể cá biển mini','set-up-be-ca-bien-mini',4],
 ['Kinh nghiệm xử lý bể cá (rêu hại, tảo hại, bệnh cá, san hô...)','kinh-nghiem-tri-reu-hai-tao-hai-trong-be-ca',48],
 ['Cách chọn muối, vi sinh và hóa chất tốt nhất cho bể cá','cach-chon-muoi-vi-sinh-va-hoa-chat-tot-nhat-cho-be-ca',36],
 ['Cách chọn thức ăn tốt cho cá và san hô','cach-chon-thuc-an-tot-cho-ca-va-san-ho',16],
 ['Tin kiến thức','tin-kien-thuc',24],
 ['Các thiết bị trong bể cá (đèn, skimmer, máy bơm…)','cac-thiet-bi-trong-be-ca-den-skimmer-may-bom',32]
];
const samples=[
 'muoi-bien-cho-be-ca-canh-tropic-marin-pro-reef-20-kg-box',
 'cac-phuong-phap-loc-trong-be-ca-canh',
 'cac-thong-so-nuoc-danh-cho-be-ca-nuoc-man'
];
const normalize=t=>String(t||'').trim().normalize('NFC').replace(/\s+/g,' ').toLocaleLowerCase('vi');
const assert=(yes,msg)=>{if(!yes)throw Error(msg)};
const result={status:'STARTED',views:[],pages:[],articles:[],errors:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext();
 for(const view of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const page=await ctx.newPage();
  await page.setViewportSize({width:view.width,height:view.height});
  const home=await page.goto(HOST+'/',{waitUntil:'domcontentloaded',timeout:60000});
  assert(home?.status()===200,'Home HTTP status at '+view.name);
  const anchors=await page.locator('a[href]').evaluateAll(links=>links.map(a=>({
    text:(a.textContent||'').replace(/\s+/g,' ').trim(),
    path:new URL(a.href,location.href).pathname.replace(/\/+$/,''),
    inNav:Boolean(a.closest('header,nav,[role="navigation"]'))
  })));
  const found=[];
  for(const [label,slug] of targets){
   const candidate=anchors.filter(a=>normalize(a.text)===normalize(label)&&a.inNav);
   assert(candidate.some(a=>a.path==='/cat/'+slug),'Missing '+view.name+' sharing header destination '+slug+' actual '+candidate.map(a=>a.path));
   found.push(slug);
  }
  const measured=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  assert(measured.viewport===view.width&&measured.document<=view.width+2,'Wrong viewport or horizontal overflow '+view.name);
  await page.screenshot({path:OUT+'/header-'+view.name+'.png',fullPage:false});
  result.views.push({name:view.name,measured,linked:found});
  for(const [label,slug,count] of targets){
    const path='/cat/'+slug;
    const r=await page.goto(HOST+path,{waitUntil:'domcontentloaded',timeout:60000});
    const details=await page.evaluate(()=>({
      heading:document.querySelector('main h1')?.textContent?.trim()||'',
      cards:document.querySelectorAll('#posts-grid a[href]').length,
      hasProductListing:Boolean(document.querySelector('main #product-grid')),
      width:document.documentElement.scrollWidth
    }));
    assert(r?.status()===200&&details.heading.length>0&&details.cards>0&&!details.hasProductListing,'Invalid '+view.name+' sharing archive '+path+' '+JSON.stringify(details));
    assert(details.width<=view.width+2,'Archive horizontal overflow '+path);
    result.pages.push({viewport:view.name,path,expectedCount:count,status:r.status(),...details});
  }
  await page.close();
 }
 for(const view of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const article=await ctx.newPage();
  await article.setViewportSize({width:view.width,height:view.height});
  for(const slug of samples){
   const r=await article.goto(HOST+'/'+slug,{waitUntil:'domcontentloaded',timeout:60000});
   const detail=await article.evaluate(mobile=>{
    const root=document.querySelector(mobile?'#mobile-menu-container':'#desktop-menu');
    const sharing=[...root?.querySelectorAll('button')||[]].find(b=>b.textContent?.replace(/\\s+/g,' ').trim()==='Chia sẻ');
    return {h1:document.querySelector('main h1')?.textContent?.trim()||'',textLength:(document.querySelector('main')?.textContent||'').trim().length,
      sharingFound:Boolean(sharing),sharingActive:Boolean(sharing?.classList.contains('text-[#0B5FA5]')||sharing?.querySelector('.is-active')),
      documentWidth:document.documentElement.scrollWidth};
   },view.name==='mobile');
   assert(r?.status()===200&&detail.h1&&detail.textLength>250,'Article detail missing '+slug+' '+JSON.stringify(detail));
   assert(detail.sharingFound&&detail.sharingActive&&detail.documentWidth<=view.width+2,
     'Article Header sharing menu not active '+view.name+' '+slug+' '+JSON.stringify(detail));
   result.articles.push({viewport:view.name,slug,status:r.status(),...detail});
  }
  await article.close();
 }
 result.status='PASS';
 console.log('SHARING_LIVE_QA_PASS='+JSON.stringify({views:result.views.length,archives:result.pages.length,articles:result.articles.length}));
}catch(e){result.status='FAIL';result.errors.push(String(e.message||e).slice(0,750));console.error('SHARING_LIVE_QA_FAIL='+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
