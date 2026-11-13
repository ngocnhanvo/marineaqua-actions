import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP='https://admin.marine-aqua.io.vn';
const FRONT='https://marine-aqua.io.vn';
const DIR='home-builder-audit-evidence';
const report={status:'IN_PROGRESS',site:FRONT,tables:[],home:{},cms:{},preview:{},issues:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await context.newPage();
  const getJson=async(path)=>{
    const res=await context.request.get(WP+path,{timeout:30000,failOnStatusCode:false});
    if(!res.ok())return {status:res.status()};
    try{return {status:res.status(),data:await res.json()}}catch{return {status:res.status(),invalidJson:true}}
  };
  try{
    const response=await page.goto(FRONT+'/',{waitUntil:'domcontentloaded',timeout:45000});
    report.home.http=response?.status();
    report.home.title=await page.title();
    const dom=await page.locator('[data-tablepress-preview]').evaluateAll(nodes=>nodes.map((root)=>{
      const els=[...root.querySelectorAll('*')];
      const fields={};
      for(const el of els){
        for(const attr of ['data-esc-builder-field','data-esc-builder-cell-field','data-esc-builder-image-field','data-esc-vb-footer-field']){
          const value=el.getAttribute(attr);if(value)fields[value]=(fields[value]||0)+1;
        }
      }
      return {table:root.getAttribute('data-tablepress-preview'),
        titles:[...root.querySelectorAll('h1,h2')].slice(0,3).map(el=>el.textContent?.trim().slice(0,75)),
        mappedFields:fields,sections:root.querySelectorAll('section').length,
        items:root.querySelectorAll('article').length,
        textNodes:els.filter(el=>['H1','H2','H3','P','A'].includes(el.tagName)&&
          el.children.length===0&&el.textContent?.trim()).length,
        imageNodes:els.filter(el=>el.tagName==='IMG').length,
        mappedImages:els.filter(el=>el.hasAttribute('data-esc-builder-image-row')).length,
      };
    }));
    report.home.sections=dom;
    report.home.visibleOrder=dom.map(x=>x.table);
  }catch(e){report.issues.push('PUBLIC_HOME: '+String(e.message||e).slice(0,180));}
  const username=process.env.WP_ADMIN_USERNAME;
  const password=process.env.WP_ADMIN_PASSWORD;
  if(!username||!password){report.issues.push('ADMIN: missing WP_ADMIN_USERNAME/PASSWORD');}
  else{
    try{
      await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
      await page.locator('#user_login').fill(username);
      await page.locator('#user_pass').fill(password);
      await page.locator('#wp-submit').click({timeout:20000});
      await page.goto(WP+'/wp-admin/post.php?post=82454&action=edit',
        {waitUntil:'domcontentloaded',timeout:45000});
      report.cms.editPageUrlAccessible=!page.url().includes('wp-login.php');
      report.cms.pageEditTitle=await page.title();
      report.cms.builderControls=await page.locator('button,a,input').evaluateAll(elements=>elements
        .filter(e=>/visual builder|esc builder|thiết kế trực quan|trình thiết kế|esc table/i.test(
          [e.textContent||'',e.getAttribute('value')||'',e.getAttribute('title')||'',e.getAttribute('aria-label')||''].join(' ')))
        .slice(0,35).map(e=>({tag:e.tagName,
          text:String(e.textContent||e.getAttribute('value')||'').trim().slice(0,60),
          id:e.id,href:e.getAttribute('href'),className:String(e.className||'').slice(0,110)})));
      const pages=await getJson('/wp-json/wp/v2/pages/82454?_fields=id,slug,status,acf,content,title');
      const d=pages.data;
      report.cms.homePage={id:d?.id||null,status:pages.status,
        slug:d?.slug||null,action:d?.acf?.action||null,key:d?.acf?.key||null,
        shortcodes:[...String(d?.content?.rendered||'').matchAll(/\[table\s+id=['"]?([a-zA-Z0-9_-]+)/g)].map(x=>x[1])};
      report.cms.tablePressUi=await page.locator('a[href*="tablepress"]').count();
      // Inspect each existing Home_* table using the native REST read endpoint (GET only).
      for(let i=0;i<=13;i++){
        const id='home_'+String(i).padStart(2,'0');
        const obj=await getJson('/wp-json/tablepress/v1/table/'+id);
        const data=obj.data;
        const items=Array.isArray(data?.items)?data.items:[];
        const fieldRecords=Array.isArray(data?.fields)?data.fields:[];
        const rowKeys=[...new Set(items.flatMap(row=>Object.keys(row||{})))].sort();
        report.tables.push({id,status:obj.status,exists:Boolean(data?.id),
          title:typeof data?.title==='string'?data.title.slice(0,80):null,
          api:data?.meta?.api||null,itemCount:items.length,
          fields:fieldRecords.map(f=>({key:f?.key,type:f?.type||null})),
          dataKeys:rowKeys,hasMeta:Boolean(data?.meta)});
      }
      const builderButton=report.cms.builderControls?.find(x=>/visual builder|esc builder/i.test(x.text||''))||
        report.cms.builderControls?.find(x=>/builder/i.test(x.id||''));
      report.cms.builderActionCandidate=builderButton||null;
      // Identify current protected preview iframe and related controls, but do not mutate CMS.
      report.cms.iframes=await page.locator('iframe').evaluateAll(frames=>frames.slice(0,15)
        .map(f=>({id:f.id,title:f.title,src:(f.getAttribute('src')||'').split('?')[0].slice(0,150)})));
    }catch(e){report.issues.push('ADMIN_OR_TABLES: '+String(e.message||e).slice(0,220));}
  }
  await context.close();
}finally{await browser.close();}
report.status=report.issues.length?'PARTIAL':'PASS_READ_ONLY';
await writeFile(DIR+'/result.json',JSON.stringify(report,null,2)+'\n');
console.log('MARINEAQUA_HOME_BUILDER_AUDIT='+JSON.stringify({
 status:report.status,home:report.home.visibleOrder,cms:report.cms.homePage,
 tables:report.tables.map(t=>({id:t.id,http:t.status,api:t.api,items:t.itemCount,fields:t.fields.map(f=>f.key)})),
 issues:report.issues,
}));
if(report.issues.length)process.exitCode=1;
