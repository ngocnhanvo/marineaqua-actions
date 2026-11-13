import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
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
 const mediaMemo=new Map();
 async function copyFeatured(id){
   if(!id)return 0;
   if(mediaMemo.has(id))return mediaMemo.get(id);
   const source=await read(SOURCE+'/wp-json/wp/v2/media/'+id+'?_fields=id,source_url,alt_text,slug');
   const original=String(source?.source_url||'');
   must(original.startsWith(SOURCE+'/wp-content/uploads/'),'Unsafe source media URL '+original);
   const filename=decodeURIComponent(new URL(original).pathname.split('/').pop());
   must(/\.(?:jpe?g|png|webp|gif)$/i.test(filename),'Unsupported featured image '+filename);
   // Search target media by deterministic original file name; never overwrite existing media.
   const found=await api('GET','/wp-json/wp/v2/media?search='+encodeURIComponent(filename)+'&per_page=30&_fields=id,source_url');
   const identical=found.filter(item=>{const url=String(item?.source_url||'');if(!url)return false;try{return decodeURIComponent(new URL(url,WP).pathname.split('/').pop())===filename}catch{return false}});
   must(identical.length<=1,'Ambiguous existing media '+filename);
   let mediaId=identical[0]?.id;
   if(!mediaId){
    const response=await ctx.request.get(original,{timeout:45000,failOnStatusCode:false});
    must(response.ok(),'Source image download HTTP '+response.status()+' '+filename);
    const bytes=await response.body();
    must(bytes.length>100&&bytes.length<16*1024*1024,'Invalid media bytes '+filename);
    const kind=filename.toLowerCase().endsWith('.png')?'image/png':filename.toLowerCase().endsWith('.webp')?'image/webp':filename.toLowerCase().endsWith('.gif')?'image/gif':'image/jpeg';
    const uploaded=await api('POST','/wp-json/wp/v2/media',new Uint8Array(bytes),{
      'Content-Disposition':'attachment; filename="'+filename.replace(/[^A-Za-z0-9._-]/g,'_')+'"',
      'Content-Type':kind
    });
    must(uploaded.id&&uploaded.source_url,'Media upload failed '+filename);
    mediaId=uploaded.id;
   }
   mediaMemo.set(id,mediaId);
   report.media.push({source:id,target:mediaId,filename});
   return mediaId;
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
