import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const source = "https://marine-aqua.vn";
const target = "https://admin.marine-aqua.io.vn";
const out = "catalog-audit-evidence";
const brands = ["TROPIC-MARIN","PRODIBIO","PRODAC","RED SEA","CONTINUUM AQUATICS"];
const report = { scope: "read-only", source, target, groups: [], products: [], api: {}, errors: [] };
await mkdir(out,{recursive:true});
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({viewport:{width:1366,height:920}});
  const page = await context.newPage();
  const home = await page.goto(source+"/",{waitUntil:"domcontentloaded",timeout:45000});
  if (!home?.ok()) throw Error("Source home HTTP "+home?.status());
  const groups = await page.evaluate(brands=>{
    const norm = s=>String(s||"").replace(/\s+/g," ").trim().toUpperCase();
    const headings = [...document.querySelectorAll("h1,h2,h3,h4")];
    return brands.map(label=>{
      const heading=headings.find(x=>norm(x.textContent)===label);
      if(!heading) throw Error("Source missing heading "+label);
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT);
      walker.currentNode=heading;
      const links=[],seen=new Set();
      let node;
      while((node=walker.nextNode())){
        if(node.matches("h1,h2")&&brands.some(b=>norm(node.textContent)===b))break;
        if(node.tagName!=="A")continue;
        let url;
        try{url=new URL(node.getAttribute("href")||"",location.href)}catch{continue}
        if(url.origin!==location.origin||!/^\/san-pham\/[^/]+\/?$/.test(url.pathname))continue;
        if(!seen.has(url.pathname)){seen.add(url.pathname);links.push(url.href)}
      }
      return {label,links:links.slice(0,4),count:links.length};
    });
  },brands);
  report.groups=groups;
  if(groups.some(g=>g.links.length!==4)||new Set(groups.flatMap(g=>g.links)).size!==20)throw Error("Source brand groups do not match expected unique 20 products");
  console.log("SOURCE_GROUPS="+JSON.stringify(groups));
  for(const url of groups.flatMap(g=>g.links)){
    const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
    if(!response?.ok())throw Error("Source product HTTP "+response?.status());
    const product=await page.evaluate(()=>{
      const title=document.querySelector("h1.product_title,h1.entry-title,main h1")?.textContent?.trim()||"";
      const imageNodes=[...document.querySelectorAll(".woocommerce-product-gallery__image img,.woocommerce-product-gallery img")];
      const images=[...new Map(imageNodes.map(img=>{
        const raw=img.dataset.large_image||img.getAttribute("data-src")||img.getAttribute("src")||"";
        const src=new URL(raw,location.href).href;
        return [src,{src,alt:img.alt||title}];
      })).values()].filter(img=>img.src.startsWith(location.origin+"/wp-content/uploads/"));
      return {
        title,
        sku:document.querySelector(".sku")?.textContent?.trim()||"",
        price:document.querySelector(".summary .price,.product .price")?.textContent?.trim()||"",
        stock:document.querySelector(".stock")?.textContent?.trim()||"",
        summary:document.querySelector(".woocommerce-product-details__short-description")?.textContent?.trim().slice(0,700)||"",
        description:document.querySelector("#tab-description,.woocommerce-Tabs-panel--description")?.textContent?.trim().slice(0,2000)||"",
        seo:document.querySelector('meta[name="description"]')?.content||"",
        images,
        sourceId:(document.body.className.match(/postid-(\d+)/)||[])[1]||""
      };
    });
    if(!product.title||!product.images.length)throw Error("Product metadata/images missing: "+url);
    report.products.push({url,...product});
  }
  console.log("SOURCE_PRODUCTS=PASS count="+report.products.length);
  console.log("SOURCE_DETAILS="+JSON.stringify(report.products.map(p=>({slug:new URL(p.url).pathname.split("/").filter(Boolean).at(-1),title:p.title,price:p.price,stock:p.stock,id:p.sourceId,image:p.images[0]?.src.split("/").at(-1)}))));
  const user=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  if(!user||!password)throw Error("Missing WordPress admin auth");
  const admin=await context.newPage();
  await admin.goto(target+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
  await admin.locator("#user_login").fill(user);await admin.locator("#user_pass").fill(password);
  await admin.locator("#wp-submit").click();
  await admin.goto(target+"/wp-admin/post-new.php?post_type=product",{waitUntil:"domcontentloaded",timeout:45000});
  if(admin.url().includes("wp-login.php"))throw Error("Target WooCommerce product editor inaccessible");
  const nonce=await admin.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    return r.ok?(await r.text()).trim():"";
  });
  report.nonceAvailable=Boolean(nonce);
  for(const route of ["/wp-json/wp/v2/types/product?context=edit","/wp-json/wp/v2/product?context=edit&per_page=1","/wp-json/wc/v3/products?per_page=1","/wp-json/wp/v2/media?context=edit&per_page=1","/wp-json/api/products?per_page=1","/wp-json/api/products/categories"]){
    const r=await context.request.get(target+route,{headers:{"X-WP-Nonce":nonce},failOnStatusCode:false,timeout:35000});
    let data;try{data=await r.json()}catch{data=null}
    report.api[route]={status:r.status(),code:data?.code||"",count:Array.isArray(data)?data.length:undefined};
  }
  console.log("TARGET_API_PREFLIGHT="+JSON.stringify({nonce:report.nonceAvailable,api:report.api}));
  await admin.close();await context.close();
}catch(e){report.errors.push(String(e?.message||e).slice(0,500));console.error("AUDIT_FAILED="+report.errors.at(-1));process.exitCode=1}
finally{await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
