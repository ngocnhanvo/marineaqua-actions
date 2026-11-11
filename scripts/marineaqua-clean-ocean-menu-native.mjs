import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const origin="https://admin.marine-aqua.io.vn";
const locale="vi";
const outDir="clean-ocean-header-evidence";
const oldLabels=[
  "Trang chủ","GIẢM GIÁ KHỦNG","CHÍNH SÁCH VÀ HƯỚNG DẪN",
  "THỜI GIAN BÁN HÀNG","LIÊN HỆ","PHÍ SHIP HÀNG",
  "BÀI VIẾT CHIA SẺ KINH NGHIỆM"
];
const normalize=s=>String(s||"").replace(/⚡/g,"").trim().toLocaleLowerCase("vi");
const getLabel=i=>String(i?.label||i?.title||"");
const previousItems=[
  {key:"home",lang:locale,label:"Trang chủ",pageId:82454,linkMode:"page",children:[]},
  {key:"approved-v3-2",lang:locale,label:"⚡ GIẢM GIÁ KHỦNG",linkMode:"none",children:[]},
  {key:"approved-v3-3",lang:locale,label:"CHÍNH SÁCH VÀ HƯỚNG DẪN",linkMode:"none",children:[]},
  {key:"approved-v3-4",lang:locale,label:"THỜI GIAN BÁN HÀNG",linkMode:"none",children:[]},
  {key:"approved-v3-5",lang:locale,label:"LIÊN HỆ",linkMode:"none",children:[]},
  {key:"approved-v3-6",lang:locale,label:"PHÍ SHIP HÀNG",linkMode:"none",children:[]},
  {key:"approved-v3-7",lang:locale,label:"BÀI VIẾT CHIA SẺ KINH NGHIỆM",linkMode:"none",children:[]}
];
const cleanItems=[
  previousItems[0],
  {key:"approved-v3-2",lang:locale,label:"Khuyến mãi",linkMode:"none",children:[]},
  {key:"approved-v3-7",lang:locale,label:"Kiến thức",linkMode:"none",children:[]},
  {key:"marine-support",lang:locale,label:"Hỗ trợ",linkMode:"none",children:[
    {key:"approved-v3-3",lang:locale,label:"Chính sách và hướng dẫn",linkMode:"none",children:[]},
    {key:"approved-v3-4",lang:locale,label:"Thời gian bán hàng",linkMode:"none",children:[]},
    {key:"approved-v3-6",lang:locale,label:"Phí ship hàng",linkMode:"none",children:[]}
  ]},
  {key:"approved-v3-5",lang:locale,label:"Liên hệ",linkMode:"none",children:[]}
];
const expectedLabels=["Trang chủ","Khuyến mãi","Kiến thức","Hỗ trợ","Liên hệ"];
const expectedSupport=["Chính sách và hướng dẫn","Thời gian bán hàng","Phí ship hàng"];
const evidence={origin,locale,change:"Clean Ocean menu grouping",before:[],after:[],written:false,verified:false};
await mkdir(outDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const readMenu=async(context)=>{
  const response=await context.request.get(origin+"/wp-json/esc-api/v1/menus",{timeout:30000});
  if(!response.ok())throw Error("Header REST HTTP "+response.status());
  const payload=await response.json();
  const items=payload?.menus?.Header?.[locale]?.items;
  if(payload?.success!==true||!Array.isArray(items))throw Error("Header REST invalid");
  return items;
};
const expectedOld=items=>items.length===7&&items.every((item,i)=>normalize(getLabel(item))===normalize(oldLabels[i]))
  && normalize(getLabel(items[0]))==="trang chủ" && items[0].linkType!=="none";
const expectedClean=items=>items.length===5
  && items.every((item,i)=>normalize(getLabel(item))===normalize(expectedLabels[i]))
  && items[3]?.children?.length===3
  && items[3].children.every((child,i)=>normalize(getLabel(child))===normalize(expectedSupport[i]))
  && items[0].linkType!=="none";
const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
let context,page;
try{
  context=await browser.newContext({baseURL:origin});
  const before=await readMenu(context);
  evidence.before=before.map(getLabel);
  if(expectedClean(before)){
    evidence.verified=true;
    console.log("CLEAN_OCEAN_CMS_HEADER=ALREADY_PRESENT");
  }else{
    if(!expectedOld(before))throw Error("Existing Header differs from verified 7-item source; refusing write");
    if(!username||!password)throw Error("Missing WordPress Admin secrets");
    page=await context.newPage();
    await page.goto("/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
    await page.locator("#user_login").fill(username);
    await page.locator("#user_pass").fill(password);
    await page.locator("#wp-submit").click();
    await page.goto("/wp-admin/nav-menus.php",{waitUntil:"domcontentloaded",timeout:45000});
    if(!page.url().includes("/wp-admin/nav-menus.php"))throw Error("Native WordPress Menu Manager unavailable");
    if(await page.locator("#menu-name").inputValue()!=="Marine Aqua Header VI")
      throw Error("Wrong WordPress menu selected");
    if(await page.locator("#esc-menu-code").inputValue()!=="Header" ||
       await page.locator("#esc-menu-lang").inputValue()!==locale)
      throw Error("Wrong WordPress menu code/locale");
    const count=await page.locator("#menu-to-edit > li").count();
    if(count!==7)throw Error("Native manager item count differs from REST: "+count);
    const current=await readMenu(context);
    if(!expectedOld(current))throw Error("Header edited concurrently");
    const importer=page.locator("#esc-pse-menu-json-input");
    const resultBox=page.locator("#esc-pse-menu-json-result");
    const preview=async(data)=>{
      await importer.fill(JSON.stringify(data));
      await page.locator("#esc-pse-menu-json-preview").click();
      await resultBox.waitFor({state:"visible",timeout:25000});
      const result=await resultBox.innerText();
      return result;
    };
    const previewText=await preview(cleanItems);
    evidence.preview=previewText.slice(0,280);
    if(!previewText.includes("8 items hợp lệ") ||
       !previewText.includes("1 items match được Page") ||
       !previewText.includes("0 items dùng custom URL") ||
       !previewText.includes("7 items không có liên kết"))
      throw Error("Native WordPress menu preview did not validate 8 entries: "+previewText.slice(0,160));
    if(!expectedOld(await readMenu(context)))throw Error("Header changed after preview");
    page.once("dialog",dialog=>dialog.accept());
    await Promise.all([
      page.waitForEvent("load",{timeout:30000}),
      page.locator("#esc-pse-menu-json-replace").click()
    ]);
    evidence.written=true;
    const after=await readMenu(context);
    if(!expectedClean(after)){
      evidence.rollbackAttempted=true;
      const oldPreview=await preview(previousItems);
      if(!oldPreview.includes("7 items hợp lệ"))throw Error("Menu invalid after write and rollback preview failed");
      page.once("dialog",dialog=>dialog.accept());
      await Promise.all([
        page.waitForEvent("load",{timeout:30000}),
        page.locator("#esc-pse-menu-json-replace").click()
      ]);
      const restored=await readMenu(context);
      evidence.rollbackVerified=expectedOld(restored);
      throw Error("New Header failed REST verification; old menu restored="+evidence.rollbackVerified);
    }
    evidence.after=after.map(getLabel);
    evidence.verified=true;
    await page.screenshot({path:outDir+"/clean-ocean-native-menu.png",fullPage:false});
    console.log("CLEAN_OCEAN_CMS_HEADER=PASS "+JSON.stringify({items:after.length,children:after[3].children.length}));
  }
}catch(error){
  evidence.error=String(error.message||error).slice(0,350);
  console.error("CLEAN_OCEAN_CMS_HEADER=FAIL "+evidence.error);
  process.exitCode=1;
}finally{
  await page?.close().catch(()=>{});
  await context?.close().catch(()=>{});
  await browser.close();
  await writeFile(outDir+"/result.json",JSON.stringify(evidence,null,2)+"\n");
}
