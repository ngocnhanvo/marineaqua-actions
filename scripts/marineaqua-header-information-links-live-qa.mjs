import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const SITE='https://marine-aqua.io.vn';
const OUT='header-information-links-live-evidence';
// Source contract: marineaqua-astro/src/lib/cartStorageKey.ts. This synthetic
// browser snapshot never represents a real CoCart session or product.
const CART_STORAGE_KEY='esc-cart-storage';
const CART='header [data-header-action="cart"]:visible';
const ACTION='header [data-header-action]:visible';
const NORMAL={background:'rgb(245, 250, 255)',border:'rgb(224, 235, 244)',color:'rgb(23, 77, 117)'};
const HOVER={background:'rgb(234, 245, 252)',border:'rgb(197, 226, 243)',color:'rgb(8, 108, 174)'};
const expected=[
 ['Chính sách đổi trả hàng','/chinh-sach-doi-tra-hang'],
 ['Phí ship hàng','/thong-bao'],
 ['Hướng dẫn mua hàng ở xa','/huong-dan-mua-hang-o-xa'],
 ['Hướng dẫn mua hàng tại nhà','/huong-dan-mua-hang-tai-nha'],
 ['Thời gian bán hàng','/thoi-gian-ban-hang'],
];
const result={status:'STARTED',origin:SITE,checks:[],headerActions:[],network:[],errors:[]};
const check=(yes,msg)=>{if(!yes)throw Error(msg)};
const norm=t=>String(t||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
const near=(a,b,tolerance=2)=>Math.abs(a-b)<=tolerance;
const transparent=value=>value==='transparent'||value==='rgba(0, 0, 0, 0)';
const sameRect=(a,b)=>['x','y','width','height'].every(key=>near(a[key],b[key],0.5));

async function nextFrames(page){
 await page.evaluate(()=>Promise.race([
  new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('Header animation-frame deadline')),4000)),
 ]));
}

async function headerScreenshot(page,name,{sticky=false}={}){
 if(!sticky)await page.evaluate(()=>window.scrollTo({left:0,top:0,behavior:'instant'}));
 await page.evaluate(()=>Promise.race([
  (async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})(),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('Header screenshot readiness deadline')),4000)),
 ]));
 const clip=await page.evaluate(sticky=>{
  const rect=document.querySelector(sticky?'#header-brandbar':'#main-header').getBoundingClientRect();
  const y=Math.max(0,Math.floor(rect.top)-8);
  if(scrollX!==0||(!sticky&&scrollY!==0))throw Error('Header screenshot scroll position is not settled');
  return{x:0,y,width:innerWidth,height:Math.min(innerHeight-y,Math.ceil(rect.bottom)+12-y)};
 },sticky);
 check(clip.height>0,'Header screenshot has no visible area: '+name);
 await page.screenshot({path:OUT+'/'+name+'.png',clip,fullPage:false,animations:'disabled',caret:'hide',timeout:10000});
}

async function readonlyContext(browser,viewport){
 const record={viewport:viewport.name,nonReadForwarded:0,blocked:[]};
 result.network.push(record);
 const context=await browser.newContext({
  viewport:{width:viewport.width,height:viewport.height},
  isMobile:viewport.name==='mobile',hasTouch:viewport.name==='mobile',
  serviceWorkers:'block',reducedMotion:'no-preference',
 });
 context.setDefaultTimeout(5000);
 await context.route('**/*',async route=>{
  const request=route.request(),method=request.method(),url=new URL(request.url());
  const commerce=/\/api\/(?:cart|orders?)(?:\/|$)|\/wp-json\/(?:cocart\/|wc\/(?:v\d+\/orders|store\/.*cart))/i.test(url.pathname);
  if(!['GET','HEAD','OPTIONS'].includes(method)||commerce){
   record.blocked.push({method,origin:url.origin,path:url.pathname,reason:commerce?'cart/order API forbidden':'non-read request forbidden'});
   await route.abort('blockedbyclient');
   return;
  }
  await route.continue();
 });
 return{context,record};
}

