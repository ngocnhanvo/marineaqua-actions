import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const SITE='https://marine-aqua.io.vn';
const OUT='header-information-links-live-evidence';
const expected=[
 ['Chính sách đổi trả hàng','/chinh-sach-doi-tra-hang'],
 ['Phí ship hàng','/thong-bao'],
 ['Hướng dẫn mua hàng ở xa','/huong-dan-mua-hang-o-xa'],
 ['Hướng dẫn mua hàng tại nhà','/huong-dan-mua-hang-tai-nha'],
 ['Thời gian bán hàng','/thoi-gian-ban-hang'],
];
const result={status:'STARTED',origin:SITE,checks:[],errors:[]};
const check=(yes,msg)=>{if(!yes)throw Error(msg)};
const norm=t=>String(t||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 for (const viewport of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const page=await context.newPage({viewport:{width:viewport.width,height:viewport.height}});
  const r=await page.goto(SITE+'/',{waitUntil:'domcontentloaded',timeout:60000});
  check(r?.status()===200,'Home HTTP status invalid at '+viewport.name);
  await page.waitForTimeout(700);
  if(viewport.name==='mobile'){
   const toggles=page.locator('button[aria-label*="menu" i],button[aria-label*="danh mục" i],button[aria-expanded]');
   for(let i=0;i<Math.min(await toggles.count(),12);i++){
    const e=toggles.nth(i);
    const text=norm((await e.getAttribute('aria-label'))||await e.textContent());
    if(/menu|điều hướng|navigation|danh mục/.test(text)&&await e.isVisible()){
     await e.click().catch(()=>{});
     break;
    }
   }
  }
  const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>({
   text:(node.textContent||'').trim().replace(/\s+/g,' '),
   href:node.getAttribute('href')||'',
   path:new URL(node.href,location.href).pathname.replace(/\/+$/,'')||'/',
   inNavigation:Boolean(node.closest('nav,header,[role="navigation"]')),
  })));
  const details=[];
  for(const [label,path] of expected){
   const candidates=links.filter(a=>norm(a.text)===norm(label));
   check(candidates.length>0,viewport.name+': missing Header anchor label '+label);
   const matching=candidates.filter(a=>a.path===path);
   check(matching.length>0,viewport.name+': Header link wrong for '+label+' actual '+candidates.map(c=>c.href).join(','));
   const navMatches=matching.filter(x=>x.inNavigation);
   check(navMatches.length>0,viewport.name+': link not inside navigation '+label);
   details.push({label,expected:path,actual:navMatches[0].href,pass:true});
  }
  const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  check(width.document<=width.viewport+2,viewport.name+': horizontal overflow');
  await page.screenshot({path:OUT+'/'+viewport.name+'.png',fullPage:false});
  result.checks.push({viewport:viewport.name,httpStatus:r.status(),links:details,width});
  await page.close();
 }
 // Each target URL must remain a published content page, not a listing or 404.
 const verify=await context.newPage({viewport:{width:1366,height:900}});
 for(const [label,path] of expected){
   const r=await verify.goto(SITE+path,{waitUntil:'domcontentloaded',timeout:60000});
   const heading=await verify.locator('main h1').first().textContent().catch(()=>null);
   check(r?.status()===200&&norm(heading)===norm(label),'Invalid destination '+path+' status '+r?.status()+' heading '+heading);
 }
 result.status='PASS';
 console.log('HEADER_INFORMATION_LINKS_LIVE_PASS='+JSON.stringify(result.checks));
}catch(e){result.status='FAIL';result.errors.push(String(e.message||e).slice(0,800));console.error('HEADER_INFORMATION_LINKS_LIVE_FAIL='+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
