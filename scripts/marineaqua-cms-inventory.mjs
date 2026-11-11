import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const origin = "https://admin.marine-aqua.io.vn";
const front = "https://marine-aqua.io.vn";
const outDir="cms-inventory-evidence";
await mkdir(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={pages:[],tables:[],admin:{},rest:{}};
try {
  const context=await browser.newContext({baseURL:origin});
  const urls=[
    ["pages","/wp-json/wp/v2/pages?status=publish&per_page=50&_fields=id,slug,status,title,content,acf"],
    ["tables","/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1"],
    ["menus","/wp-json/esc-api/v1/menus"],
    ["wp","/wp-json/"]
  ];
  for(const [label,path] of urls){
    try {
      const response=await context.request.get(path,{timeout:30000,failOnStatusCode:false});
      report.rest[label]={status:response.status(),type:response.headers()["content-type"]?.split(";")[0]};
      if(response.ok()){
        const data=await response.json();
        if(label==="pages"&&Array.isArray(data)){
          report.pages=data.map(p=>({
            id:p.id,slug:p.slug,status:p.status,key:p.acf?.key||"",
            action:p.acf?.action||"",locale:p.acf?.product_lang?.value||p.acf?.product_lang||"",
            shortcodeIds:[...(p.content?.rendered||"").matchAll(/\[table\s+id\s*=\s*["']?([a-zA-Z0-9_-]+)/g)].map(x=>x[1]),
            contentLength:(p.content?.rendered||"").length
          }));
          console.log("CMS_PUBLISHED_PAGES="+JSON.stringify(report.pages));
        }else if(label==="tables"&&Array.isArray(data)){
          report.tables=data.map(t=>({
            id:t.id||t.table_id||"",name:t.name||t.table_name||"",
            title:t.title||"",columns:Array.isArray(t.data)?t.data[0]:undefined,
            items:Array.isArray(t.data)?t.data.length:undefined,
            component:t.options?.component||t.meta?.component||""
          }));
          console.log("CMS_TABLE_INVENTORY="+JSON.stringify(report.tables).slice(0,15000));
        }else if(label==="menus"){
          const header=data?.success===true?data?.menus?.Header:{};
          console.log("CMS_HEADER_LOCALES="+JSON.stringify(Object.fromEntries(Object.entries(header||{}).map(([lang,v])=>[lang,v?.items?.length||0]))));
        }else if(label==="wp"){
          report.rest[label].hasTablepressRoutes=Object.keys(data?.routes||{}).filter(x=>x.startsWith("/tablepress/")).slice(0,30);
          console.log("CMS_TABLEPRESS_ROUTES="+JSON.stringify(report.rest[label].hasTablepressRoutes));
        }
      }
    }catch(e){report.rest[label]={error:String(e.code||e.name||"request")};console.log("CMS_REST_"+label.toUpperCase()+"=ERROR "+report.rest[label].error)}
  }
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  report.admin.credentialsConfigured=Boolean(username&&password);
  console.log("CMS_ADMIN_CREDENTIALS_CONFIGURED="+(report.admin.credentialsConfigured?"yes":"no"));
  if(username&&password){
    const page=await context.newPage();
    try{
      await page.goto(origin+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
      await page.locator("#user_login").fill(username);
      await page.locator("#user_pass").fill(password);
      await page.locator("#wp-submit").click();
      await page.goto(origin+"/wp-admin/edit.php?post_type=page",{waitUntil:"domcontentloaded",timeout:45000});
      report.admin.pagesAccessible=page.url().includes("/wp-admin/edit.php");
      console.log("CMS_ADMIN_PAGES_ACCESSIBLE="+(report.admin.pagesAccessible?"yes":"no"));
      await page.goto(origin+"/wp-admin/admin.php?page=tablepress",{waitUntil:"domcontentloaded",timeout:45000});
      report.admin.tablepressAccessible=page.url().includes("page=tablepress")&&!page.url().includes("wp-login.php");
      report.admin.tablepressNewLinks=await page.locator("a[href*='page=tablepress_add']").count();
      console.log("CMS_ADMIN_TABLEPRESS_ACCESSIBLE="+(report.admin.tablepressAccessible?"yes":"no")+" add_links="+report.admin.tablepressNewLinks);
      await page.screenshot({path:outDir+"/tablepress-admin.png",fullPage:false});
    }catch(e){report.admin.error=String(e.message||e).slice(0,160);console.log("CMS_ADMIN_READONLY_ERROR="+String(e.name||"error"))}finally{await page.close()}
  }
  await context.close();
}finally{await browser.close()}
await writeFile(outDir+"/inventory.json",JSON.stringify(report,null,2)+"\n");
console.log("CMS_INVENTORY_READ_ONLY=COMPLETE; writes=0");