async function fixtureCount(page,count){
 const label=count>99?'99+':String(count);
 await page.evaluate(({key,count})=>{
  localStorage.setItem(key,JSON.stringify({
   version:0,
   state:{cartKey:'header-ui-browser-fixture',items:count?[{item_key:'header-ui-fixture-item',quantity:{value:count}}]:[]},
  }));
  window.dispatchEvent(new Event('cart:updated'));
 },{key:CART_STORAGE_KEY,count});
 await page.waitForFunction(({label,hidden})=>{
  const badges=[...document.querySelectorAll('.marine-header-cart-count')];
  return badges.length>=2&&badges.every(badge=>badge.textContent===label&&badge.classList.contains('hidden')===hidden);
 },{label,hidden:count===0},{timeout:3000});
}

async function clearFixture(page){
 await page.evaluate(key=>{
  localStorage.removeItem(key);
  window.dispatchEvent(new Event('cart:updated'));
 },CART_STORAGE_KEY);
 await page.waitForFunction(key=>localStorage.getItem(key)===null&&
  [...document.querySelectorAll('.marine-header-cart-count')].every(badge=>badge.classList.contains('hidden')),
 CART_STORAGE_KEY,{timeout:3000});
}

async function actionState(action){
 return action.evaluate(element=>{
  const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
  const css=getComputedStyle(element),icon=element.querySelector('.header-action-icon'),svg=icon?.querySelector('svg');
  const iconCss=icon&&getComputedStyle(icon);
  const shapes=svg?[...svg.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect')].map(shape=>{
   const s=getComputedStyle(shape);return{fill:s.fill,stroke:s.stroke,strokeWidth:parseFloat(s.strokeWidth)};
  }):[];
  return{
   action:element.dataset.headerAction,tag:element.tagName,role:element.getAttribute('role'),tabIndex:element.tabIndex,
   box:rect(element),position:css.position,overflow:css.overflow,
   background:css.backgroundColor,border:css.borderTopColor,color:css.color,transform:css.transform,
   outline:{style:css.outlineStyle,width:parseFloat(css.outlineWidth),offset:parseFloat(css.outlineOffset),color:css.outlineColor},
   focusVisible:element.matches(':focus-visible'),focused:document.activeElement===element,
   transitionDurations:css.transitionDuration.split(',').map(value=>parseFloat(value)),
   icon:icon?{box:rect(icon),background:iconCss.backgroundColor,backgroundImage:iconCss.backgroundImage,border:parseFloat(iconCss.borderTopWidth),svg:svg?{fill:getComputedStyle(svg).fill,shapes}:null}:null,
  };
 });
}

function assertActionSurface(state,label,surface=NORMAL){
 check(state.position==='relative'&&state.overflow==='visible',label+': control does not provide an unclipped positioning context');
 check(state.background===surface.background&&state.border===surface.border&&state.color===surface.color,
  label+': unexpected control surface '+JSON.stringify({background:state.background,border:state.border,color:state.color}));
 check(state.icon&&transparent(state.icon.background)&&state.icon.backgroundImage==='none'&&state.icon.border===0,
  label+': inner icon paints a second background or border');
 check(near(state.icon.box.width,20,0.5)&&near(state.icon.box.height,20,0.5),label+': icon dimensions changed');
 check(state.icon.svg?.fill==='none'&&state.icon.svg.shapes.length>0&&
  state.icon.svg.shapes.every(shape=>shape.fill==='none'&&shape.stroke!=='none'&&shape.strokeWidth>0),
  label+': expected an outline SVG, received a filled or missing icon');
 check(state.transform==='none',label+': control transform shifts its geometry');
}

