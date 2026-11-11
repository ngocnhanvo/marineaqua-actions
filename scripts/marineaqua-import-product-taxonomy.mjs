import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const wp="https://admin.marine-aqua.io.vn";
const origin="https://marine-aqua.vn";
const out="product-taxonomy-import-evidence";
await mkdir(out,{recursive:true});
const report={scope:"WooCommerce product_cat only",source:origin,created:[],reused:[],errors:[],complete:false};
const browser=await chromium.launch({headless:true});
try{
  const user=process.env.WP_ADMIN_USERNAME;
  const password=process.env.WP_ADMIN_PASSWORD;
  if(!user||!password)throw Error("Missing WordPress admin login");
  const context=await browser.newContext({viewport:{width:1366,height:950}});
  const src=await context.newPage();
  await src.goto(origin+"/san-pham/",{waitUntil:"domcontentloaded",timeout:45000});
  const roots=await src.evaluate(()=>{
    const lists=[...document.querySelectorAll("ul.product-categories, .widget_product_categories ul")];
    const main=lists.sort((a,b)=>b.querySelectorAll('a[href*="/danh-muc/"]').length-a.querySelectorAll('a[href*="/danh-muc/"]').length)[0];
    const walk=ul=>[...ul.children].filter(li=>li.tagName==="LI").map(li=>{
      const a=li.querySelector(":scope > a");
      const child=li.querySelector(":scope > ul");
      return {name:a?.textContent?.trim()||"",url:a?.href||"",children:child?walk(child):[]};
    }).filter(item=>item.url.startsWith("https://marine-aqua.vn/danh-muc/"));
    return main?walk(main):[];
  });
  await src.close();
  const all=[];
  function traverse(nodes,parent=null){
    for(const node of nodes){
      const url=new URL(node.url);
      const slug=url.pathname.split("/").filter(Boolean).at(-1)||"";
      if(url.origin!==origin || !url.pathname.startsWith("/danh-muc/") ||
        !/^[a-z0-9-]{2,80}$/.test(slug) || !node.name || node.name.length>120)
        throw Error("Unexpected legacy taxonomy value "+String(node.url).slice(0,130));
      all.push({name:node.name,slug,parent});
      traverse(node.children,slug);
    }
  }
  traverse(roots);
  if(all.length<30||all.length>60||!all.some(x=>x.slug==="thuong-hieu"&&x.parent===null)||
     !all.some(x=>x.slug==="red-sea"&&x.parent==="thuong-hieu"))
    throw Error("Legacy category inventory incomplete or changed: "+all.length);
  if(new Set(all.map(x=>x.slug)).size!==all.length)
    throw Error("Legacy category slugs are not unique; stop before changes");
  report.sourceCount=all.length;
  report.sourceRoots=roots.length;
  console.log("PRODUCT_TAXONOMY_SOURCE=PASS count="+all.length+" roots="+roots.length);
  const taxonomyUrl=wp+"/wp-admin/edit-tags.php?taxonomy=product_cat&post_type=product";
  async function readAll(){
    const response=await context.request.get(wp+"/wp-json/api/products/categories?orderby=menu_order&order=ASC",
      {timeout:30000,failOnStatusCode:false});
    if(!response.ok())throw Error("Destination product category API HTTP "+response.status());
    const json=await response.json();
    if(!Array.isArray(json))throw Error("Destination taxonomy API response not an array");
    const output=[];
    function visit(nodes){
      for(const n of nodes){
        if(Number(n.id)>0&&n.slug)output.push({id:Number(n.id),slug:String(n.slug),parent:Number(n.parent||0),name:String(n.name||"")});
        if(Array.isArray(n.children))visit(n.children);
      }
    }
    visit(json);
    return output;
  }
  const initial=await readAll();
  report.initialCount=initial.length;
  if(initial.some(x=>x.slug!=="uncategorized"&&!all.some(y=>y.slug===x.slug)))
    throw Error("Unexpected destination taxonomy categories; manual reconciliation required");
  const page=await context.newPage();
  await page.goto(wp+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
  await page.locator("#user_login").fill(user);
  await page.locator("#user_pass").fill(password);
  await page.locator("#wp-submit").click();
  await page.goto(taxonomyUrl,{waitUntil:"domcontentloaded",timeout:45000});
  if(page.url().includes("wp-login.php")||!await page.locator("#addtag").count())
    throw Error("Authenticated native WooCommerce category editor inaccessible");
  let current=initial;
  for(const item of all){
    const already=current.find(x=>x.slug===item.slug);
    const parentId=item.parent ? current.find(x=>x.slug===item.parent)?.id : 0;
    if(item.parent&&!parentId)throw Error("Parent was not created for "+item.slug);
    if(already){
      if(already.parent!==parentId || already.name!==item.name)
        throw Error("Existing slug differs from source: "+item.slug);
      report.reused.push({slug:item.slug,id:already.id});
      continue;
    }
    // Mutate only the WooCommerce term-add form. Each step reads back via
    // the public taxonomy endpoint and can safely resume on partial progress.
    await page.goto(taxonomyUrl,{waitUntil:"domcontentloaded",timeout:45000});
    await page.locator("#tag-name").fill(item.name);
    await page.locator("#tag-slug").fill(item.slug);
    if(parentId){
      const option=page.locator("#parent option[value='"+parentId+"']");
      if(!await option.count())throw Error("Parent absent in native selector for "+item.slug);
      await page.locator("#parent").selectOption(String(parentId));
    }else{
      await page.locator("#parent").selectOption("-1");
    }
    await page.locator("#addtag input[type=submit]").click();
    let created=null;
    for(let attempt=0;attempt<16;attempt++){
      await page.waitForTimeout(650);
      current=await readAll();
      created=current.find(x=>x.slug===item.slug);
      if(created)break;
    }
    if(!created||created.parent!==parentId||created.name!==item.name)
      throw Error("Native taxonomy save/readback failed at "+item.slug);
    report.created.push({slug:item.slug,id:created.id,parentId});
    console.log("PRODUCT_CATEGORY_SAVED="+item.slug+" id="+created.id+" parent="+parentId);
  }
  const final=await readAll();
  const finalMap=new Map(final.map(item=>[item.slug,item]));
  const mismatch=all.filter(item=>{
    const x=finalMap.get(item.slug);
    const parentId=item.parent?finalMap.get(item.parent)?.id:0;
    return !x||x.name!==item.name||x.parent!==parentId;
  });
  report.finalCount=final.length;
  report.complete=mismatch.length===0;
  if(!report.complete)throw Error("Taxonomy REST mismatch count="+mismatch.length);
  console.log("PRODUCT_TAXONOMY_IMPORT=PASS count="+all.length+" created="+report.created.length+" reused="+report.reused.length);
  await page.screenshot({path:out+"/taxonomy-after.png",fullPage:false});
  await page.close();await context.close();
}catch(error){
  report.errors.push(String(error.message||error).slice(0,500));
  console.error("PRODUCT_TAXONOMY_IMPORT=FAIL "+report.errors.at(-1));
  process.exitCode=1;
}finally{
  await writeFile(out+"/result.json",JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
