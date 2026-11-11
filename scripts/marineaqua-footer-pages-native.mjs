import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",DIR="footer-pages-evidence";
const defs=[
 {slug:"lien-he",key:"contact",title:"Liên hệ",action:"HomePage",content:"<h1>Liên hệ Marine Aqua</h1><p>Để được tư vấn về thiết bị, vật tư và phụ kiện cho bể cá biển, vui lòng sử dụng số điện thoại hoặc email trong phần Thông tin liên hệ ở chân trang.</p>"},
 {slug:"tin-kien-thuc",key:"knowledge",title:"Tin kiến thức",action:"HomePage",content:"<h1>Tin kiến thức</h1><p>Các bài viết về chăm sóc bể cá biển và san hô đang được cập nhật.</p>"}
];
const result={scope:defs.map(d=>d.slug),created:[],reused:[],verified:[],errors:[],temporary_created:[],cleanup_remaining:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error("WordPress admin credentials missing");
 const page=await browser.newPage();
 await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await page.locator("#user_login").fill(username);
 await page.locator("#user_pass").fill(password);
 await page.locator("#wp-submit").click();
 await page.goto(WP+"/wp-admin/post-new.php?post_type=page",{waitUntil:"domcontentloaded",timeout:45000});
 if(page.url().includes("wp-login.php"))throw Error("WordPress Page editor authorization failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok?(await r.text()).trim():"";
 });
 if(!/^[a-zA-Z0-9]{8,32}$/.test(nonce))throw Error("WordPress nonce absent");
 async function api(method,path,payload){
  const value=await page.evaluate(async ({method,path,payload,nonce})=>{
   const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Content-Type":"application/json"},body:payload?JSON.stringify(payload):undefined});
   let data;try{data=await r.json()}catch{data=null}
   return {ok:r.ok,status:r.status,data};
  },{method,path,payload,nonce});
  if(!value.ok)throw Error(method+" "+path.split("?")[0]+" HTTP "+value.status+" "+String(value.data?.code||""));
  return value.data;
 }
 const pages=await api("GET","/wp-json/wp/v2/pages?context=edit&per_page=100&_fields=id,slug,status,acf,content");
 if(!Array.isArray(pages))throw Error("WordPress pages inventory malformed");
 for(const def of defs){
  let matches=pages.filter(p=>p.slug===def.slug||p.acf?.key===def.key);
  if(matches.length>1)throw Error("Duplicate target Page for "+def.slug);
  const original=matches[0];
  if(original){
   if(original.slug!==def.slug||original.acf?.key!==def.key||original.acf?.action!==def.action||original.status!=="publish")throw Error("Existing Page conflict "+def.slug);
   result.reused.push({id:original.id,slug:def.slug});result.verified.push({id:original.id,slug:def.slug});continue;
  }
  let createdId=null;
  try{
   const draft=await api("POST","/wp-json/wp/v2/pages",{title:def.title,slug:def.slug,status:"draft",content:def.content,acf:{key:def.key,action:def.action,product_lang:"vi"}});
   createdId=draft?.id;
   if(!Number.isInteger(createdId)||createdId<=0)throw Error("Draft create failed "+def.slug);
   result.temporary_created.push(createdId);
   const before=await api("GET","/wp-json/wp/v2/pages/"+createdId+"?context=edit");
   if(before.slug!==def.slug||before.acf?.key!==def.key||before.acf?.action!==def.action||before.status!=="draft")throw Error("Draft ACF readback failed "+def.slug);
   await api("POST","/wp-json/wp/v2/pages/"+createdId,{status:"publish"});
   const verified=await api("GET","/wp-json/wp/v2/pages/"+createdId+"?context=edit");
   if(verified.status!=="publish"||verified.slug!==def.slug||verified.acf?.key!==def.key||verified.acf?.action!==def.action||!verified.content?.raw?.includes(def.title))throw Error("Published Page readback failed "+def.slug);
   result.created.push({id:createdId,slug:def.slug});
   result.verified.push({id:createdId,slug:def.slug});
   result.temporary_created=result.temporary_created.filter(id=>id!==createdId);
  }catch(e){
   if(createdId){
    try{const deleted=await api("DELETE","/wp-json/wp/v2/pages/"+createdId);if(deleted?.status!=="trash")result.cleanup_remaining.push(createdId)}
    catch{result.cleanup_remaining.push(createdId)}
   }
   throw e;
  }
 }
 if(result.verified.length!==2||result.cleanup_remaining.length)throw Error("Footer destination pages not verified or cleanup remaining");
 console.log("FOOTER_CMS_PAGES=PASS "+JSON.stringify(result));
 await page.close();
}catch(e){result.errors.push(String(e.message||e).slice(0,400));process.exitCode=1;console.error("FOOTER_CMS_PAGES=FAIL "+JSON.stringify(result))}
finally{await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");await browser.close()}
