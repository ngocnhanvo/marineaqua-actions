import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",DIR="promotion-header-evidence";
const TARGET="/san-pham/giam-gia-khung",ITEM_ID=82503,ITEM_KEY="approved-v3-2";
const report={scope:{itemId:ITEM_ID,target:TARGET},changed:false,status:"STARTED",errors:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
const check=(v,m)=>{if(!v)throw Error(m)};
const readMenu=async(context)=>{
 const response=await context.request.get(WP+"/wp-json/esc-api/v1/menus",{timeout:30000,failOnStatusCode:false});
 check(response.ok(),"WordPress Header API HTTP "+response.status());
 const data=await response.json();
 check(data?.success===true&&Array.isArray(data?.menus?.Header?.vi?.items),"Header VI API invalid");
 return data.menus.Header.vi.items;
};
const flatten=nodes=>nodes.flatMap(x=>[x,...flatten(x.children||[])]);
const normalize=x=>String(x||"").replace(/^\/+|\/+$/g,"");
const checksum=nodes=>JSON.stringify(flatten(nodes).map(x=>[x.id,x.key,x.label,x.href,x.slug,x.linkType,x.children?.map(y=>y.id)]).filter(x=>x[0]!==ITEM_ID));
try{
 check(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"Missing WP credentials");
 const context=await browser.newContext({baseURL:WP});
 const before=await readMenu(context);
 const beforeFlat=flatten(before);
 const item=beforeFlat.find(x=>x.id===ITEM_ID||x.key===ITEM_KEY);
 check(item?.id===ITEM_ID&&item.key===ITEM_KEY&&item.label==="Khuyến mãi","Promotion menu identity mismatch");
 const previousSignature=checksum(before);
 const prevMode=item.linkType,prevHref=item.href,prevSlug=item.slug;
 if(normalize(item.href||item.slug)===normalize(TARGET)){
  report.status="PASS";report.changed=false;
 }else{
  check(item.linkType==="none"&&!item.href&&!item.slug,"Existing promotion destination conflicts");
  const page=await context.newPage();
  await page.goto("/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator("#wp-submit").click();
  await page.goto("/wp-admin/nav-menus.php",{waitUntil:"domcontentloaded",timeout:45000});
  check(await page.locator("#menu-name").inputValue()==="Marine Aqua Header VI","Selected wrong Menu");
  check(await page.locator("#esc-menu-code").inputValue()==="Header"&&await page.locator("#esc-menu-lang").inputValue()==="vi","Wrong menu code or locale");
  const selector=page.locator('select[name="esc-menu-item-link-type[82503]"]');
  const field=page.locator('input[name="esc-menu-item-custom-url[82503]"]');
  check(await selector.count()===1&&await field.count()===1,"Native fields for promotion item absent");
  check(await selector.inputValue()==="none"&&(await field.inputValue())==="","Native item differs from REST preflight");
  check(checksum(await readMenu(context))===previousSignature,"Header modified concurrently");
  await page.locator("#edit-82503").click();
  await selector.selectOption("custom");
  await field.fill(TARGET);
  const save=page.locator("#save_menu_footer");
  check(await save.count()===1,"Native WordPress Save Menu control absent");
  await Promise.all([page.waitForLoadState("domcontentloaded").catch(()=>{}),save.click()]);
  report.changed=true;
  await page.waitForTimeout(1200);
  await page.screenshot({path:DIR+"/promotion-menu-saved.png"});
 }
 const after=await readMenu(context);
 const updated=flatten(after).find(x=>x.id===ITEM_ID||x.key===ITEM_KEY);
 report.after={id:updated?.id,key:updated?.key,href:updated?.href,slug:updated?.slug,linkType:updated?.linkType};
 check(updated?.id===ITEM_ID&&updated.key===ITEM_KEY&&updated.label==="Khuyến mãi","Promotion menu identity changed after save");
 check(normalize(updated.href||updated.slug)===normalize(TARGET),"Native menu destination not saved");
 check(checksum(after)===previousSignature,"Unrelated Header menu entries modified");
 report.status="PASS";
 console.log("PROMO_HEADER_NATIVE_ITEM_PASS="+JSON.stringify({changed:report.changed,after:report.after,totalItems:flatten(after).length}));
}catch(e){report.status="FAIL";report.errors.push(String(e.message||e).slice(0,500));console.error("PROMO_HEADER_NATIVE_ITEM_FAIL="+report.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+"/result.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