async function badgeState(page,count,label){
 const carts=page.locator(CART);
 check(await carts.count()===1,label+': expected exactly one visible cart control');
 const cart=carts.first(),state=await actionState(cart);
 assertActionSurface(state,label);
 const detail=await cart.evaluate(element=>{
  const badge=element.querySelector('.marine-header-cart-count'),rect=node=>{
   const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
  };
  if(!badge)return{missing:true};
  const css=getComputedStyle(badge),box=rect(badge),clipAncestors=[];
  for(let parent=badge.parentElement;parent;parent=parent.parentElement){
   const style=getComputedStyle(parent),bounds=parent.getBoundingClientRect();
   const clipX=/hidden|clip|scroll|auto/.test(style.overflowX),clipY=/hidden|clip|scroll|auto/.test(style.overflowY);
   if((clipX&&(box.x<bounds.left-1||box.right>bounds.right+1))||
    (clipY&&(box.y<bounds.top-1||box.bottom>bounds.bottom+1)))clipAncestors.push(parent.id||parent.tagName);
  }
  const textRange=document.createRange();textRange.selectNodeContents(badge);
  const text=textRange.getBoundingClientRect();
  return{
   missing:false,text:badge.textContent,hidden:css.display==='none',box,offsetParentIsCart:badge.offsetParent===element,
   position:css.position,top:parseFloat(css.top),right:parseFloat(css.right),whiteSpace:css.whiteSpace,
   clientWidth:badge.clientWidth,scrollWidth:badge.scrollWidth,textWidth:text.width,
   textAvailableWidth:badge.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),
   clipAncestors,viewport:{width:innerWidth,height:innerHeight,document:document.documentElement.scrollWidth},
  };
 });
 check(!detail.missing,label+': missing badge element');
 check(detail.viewport.document<=detail.viewport.width+2,label+': horizontal overflow');
 if(count===0){
  check(detail.hidden,label+': zero count badge is visible');
 }else{
  const b=detail.box,c=state.box;
  check(!detail.hidden&&detail.text===(count>99?'99+':String(count)),label+': wrong badge label or visibility');
  check(detail.offsetParentIsCart&&detail.position==='absolute',label+': badge is positioned relative to the wrong ancestor');
  check(near(detail.top,-4)&&near(detail.right,-4),label+': badge is detached from the intended corner');
  check(b.x>=c.x-1&&b.x+b.width/2>=c.x+c.width*0.6&&b.x<c.right&&b.right>c.right-2&&b.right<=c.right+6&&
   b.y<=c.y+2&&b.y>=c.y-6&&b.bottom>c.y&&b.bottom<=c.y+c.height/2+2,
   label+': badge does not overlap the cart upper-right corner '+JSON.stringify({cart:c,badge:b}));
  check(b.width>=18-1&&near(b.height,18)&&detail.whiteSpace==='nowrap',label+': badge dimensions/line wrapping are invalid');
  check(detail.scrollWidth<=detail.clientWidth+1&&detail.textWidth<=detail.textAvailableWidth+1,label+': badge text is clipped');
  check(detail.clipAncestors.length===0,label+': badge is clipped by '+detail.clipAncestors.join(','));
  check(b.x>=0&&b.y>=0&&b.right<=detail.viewport.width&&b.bottom<=detail.viewport.height,label+': badge is outside the visible viewport');
 }
 return{count,control:state.box,badge:detail};
}

async function keyboardFocus(page,action,label){
 await page.mouse.move(1,Math.max(300,Math.floor(page.viewportSize().height/2)));
 await page.evaluate(()=>{
  const body=document.body,old=body.getAttribute('tabindex');
  body.tabIndex=-1;body.focus();
  if(old===null)body.removeAttribute('tabindex');else body.setAttribute('tabindex',old);
 });
 for(let step=1;step<=30;step++){
  await page.keyboard.press('Tab');
  if(await action.evaluate(element=>document.activeElement===element)){
   const state=await actionState(action);
   check(state.focusVisible&&state.outline.style==='solid'&&state.outline.width>=2&&state.outline.offset>=2&&
    state.outline.color==='rgb(8, 119, 189)',label+': keyboard focus ring is missing');
   return{tabs:step,state};
  }
 }
 throw Error(label+': action is unreachable by keyboard within the Header');
}

