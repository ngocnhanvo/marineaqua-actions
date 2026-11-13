import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const SOURCE='https://marine-aqua.vn', WP='https://admin.marine-aqua.io.vn';
const OUT='sharing-migration-evidence';
const EXPECTED={
 'cac-thiet-bi-trong-be-ca-den-skimmer-may-bom':32,
 'cach-chon-muoi-vi-sinh-va-hoa-chat-tot-nhat-cho-be-ca':36,
 'cach-chon-thuc-an-tot-cho-ca-va-san-ho':16,
 'kinh-nghiem-tri-reu-hai-tao-hai-trong-be-ca':48,
 'set-up-be-ca-bien-mini':4,
 'tin-kien-thuc':24,
 'tong-quan-ve-be-ca':5,
};
const report={status:'STARTED',categoryMap:{},categories:[],pages:[],posts:[],media:[],errors:[]};
const must=(v,m)=>{if(!v)throw Error(m)};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 must(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,'Missing WordPress credentials');
 const ctx=await browser.newContext();
 const page=await ctx.newPage();
 await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
 await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
 await page.locator('#wp-submit').click();
 must(!page.url().includes('wp-login.php'),'WordPress login rejected');
 await page.goto(WP+'/wp-admin/post-new.php',{waitUntil:'domcontentloaded',timeout:45000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  return r.ok?(await r.text()).trim():'';
 });
 must(/^[a-zA-Z0-9]{8,32}$/.test(nonce),'REST nonce unavailable');
 async function read(url){
  let last;
  for(let i=0;i<3;i++)try{
   const r=await ctx.request.get(url,{timeout:45000,failOnStatusCode:false});
   if(r.status()===400 && url.includes('page='))return [];
   must(r.ok(),'HTTP '+r.status()+' '+url);
   return r.json();
  }catch(e){last=e;await pause(1000*(i+1))}
  throw last;
 }
 async function api(method,path,body,headers={}){
  let last;
  for(let attempt=0;attempt<3;attempt++)try{
    const r=await ctx.request.fetch(WP+path,{
     method,headers:{'X-WP-Nonce':nonce,...(body && !(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{}),...headers},
     data:body?(body instanceof Uint8Array?body:JSON.stringify(body)):undefined,
     timeout:50000,failOnStatusCode:false
    });
    if(r.status()>=500||r.status()===429){last=Error('Transient WP '+r.status());await pause(1200*(attempt+1));continue}
    if(!r.ok())throw Error('WP API '+method+' '+path+' '+r.status()+' '+(await r.text()).slice(0,200));
    return r.json();
   }catch(e){last=e;if(attempt<2)await pause(1200*(attempt+1))}
   throw last;
 }
 async function list(origin,type,fields,perPage=100){
  const out=[];
  for(let n=1;n<=30;n++){
   const data=await read(origin+'/wp-json/wp/v2/'+type+'?status=publish&per_page='+perPage+'&page='+n+'&_fields='+fields);
   must(Array.isArray(data),'Invalid '+type+' inventory');
   out.push(...data);if(data.length<perPage)break;
  }
  return out;
 }
 const categories=await list(SOURCE,'categories','id,slug,name,description,parent,count');
 must(categories.length===7,'Original category count drift '+categories.length);
 const posts=await list(SOURCE,'posts','id,slug,title,content,excerpt,date,categories,featured_media,acf,yoast_head_json');
 must(posts.length===133,'Original published Post count drift '+posts.length);
 const categoryIds=new Set(categories.map(x=>x.id));
 const slugSet=new Set(posts.map(x=>x.slug));
 must(slugSet.size===133,'Duplicate source Post slugs');
 for(const cat of categories){
  must(EXPECTED[cat.slug]===cat.count,'Category count drift '+cat.slug);
  const members=posts.filter(post=>post.categories.includes(cat.id));
  must(members.length===cat.count,'Category membership mismatch '+cat.slug);
 }
 must(posts.every(p=>p.title?.rendered&&p.content?.rendered&&p.content.rendered.length>=150&&p.categories.every(id=>categoryIds.has(id))),'Incomplete source Post');
 const wpCategories=await api('GET','/wp-json/wp/v2/categories?per_page=100&context=edit&_fields=id,slug,name');
 must(Array.isArray(wpCategories),'Target category inventory invalid');
 for(const category of categories){
  const present=wpCategories.filter(c=>c.slug===category.slug);
  must(present.length<=1,'Duplicate target category '+category.slug);
  const dest=present[0]||await api('POST','/wp-json/wp/v2/categories',{
   name:category.name,slug:category.slug,description:category.description||'',parent:0
  });
  must(dest.id&&dest.slug===category.slug,'Category write mismatch '+category.slug);
  report.categoryMap[String(category.id)]=dest.id;
  report.categories.push({source:category.id,target:dest.id,slug:category.slug,count:category.count,created:!present.length});
 }
 const existingPages=[];
 for(let n=1;n<=12;n++){
  const rows=await api('GET','/wp-json/wp/v2/pages?status=any&context=edit&per_page=100&page='+n+'&_fields=id,slug,title,acf,content').catch(e=>{
   if(n>1&&String(e).includes(' 400 '))return [];
   throw e
  });
  must(Array.isArray(rows),'Target Pages inventory invalid');
  existingPages.push(...rows);if(rows.length<100)break;
 }
 for(const category of categories){
  const matches=existingPages.filter(p=>p.slug===category.slug);
  must(matches.length<=1,'Duplicate Page '+category.slug);
  let targetPage=matches[0];
  if(targetPage){
   const key=targetPage.acf?.key,action=targetPage.acf?.action;
   // The pre-existing Knowledge landing page is authored WordPress content.
   // Retain its stable key and content; change only its rendering action.
   const legacyKnowledge=category.slug==='tin-kien-thuc'&&key==='knowledge'&&(action==='HomePage'||action==='PostsPage');
   must(legacyKnowledge||((!key||key==='ssr-posts')&&(!action||action==='PostsPage')),'Existing Page conflicts: '+category.slug+' key='+key+' action='+action+' contentLength='+String(targetPage.content?.raw||'').length);
   if((!legacyKnowledge&&key!=='ssr-posts')||action!=='PostsPage'){
    targetPage=await api('POST','/wp-json/wp/v2/pages/'+targetPage.id,{acf:{key:legacyKnowledge?'knowledge':'ssr-posts',action:'PostsPage',product_lang:'vi'}});
   }
  }else{
   targetPage=await api('POST','/wp-json/wp/v2/pages',{
    title:category.name,slug:category.slug,status:'publish',
    content:'<p>Các bài chia sẻ của Marine Aqua về '+category.name+'.</p>',
    acf:{key:'ssr-posts',action:'PostsPage',product_lang:'vi'}
   });
  }
  must(targetPage.id&&targetPage.slug===category.slug,'Category page write failed '+category.slug);
  report.pages.push({slug:category.slug,id:targetPage.id,created:!matches.length});
 }
 const existingPosts=[];
 for(let n=1;n<=12;n++){
  const rows=await api('GET','/wp-json/wp/v2/posts?status=any&context=edit&per_page=100&page='+n+'&_fields=id,slug,acf,content,featured_media').catch(e=>{
   if(n>1&&String(e).includes(' 400 '))return [];
   throw e
  });
  must(Array.isArray(rows),'Target Post inventory malformed');
  existingPosts.push(...rows);if(rows.length<100)break;
 }
 // Reuse existing Media by verified file identity; REST binary uploads can
 // fail at the upstream proxy, so use WordPress's own native media uploader.
 const mediaMemo=new Map();
 const mediaByName=new Map();
 for(let pageNumber=1;pageNumber<=50;pageNumber++){
   let batch;
   try{
    batch=await api('GET','/wp-json/wp/v2/media?context=edit&per_page=100&page='+pageNumber+'&_fields=id,source_url');
   }catch(error){
    if(pageNumber>1&&/ 400 |rest_post_invalid_page_number/.test(String(error)))break;
    throw error;
   }
   must(Array.isArray(batch),'Media inventory invalid');
   for(const media of batch){
    const url=String(media?.source_url||'');
    if(!url)continue;
    try{
      const name=decodeURIComponent(new URL(url,WP).pathname.split('/').pop());
      if(name)mediaByName.set(name,media);
    }catch{}
   }
   if(batch.length<100)break;
 }
 const getRecent=async()=>{
   const list=await api('GET','/wp-json/wp/v2/media?context=edit&per_page=35&orderby=date&order=desc&_fields=id,source_url');
   must(Array.isArray(list),'Recent WordPress media invalid');
   return list;
 };
 async function copyFeatured(id){
   if(!id)return 0;
   if(mediaMemo.has(id))return mediaMemo.get(id);
   const source=await read(SOURCE+'/wp-json/wp/v2/media/'+id+'?_fields=id,source_url,alt_text,slug');
   const original=String(source?.source_url||'');
   must(original.startsWith(SOURCE+'/wp-content/uploads/'),'Unsafe original media '+original);
   const src=new URL(original);
   const filename=decodeURIComponent(src.pathname.split('/').pop());
   must(/^[^\\/\\\\\\x00-\\x1f]{1,170}\\.(?:jpe?g|png|webp|gif)$/i.test(filename),'Unsafe featured image filename '+filename);
   const response=await ctx.request.get(original,{timeout:45000,failOnStatusCode:false});
   must(response.ok(),'Source image HTTP '+response.status()+' '+filename);
   const bytes=await response.body();
   must(bytes.length>500&&bytes.length<16*1024*1024,'Invalid featured image bytes '+filename);
   const sha=createHash('sha256').update(bytes).digest('hex');
   const ext=filename.split('.').pop().toLowerCase();
   let name=filename;
   const existing=mediaByName.get(name);
   if(existing){
     const stored=await ctx.request.get(new URL(existing.source_url,WP).href,{timeout:45000,failOnStatusCode:false});
     must(stored.ok(),'Existing media verification HTTP '+stored.status()+' '+name);
     const storedSha=createHash('sha256').update(await stored.body()).digest('hex');
     if(storedSha!==sha){
       name='marine-aqua-sharing-'+sha.slice(0,24)+'.'+ext;
     }
   }
   let media=mediaByName.get(name);
   if(media){
     const verify=await ctx.request.get(new URL(media.source_url,WP).href,{timeout:45000,failOnStatusCode:false});
     must(verify.ok(),'Reused media HTTP '+verify.status()+' '+name);
     must(createHash('sha256').update(await verify.body()).digest('hex')===sha,'Reused media hash mismatch '+name);
   }else{
     const mime=ext==='png'?'image/png':ext==='webp'?'image/webp':ext==='gif'?'image/gif':'image/jpeg';
     await page.goto(WP+'/wp-admin/media-new.php',{waitUntil:'domcontentloaded',timeout:45000});
     await page.waitForFunction(()=>document.querySelector('input[type="file"][id^="html5_"]')||document.querySelector('#file-form input[type="file"]'),null,{timeout:20000});
     const html5=page.locator('input[type="file"][id^="html5_"]').first();
     const useHtml5=await html5.count()>0;
     const input=useHtml5?html5:page.locator('#async-upload');
     must(await input.count()>0,'WordPress native upload input missing');
     await input.setInputFiles({name,mimeType:mime,buffer:bytes});
     if(!useHtml5){
       await page.evaluate(()=>{
         const input=document.querySelector('#async-upload');
         const form=input?.form;
         if(!form||form.method.toLowerCase()!=='post'||form.enctype!=='multipart/form-data'||!form.action.startsWith(location.origin+'/wp-admin/'))throw Error('Native upload form invalid');
         const submit=form.querySelector('input[type="submit"],button[type="submit"]');
         if(!submit)throw Error('Native upload submit unavailable');
         form.requestSubmit(submit);
       });
       await page.waitForLoadState('domcontentloaded',{timeout:45000}).catch(()=>{});
     }
     for(let attempt=0;attempt<20;attempt++){
       await pause(900);
       const recent=await getRecent();
       media=recent.find(item=>{
         try{return decodeURIComponent(new URL(String(item.source_url||''),WP).pathname.split('/').pop())===name}catch{return false}
       });
       if(media)break;
     }
     must(media?.id,'Native WordPress media upload not persisted '+name);
     const stored=await ctx.request.get(new URL(media.source_url,WP).href,{timeout:45000,failOnStatusCode:false});
     must(stored.ok(),'Uploaded media HTTP '+stored.status()+' '+name);
     must(createHash('sha256').update(await stored.body()).digest('hex')===sha,'Uploaded media checksum mismatch '+name);
     mediaByName.set(name,media);
   }
   mediaMemo.set(id,media.id);
   report.media.push({source:id,target:media.id,filename:name,sha256:sha});
   return media.id;
 }
 const stopAt=Number(process.env.MIGRATE_POST_LIMIT||'133');
 let processed=0;
 for(const post of posts){
  const prev=existingPosts.filter(x=>x.slug===post.slug);
  must(prev.length<=1,'Duplicate target Post '+post.slug);
  const categoriesOut=post.categories.map(id=>report.categoryMap[String(id)]);
  must(categoriesOut.length&&categoriesOut.every(Number.isInteger),'Category remap missing '+post.slug);
  if(prev.length){
    must(String(prev[0].content?.raw||'').length>=100,'Existing Post content empty '+post.slug);
    report.posts.push({slug:post.slug,id:prev[0].id,mode:'preserved'});
    continue;
  }
  if(processed>=stopAt)break;
  const featured=await copyFeatured(post.featured_media||0);
  const created=await api('POST','/wp-json/wp/v2/posts',{
    slug:post.slug,title:post.title.rendered,content:post.content.rendered,
    excerpt:post.excerpt?.rendered||'',date:post.date,
    categories:categoriesOut,featured_media:featured,status:'publish',
    acf:{action:'PostDetails',product_lang:'vi'}
  });
  must(created.id&&created.slug===post.slug&&created.status==='publish','Post publish readback failed '+post.slug);
  report.posts.push({slug:post.slug,id:created.id,mode:'created',featured});
  processed++;
  if(processed%10===0)console.log('SHARING_MIGRATED_POST_PROGRESS='+JSON.stringify({created:processed,slug:post.slug}));
 }
 report.status=report.posts.length===posts.length?'PASS':'PARTIAL';
 console.log('SHARING_MIGRATION_SUMMARY='+JSON.stringify({status:report.status,categories:report.categories.length,pages:report.pages.length,posts:report.posts.length,media:report.media.length,errors:report.errors.length}));
 if(report.status!=='PASS')process.exitCode=1;
}catch(e){report.status='FAIL';report.errors.push(String(e.message||e).slice(0,700));console.error('SHARING_MIGRATION_FAIL='+report.errors.at(-1));process.exitCode=1}
finally{await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
