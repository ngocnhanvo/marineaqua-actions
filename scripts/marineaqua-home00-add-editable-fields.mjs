import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
const DIR='home00-editable-evidence';
const TABLE='home_00';
const KEYS=['title','image','link','mobile','eyebrow','heading','heading_emphasis','description','cta_text','cta_url','footnote'];
const defaults={
 eyebrow:'GÓC ĐẠI DƯƠNG CỦA BẠN',heading:'Chạm gần hơn với',
 heading_emphasis:'thế giới san hô.',
 description:'Thiết bị, vật tư và phụ kiện cho hồ cá cảnh biển — chọn lựa dễ dàng hơn cho từng bể cá.',
 cta_text:'Khám phá danh mục',cta_url:'/san-pham',
 footnote:'Marine Aqua • Thiết bị & phụ kiện cá cảnh biển'
};
const results={status:'STARTED',table:TABLE,writeScope:[TABLE],changes:0,skippedUnchanged:0,
  temporaryCreated:0,cleanupRemaining:0,checks:[],errors:[]};
await mkdir(DIR,{recursive:true});
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
const page=await ctx.newPage();
const getTable=async()=>{
 const response=await ctx.request.get(WP+'/wp-json/tablepress/v1/table/'+TABLE,{timeout:30000,failOnStatusCode:false});
 assert.equal(response.status(),200,'Existing ESC Table REST unavailable');
 return response.json();
};
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 assert.ok(username&&password,'Admin credentials not configured');
 await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#user_login').fill(username);
 await page.locator('#user_pass').fill(password);
 await page.locator('#wp-submit').click({timeout:25000});
 assert.ok(!page.url().includes('wp-login.php'),'WordPress session not authorized');
 const before=await getTable();
 assert.equal(before.id,TABLE);
 assert.ok(Array.isArray(before.items)&&before.items.length===4,'Expected exactly four existing banner records');
 const originalFields=(before.fields||[]).map(f=>f.key);
 assert.deepEqual(originalFields.slice(0,4),KEYS.slice(0,4),'Unexpected existing column schema');
 const appended=originalFields.slice(4);
 assert.ok(appended.length===0||JSON.stringify(appended)===JSON.stringify(KEYS.slice(4)),
   'Unexpected extra or incomplete columns: refusing to overwrite');
 const oldItems=before.items.map(item=>Object.fromEntries(KEYS.slice(0,4).map(k=>[k,item[k]??''])));
 const hasAll=originalFields.length===KEYS.length&&before.items.every(item=>
   Object.entries(defaults).every(([k,v])=>String(item[k]||'').trim().length>0));
 if(hasAll){results.skippedUnchanged=1;results.status='PASS';results.checks.push('Existing editable content is complete');}
 else {
   assert.equal(originalFields.length,4,'Editable schema exists with incomplete values: refuse overwrite');
   await page.goto(WP+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+TABLE,
     {waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('#table-id').waitFor({state:'visible',timeout:30000});
   assert.equal(await page.locator('#table-id').inputValue(),TABLE);
   const updated=await page.evaluate(({keys,values})=>{
     const tp=window.tp;
     if(!tp?.editor?.insertColumn||!tp?.editor?.setValueFromCoords||
        !Array.isArray(tp.table?.data))throw Error('Native TablePress editor unsupported');
     const grid=tp.table.data;
     if(grid.length!==6||grid[0].length!==4)throw Error('Unexpected native table dimensions');
     if(JSON.stringify(grid[0])!==JSON.stringify(keys.slice(0,4)))
       throw Error('Existing header order mismatch');
     const original=grid.map(row=>row.slice(0,4));
     const indexes=grid.map((row,i)=>i).filter(i=>i>0&&(
       String(grid[i]?.[0]||'').trim()||String(grid[i]?.[1]||'').includes('<img')));
     if(indexes.length!==4)throw Error('Expected exactly four populated banner rows; found '+indexes.length+' at '+indexes.join(',')+'; row-shapes='+JSON.stringify(grid.map((row,i)=>({i,filled:row.filter(v=>String(v||'').trim()).length,hasImage:String(row[1]||'').includes('<img'),titlePresent:Boolean(String(row[0]||'').trim())}))));
     const inserted=tp.editor.insertColumn(7,3,false);
     if(inserted===false)throw Error('Native column insertion rejected');
     if(tp.table.data[0].length!==11)throw Error('Could not extend table to 11 columns');
     keys.slice(4).forEach((key,j)=>tp.editor.setValueFromCoords(j+4,0,key));
     for(const i of indexes){
       keys.slice(4).forEach((key,j)=>tp.editor.setValueFromCoords(j+4,i,values[key]));
     }
     for(let i=0;i<original.length;i++)
       if(JSON.stringify(tp.table.data[i].slice(0,4))!==JSON.stringify(original[i]))
         throw Error('Unexpected modification of existing banner cell at row '+i);
     if(JSON.stringify(tp.table.data[0])!==JSON.stringify(keys))
       throw Error('New header schema mismatch');
     return {beforeColumns:4,afterColumns:tp.table.data[0].length,
       populatedRows:indexes.length,rows:tp.table.data.length};
   },{keys:KEYS,values:defaults});
   results.checks.push('Preserved all existing native banner cells before save');
   results.layout=updated;
   await page.screenshot({path:DIR+'/home00-before-save.png',fullPage:false});
   await page.getByRole('button',{name:/Save Changes/i}).first().click({timeout:20000});
   await page.waitForTimeout(2000);
   const after=await getTable();
   assert.deepEqual((after.fields||[]).map(f=>f.key),KEYS,'Saved schema did not persist');
   assert.equal(after.items.length,oldItems.length,'Saved row count changed');
   after.items.forEach((item,i)=>{
     const originals=Object.fromEntries(KEYS.slice(0,4).map(k=>[k,item[k]??'']));
     assert.deepEqual(originals,oldItems[i],'Original banner values changed at '+i);
     for(const [key,value] of Object.entries(defaults))
       assert.equal(String(item[key]||'').trim(),value,'Editable value missing '+key+' row '+i);
   });
   results.changes=1;
   results.status='PASS';
   results.checks.push('Native ESC Table Save and REST read-after-write PASS');
   await page.screenshot({path:DIR+'/home00-saved.png',fullPage:false});
 }
}catch(e){results.status='FAIL';results.errors.push(String(e.stack||e).slice(0,1500));process.exitCode=1;}
finally{
 await ctx.close();
 await browser.close();
 await writeFile(DIR+'/result.json',JSON.stringify(results,null,2)+'\n');
 console.log('MARINEAQUA_HOME00_EDITABLE='+JSON.stringify(results));
}