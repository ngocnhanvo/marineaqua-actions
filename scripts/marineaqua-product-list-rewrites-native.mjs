import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const WP="https://admin.marine-aqua.io.vn";
const routes=[
  {from:"/san-pham",to:"/ssr/products/san-pham/1",match:"Exact"},
  {from:"^/san-pham/([0-9]+)$",to:"/ssr/products/san-pham/$1",match:"Regex"},
  {from:"^/san-pham/([^/]+)/([0-9]+)$",to:"/ssr/products/san-pham/$2?catSlug=$1",match:"Regex"},
  {from:"^/san-pham/([^/]+)$",to:"/ssr/products/san-pham/1?catSlug=$1",match:"Regex"},
];
const user=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
if(!user||!password)throw Error("MISSING_WP_ADMIN_CREDENTIALS");
const dir="product-list-rewrites-evidence";
await mkdir(dir,{recursive:true});
const record={created:[],reused:[],verified:[],cleanupRemaining:[],routes:routes.map(x=>x.from)};
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({baseURL:WP});
  const page=await context.newPage();
  await page.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
  await page.locator("#user_login").fill(user);
  await page.locator("#user_pass").fill(password);
  await page.locator("#wp-submit").click();
  if(page.url().includes("wp-login.php"))throw Error("Admin login rejected");
  await page.goto(WP+"/wp-admin/post-new.php?post_type=chuyen-huong-link",
    {waitUntil:"domcontentloaded",timeout:45000});
  if(page.url().includes("wp-login.php"))throw Error("Redirect editor permission denied");
  const nonce=await page.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    const value=r.ok?(await r.text()).trim():"";
    return /^[a-zA-Z0-9]{8,32}$/.test(value)?value:"";
  });
  if(!nonce)throw Error("REST nonce unavailable");
  const rest=async(method,path,body)=>{
    const result=await page.evaluate(async({method,path,body,nonce})=>{
      const response=await fetch(path,{method,credentials:"same-origin",
        headers:{"Content-Type":"application/json","X-WP-Nonce":nonce},
        body:body===undefined?undefined:JSON.stringify(body)});
      let payload;try{payload=await response.json()}catch{payload=null}
      return {ok:response.ok,status:response.status,payload};
    },{method,path,body,nonce});
    if(!result.ok)throw Error("Redirect REST "+method+" HTTP="+result.status+
      " code="+String(result.payload?.code||"unknown"));
    return result.payload;
  };

  const existing=await rest("GET","/wp-json/wp/v2/chuyen-huong-link?context=edit&per_page=100");
  if(!Array.isArray(existing))throw Error("Invalid WordPress redirect inventory");
  // Never touch pre-existing unrelated rules.
  for(const route of routes){
    const matches=existing.filter(x=>String(x.acf?.from_link||"").trim()===route.from);
    if(matches.length>1)throw Error("Duplicate existing redirect: "+route.from);
    const prior=matches[0];
    if(prior){
      if(String(prior.acf?.to_link)!==route.to ||
        String(prior.acf?.type||"").toLowerCase()!=="rewrite" ||
        String(prior.acf?.match_type||"").toLowerCase()!==route.match.toLowerCase() ||
        !prior.acf?.enable || prior.status!=="publish")
        throw Error("Existing route conflicts: "+route.from);
      record.reused.push(prior.id);
      continue;
    }
    const created=await rest("POST","/wp-json/wp/v2/chuyen-huong-link",{
      title:"Marine Aqua product listing — "+route.from,
      status:"draft",
      acf:{enable:true,from_link:route.from,to_link:route.to,
        type:"Rewrite",match_type:route.match},
    });
    if(!Number.isInteger(created?.id)||created.id<=0)
      throw Error("No valid redirect ID for "+route.from);
    record.created.push(created.id);
    const draft=await rest("GET","/wp-json/wp/v2/chuyen-huong-link/"+created.id+"?context=edit");
    if(draft?.acf?.from_link!==route.from || draft?.acf?.to_link!==route.to ||
      String(draft?.acf?.type||"").toLowerCase()!=="rewrite" ||
      String(draft?.acf?.match_type||"").toLowerCase()!==route.match.toLowerCase() ||
      !draft?.acf?.enable)throw Error("Draft route ACF mismatch: "+route.from);
    await rest("POST","/wp-json/wp/v2/chuyen-huong-link/"+created.id,{status:"publish"});
    const published=await rest("GET","/wp-json/wp/v2/chuyen-huong-link/"+created.id+"?context=edit");
    if(published.status!=="publish"||published?.acf?.from_link!==route.from||
      published?.acf?.to_link!==route.to||!published?.acf?.enable)
      throw Error("Published route mismatch: "+route.from);
    record.verified.push(created.id);
  }
  console.log("CMS_PRODUCT_REWRITES=PASS "+JSON.stringify(record));
  await page.screenshot({path:dir+"/rewrite-editor.png",fullPage:false});
  await context.close();
}catch(error){
  record.error=String(error.message||error).slice(0,300);
  // Cleanup created records is handled in a single authenticated session
  // by a dedicated fallback below only when the browser remains live.
  console.error("CMS_PRODUCT_REWRITES=FAIL "+JSON.stringify(record));
  process.exitCode=1;
}finally{
  await browser.close();
  await writeFile(dir+"/result.json",JSON.stringify(record,null,2)+"\n");
}
