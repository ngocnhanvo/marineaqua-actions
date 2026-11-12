import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",DIR="promotion-header-evidence";
const URL="/san-pham/giam-gia-khung",KEY="approved-v3-2";
const result={scope:"Header/vi promotion link only",status:"STARTED",errors:[],changed:false};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
const check=(v,m)=>{if(!v)throw Error(m)};
const expected=["Trang chủ","Khuyến mãi","Kiến thức","Hỗ trợ","Liên hệ"];
const support=["Chính sách và hướng dẫn","Thời gian bán hàng","Phí ship hàng"];
const label=x=>String(x?.label||x?.title||"").trim();
const getMenu=async(context)=>{
 const response=await context.request.get(WP+"/wp-json/esc-api/v1/menus",{timeout:30000,failOnStatusCode:false});
 check(response.ok(),"Header menu HTTP "+response.status());
 const data=await response.json();
 check(data?.success===true&&Array.isArray(data?.menus?.Header?.vi?.items),"WordPress header schema invalid");
 return data.menus.Header.vi.items;
};
const guard=items=>{
 check(items.length===5&&items.every((x,i)=>label(x)===expected[i]),"WordPress Header main labels changed");
 check(items[3]?.children?.length===3&&items[3].children.every((x,i)=>label(x)===support[i]),"Support menu tree changed");
 check(items[1]?.key===KEY,"Promotion menu key mismatch");
 check(items[0]?.linkType!=="none","Home menu reference missing");
};
try{
 check(process.env.WP_ADMIN_USERNAME&&process.env.WP_ADMIN_PASSWORD,"Missing WP credentials");
 const context=await browser.newContext({baseURL:WP});
 const before=await getMenu(context);
 guard(before);
 result.before=before.map(x=>({key:x.key,label:label(x),href:x.href,slug:x.slug,linkType:x.linkType,children:x.children?.length||0}));
 const promo=before[1];
 if(promo.href===URL||promo.slug===URL||promo.href?.endsWith(URL)){
  result.status="PASS";result.changed=false;
 }else{
  check(promo.linkType==="none"&&!promo.href&&!promo.slug,"Promotion link already configured differently");
  const items=[
   {key:"home",lang:"vi",label:"Trang chủ",pageId:82454,linkMode:"page",children:[]},
   {key:KEY,lang:"vi",label:"Khuyến mãi",linkMode:"custom",url:URL,children:[]},
   {key:"approved-v3-7",lang:"vi",label:"Kiến thức",linkMode:"none",children:[]},
   {key:"marine-support",lang:"vi",label:"Hỗ trợ",linkMode:"none",children:[
    {key:"approved-v3-3",lang:"vi",label:"Chính sách và hướng dẫn",linkMode:"none",children:[]},
    {key:"approved-v3-4",lang:"vi",label:"Thời gian bán hàng",linkMode:"none",children:[]},
    {key:"approved-v3-6",lang:"vi",label:"Phí ship hàng",linkMode:"none",children:[]}
   ]},
   {key:"approved-v3-5",lang:"vi",label:"Liên hệ",linkMode:"none",children:[]}
  ];
  const byKey=new Map(before.flatMap(x=>[x,...(x.children||[])]).map(x=>[x.key,x]));
  check(items.flatMap(x=>[x,...x.children]).every(x=>byKey.has(x.key)&&label(byKey.get(x.key))===x.label),"Menu item identity mismatch");
  check([...byKey.values()].every(x=>x.key===KEY||x.key==="home"||x.linkType==="none"),"Other menu links present, refusing menu replacement");
  const page=await context.newPage();
  await page.goto("/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  await page.locator("#wp-submit").click();
  await page.goto("/wp-admin/nav-menus.php",{waitUntil:"domcontentloaded",timeout:45000});
  check(await page.locator("#menu-name").inputValue()==="Marine Aqua Header VI","Wrong selected menu");
  check(await page.locator("#esc-menu-code").inputValue()==="Header"&&await page.locator("#esc-menu-lang").inputValue()==="vi","Wrong Header scope");
  const input=page.locator("#esc-pse-menu-json-input");
  await input.fill(JSON.stringify(items));
  await page.locator("#esc-pse-menu-json-preview").click();
  const box=page.locator("#esc-pse-menu-json-result");
  await box.waitFor({state:"visible",timeout:20000});
  const preview=await box.innerText();
  result.preview=preview.slice(0,550);
  console.log("PROMO_HEADER_PREVIEW="+result.preview);
  check(/8 items hợp lệ/.test(preview)&&/1 items dùng custom URL/.test(preview),"Native importer validation failed");
  guard(await getMenu(context));
  const current=await getMenu(context);
  check(current[1].linkType==="none"&&current[1].key===KEY,"Header changed concurrently");
  page.once("dialog",d=>d.accept());
  await Promise.all([page.waitForEvent("load",{timeout:30000}),page.locator("#esc-pse-menu-json-replace").click()]);
  result.changed=true;
  await page.screenshot({path:DIR+"/promotion-menu-admin.png"});
 }
 const final=await getMenu(context);
 guard(final);
 result.after=final.map(x=>({key:x.key,label:label(x),href:x.href,slug:x.slug,linkType:x.linkType}));
 check(final[1].key===KEY&&(final[1].href===URL||final[1].slug===URL||String(final[1].href||"").endsWith(URL)), "Promotion menu destination not saved");
 result.status="PASS";
 console.log("PROMO_HEADER_MENU_PASS="+JSON.stringify({changed:result.changed,href:final[1].href,slug:final[1].slug,linkType:final[1].linkType}));
}catch(e){result.status="FAIL";result.errors.push(String(e.message||e).slice(0,400));console.error("PROMO_HEADER_MENU_FAIL="+result.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+"/result.json",JSON.stringify(result,null,2)+"\n");await browser.close()}
