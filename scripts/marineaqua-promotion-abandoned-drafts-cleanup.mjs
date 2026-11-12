import { chromium } from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const WP="https://admin.marine-aqua.io.vn",DIR="promotion-drafts-cleanup-evidence";
const IDS=[83262,83264,83266];
const report={scope:IDS,trashed:[],alreadyTrashed:[],skipped:[],errors:[],cleanupRemaining:[],status:"STARTED"};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing CMS credentials");
 const context=await browser.newContext();
 const p=await context.newPage();
 await p.goto(WP+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
 await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
 await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
 await p.locator("#wp-submit").click();
 await p.goto(WP+"/wp-admin/post-new.php?post_type=page",{waitUntil:"domcontentloaded",timeout:45000});
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;let r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return r.ok?(await r.text()).trim():""});
 if(!/^[a-zA-Z0-9]{8,32}$/.test(nonce))throw Error("REST nonce unavailable");
 async function api(method,path){
  const r=await context.request.fetch(WP+path,{method,headers:{"X-WP-Nonce":nonce},failOnStatusCode:false,timeout:35000});
  if(!r.ok())throw Error(method+" "+path.split("?")[0]+" HTTP "+r.status());
  return r.json();
 }
 for(const id of IDS){
  const before=await api("GET","/wp-json/wp/v2/pages/"+id+"?context=edit");
  const locale=typeof before.acf?.product_lang==="object"?before.acf.product_lang.value:before.acf?.product_lang;
  if(before.status==="trash"){report.alreadyTrashed.push(id);continue;}
  const expected=/^khuyen-mai(?:-2|-3)?$/.test(before.slug||"")&&before.acf?.key==="promotions"&&before.acf?.action==="HomePage"&&locale==="vi"&&
    String(before.title?.raw||before.title?.rendered||"").trim()==="Khuyến mãi"&&
    before.status==="draft"&&!String(before.content?.raw||"").trim();
  if(!expected){report.skipped.push({id,status:before.status,slug:before.slug,reason:"not an empty automation-owned promotion draft"});continue;}
  const trashed=await api("DELETE","/wp-json/wp/v2/pages/"+id);
  if(trashed?.status!=="trash")throw Error("Page "+id+" did not enter Trash");
  const checked=await api("GET","/wp-json/wp/v2/pages/"+id+"?context=edit");
  if(checked.status!=="trash")throw Error("REST readback not trashed "+id);
  report.trashed.push(id);
 }
 report.cleanupRemaining=report.skipped.map(x=>x.id);
 report.status=report.cleanupRemaining.length?"PARTIAL":"PASS";
 console.log("PROMO_ABORTED_DRAFTS_CLEANUP="+JSON.stringify(report));
 if(report.cleanupRemaining.length)process.exitCode=1;
}catch(e){report.errors.push(String(e.message||e).slice(0,300));report.status="FAIL";console.error("PROMO_DRAFTS_CLEANUP_FAILED="+report.errors.at(-1));process.exitCode=1}
finally{await writeFile(DIR+"/result.json",JSON.stringify(report,null,2)+"\n");await browser.close()}