async function checkHeaderActions(page,viewport,network){
 const evidence={viewport:viewport.name,width:viewport.width,fixture:'browser localStorage only',counts:[],actions:[],breakpoints:[],cleanup:false};
 result.headerActions.push(evidence);
 try{
  await page.mouse.move(1,Math.max(300,Math.floor(viewport.height/2)));
  for(const count of [0,1,12,100]){
   await fixtureCount(page,count);
   const state=await badgeState(page,count,viewport.name+' count '+count);
   if(evidence.counts.length)check(sameRect(evidence.counts[0].control,state.control),viewport.name+': badge count changes control geometry');
   evidence.counts.push(state);
   if(count===1)await headerScreenshot(page,viewport.name+'-header-normal');
  }
  await headerScreenshot(page,viewport.name+'-header-count-99plus');
  if(viewport.name==='desktop'){
   for(const kind of ['account','cart']){
    const action=page.locator('header [data-header-action="'+kind+'"]:visible');
    check(await action.count()===1,'desktop: expected one visible '+kind+' action');
    await page.mouse.move(1,400);
    await page.waitForFunction(({kind,color})=>{
     const element=[...document.querySelectorAll('[data-header-action="'+kind+'"]')].find(node=>node.getClientRects().length&&getComputedStyle(node).display!=='none');
     return element&&getComputedStyle(element).color===color;
    },{kind,color:NORMAL.color},{timeout:2000});
    const before=await actionState(action);
    assertActionSurface(before,'desktop '+kind+' normal');
    const interactive=before.tag==='A';
    await action.hover();
    if(interactive)await page.waitForFunction(({kind,color})=>{
     const element=[...document.querySelectorAll('[data-header-action="'+kind+'"]')].find(node=>node.getClientRects().length&&getComputedStyle(node).display!=='none');
     return element&&getComputedStyle(element).color===color;
    },{kind,color:HOVER.color},{timeout:2000});
    await nextFrames(page);
    const hovered=await actionState(action);
    assertActionSurface(hovered,'desktop '+kind+' hover',interactive?HOVER:NORMAL);
    check(sameRect(before.box,hovered.box)&&sameRect(before.icon.box,hovered.icon.box),'desktop '+kind+': hover caused geometry shift');
    await headerScreenshot(page,'desktop-header-hover-'+kind);
    const item={kind,interactive,normal:before,hover:hovered};
    if(interactive){
     const focus=await keyboardFocus(page,action,'desktop '+kind);
     check(sameRect(before.box,focus.state.box)&&sameRect(before.icon.box,focus.state.icon.box),'desktop '+kind+': focus caused geometry shift');
     item.focus=focus;
     await headerScreenshot(page,'desktop-header-focus-'+kind);
    }else{
     check(before.tag==='SPAN'&&before.role==='img'&&before.tabIndex<0,'desktop '+kind+': unexpected noninteractive fallback');
     item.focus={status:'NOT_APPLICABLE',reason:'WordPress has no account Page URL; Header renders a noninteractive image'};
    }
    evidence.actions.push(item);
    await page.evaluate(()=>document.activeElement?.blur());
   }
   await page.mouse.move(1,400);
   for(const width of [899,900,1023,1024]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
    await nextFrames(page);
    const breakpoint=await badgeState(page,100,'breakpoint '+width);
    const parent=await page.locator(CART).evaluate(element=>element.parentElement.id);
    check(parent===(width<900?'header-compact-actions':'header-contacts'),'breakpoint '+width+': wrong cart control is displayed');
    evidence.breakpoints.push({width,parent,...breakpoint});
   }
   await page.setViewportSize({width:viewport.width,height:viewport.height});
   await nextFrames(page);
  }else{
   check(await page.evaluate(()=>matchMedia('(hover: none)').matches&&navigator.maxTouchPoints>0),'mobile: context is not touch/no-hover');
   await page.evaluate(()=>window.scrollTo({top:600,left:0,behavior:'instant'}));
   await page.waitForFunction(()=>document.querySelector('#main-header').classList.contains('mobile-header-fixed')&&
    getComputedStyle(document.querySelector('#header-brandbar')).position==='fixed'&&
    Math.abs(document.querySelector('#header-brandbar').getBoundingClientRect().top)<=1,null,{timeout:3000});
   // The sticky class applies before the existing 220ms Header resize finishes.
   await page.waitForTimeout(250);
   evidence.sticky={scrollY:await page.evaluate(()=>scrollY),...await badgeState(page,100,'mobile sticky')};
   await headerScreenshot(page,'mobile-header-sticky-count-99plus',{sticky:true});
   await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
   await nextFrames(page);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.locator(ACTION).evaluateAll(elements=>elements.map(element=>({
   action:element.dataset.headerAction,durations:getComputedStyle(element).transitionDuration.split(',').map(value=>parseFloat(value)),
  })));
  check(reduced.length>0&&reduced.every(action=>action.durations.every(value=>value===0)),viewport.name+': reduced-motion still animates Header controls');
  evidence.reducedMotion=reduced;
  check(network.blocked.every(entry=>entry.reason!=='cart/order API forbidden'),viewport.name+': Header fixture attempted a cart/order API request');
 }catch(error){
  // Public-page fixture only: no account data or checkout values are entered.
  await page.screenshot({path:OUT+'/'+viewport.name+'-header-failure.png',fullPage:false,timeout:10000})
   .catch(captureError=>{evidence.captureError=String(captureError.message||captureError).slice(0,300)});
  throw error;
 }finally{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await clearFixture(page);
  evidence.cleanup=true;
 }
}

await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for (const viewport of [{name:'desktop',width:1366,height:900},{name:'mobile',width:390,height:844}]){
  const {context,record}=await readonlyContext(browser,viewport);
  const page=await context.newPage();
  const r=await page.goto(SITE+'/',{waitUntil:'domcontentloaded',timeout:60000});
  check(r?.status()===200,'Home HTTP status invalid at '+viewport.name);
  await page.waitForTimeout(700);
  // Run before opening the mobile navigation; no cart/order endpoint is used.
  await checkHeaderActions(page,viewport,record);
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
  check(width.viewport===viewport.width,viewport.name+': wrong viewport size');
  check(width.document<=width.viewport+2,viewport.name+': horizontal overflow');
  await page.screenshot({path:OUT+'/'+viewport.name+'.png',fullPage:false,timeout:10000});
  result.checks.push({viewport:viewport.name,httpStatus:r.status(),links:details,width});
  await page.close();
  await context.close();
 }
 // Each target URL must remain a published content page, not a listing or 404.
 const {context}=await readonlyContext(browser,{name:'destinations',width:1366,height:900});
 const verify=await context.newPage();
 for(const [label,path] of expected){
   const r=await verify.goto(SITE+path,{waitUntil:'domcontentloaded',timeout:60000});
   const heading=await verify.locator('main h1').first().textContent().catch(()=>null);
   check(r?.status()===200&&norm(heading)===norm(label),'Invalid destination '+path+' status '+r?.status()+' heading '+heading);
 }
 await context.close();
 result.status='PASS';
 console.log('HEADER_ACTIONS_LIVE_PASS='+JSON.stringify(result.headerActions.map(item=>({
  viewport:item.viewport,counts:item.counts.map(entry=>entry.count),breakpoints:item.breakpoints.map(entry=>entry.width),
  actions:item.actions.map(action=>({kind:action.kind,interactive:action.interactive,focus:action.focus?.status||'PASS'})),
  sticky:Boolean(item.sticky),reducedMotion:Boolean(item.reducedMotion),cleanup:item.cleanup,
 }))));
 console.log('HEADER_INFORMATION_LINKS_LIVE_PASS='+JSON.stringify(result.checks));
}catch(e){result.status='FAIL';result.errors.push(String(e.message||e).slice(0,800));console.error('HEADER_INFORMATION_LINKS_LIVE_FAIL='+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close()}

