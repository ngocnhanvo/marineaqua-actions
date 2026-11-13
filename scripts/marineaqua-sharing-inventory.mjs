import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
const SOURCE='https://marine-aqua.vn',TARGET='https://admin.marine-aqua.io.vn',OUT='sharing-audit-evidence';
const labels=['Tổng quan về bể cá biển','Setup bể cá biển mini','Kinh nghiệm xử lý bể cá','Cách chọn muối, vi sinh và hóa chất tốt nhất cho bể cá','Cách chọn thức ăn tốt cho cá và san hô','Tin kiến thức','Các thiết bị trong bể cá'];
const result={source:SOURCE,target:TARGET,labels,errors:[],sourceCategories:[],targetCategories:[],targetPosts:[],menu:[],sourcePosts:[],sourcePages:[]};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext();
 async function read(url){
  try{const r=await ctx.request.get(url,{timeout:40000,failOnStatusCode:false});if(!r.ok())throw Error('HTTP '+r.status());return await r.json()}
  catch(e){result.errors.push({url,error:String(e.message||e).slice(0,250)});return null}
 }
 const keys=['id','slug','name','count','parent','link','description'];
 const list=async(origin,endpoint)=>{const rows=[];for(let page=1;page<=4;page++){const data=await read(origin+'/wp-json/wp/v2/'+endpoint+'?per_page=100&page='+page);if(!Array.isArray(data))break;rows.push(...data);if(data.length<100)break}return rows};
 result.sourceCategories=(await list(SOURCE,'categories')).map(c=>({id:c.id,name:c.name,slug:c.slug,count:c.count,parent:c.parent,link:c.link}));
 result.targetCategories=(await list(TARGET,'categories')).map(c=>({id:c.id,name:c.name,slug:c.slug,count:c.count,parent:c.parent,link:c.link}));
 result.targetPosts=(await list(TARGET,'posts')).map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,categories:p.categories,status:p.status,link:p.link}));
 result.sourcePosts=(await list(SOURCE,'posts')).map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,categories:p.categories,status:p.status,link:p.link,contentLength:p.content?.rendered?.length,featured_media:p.featured_media}));
 result.sourcePages=(await list(SOURCE,'pages')).map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,link:p.link}));
 const menu=await read(TARGET+'/wp-json/esc-api/v1/menus');result.menu=menu?.menus?.Header?.vi?.items||[];
 console.log('SHARING_AUDIT_SUMMARY='+JSON.stringify({sourceCategories:result.sourceCategories.length,targetCategories:result.targetCategories.length,sourcePosts:result.sourcePosts.length,targetPosts:result.targetPosts.length,sourcePages:result.sourcePages.length,menuItems:result.menu.length,errors:result.errors}));
}finally{
 await writeFile(OUT+'/result.json',JSON.stringify(result,null,2)+'\n');await browser.close();
}
