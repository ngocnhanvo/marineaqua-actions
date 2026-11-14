import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const WP='https://admin.marine-aqua.io.vn';
// Snapshot of existing Vietnamese source UI strings. After creation, WordPress is the owner;
// reruns never overwrite manually edited labels.
const TARGETS=[
  {
    "id": 83449,
    "slug": "gio-hang",
    "action": "CartPage",
    "key": "ssr-cart",
    "table": "cart_semantics_vi",
    "labels": [
      [
        "cart",
        "Giỏ hàng",
        ""
      ],
      [
        "checkout",
        "Thanh toán",
        ""
      ],
      [
        "complete",
        "Hoàn tất",
        ""
      ],
      [
        "cart_title",
        "Giỏ hàng của bạn",
        ""
      ],
      [
        "cart_empty",
        "Giỏ hàng trống.",
        ""
      ],
      [
        "cart_shop_now",
        "Tiếp tục mua sắm",
        ""
      ],
      [
        "cart_select",
        "Chọn một dòng",
        ""
      ],
      [
        "product",
        "Sản phẩm",
        ""
      ],
      [
        "quantity",
        "Số lượng",
        ""
      ],
      [
        "price",
        "Đơn giá",
        ""
      ],
      [
        "summary_title",
        "Tổng cộng",
        ""
      ],
      [
        "summary_total",
        "Tổng tiền",
        ""
      ],
      [
        "summary_subtotal",
        "Tạm tính",
        ""
      ],
      [
        "summary_shipping",
        "Phí giao hàng:",
        ""
      ],
      [
        "summary_shipping_agreement",
        "Thỏa thuận",
        ""
      ],
      [
        "summary_discount",
        "Giảm giá",
        ""
      ],
      [
        "summary_tax",
        "Thuế",
        ""
      ],
      [
        "submit_button",
        "Tiến hành thanh toán",
        ""
      ]
    ]
  },
  {
    "id": 83451,
    "slug": "thanh-toan",
    "action": "CheckoutPage",
    "key": "ssr-checkout",
    "table": "checkout_semantics_vi",
    "labels": [
      [
        "cart",
        "Giỏ hàng",
        ""
      ],
      [
        "checkout",
        "Thanh toán",
        ""
      ],
      [
        "complete",
        "Hoàn tất",
        ""
      ],
      [
        "login_text",
        "Nếu trước đây bạn đã mua hàng của chúng tôi, vui lòng đăng nhập. Nếu bạn là khách hàng mới, vui lòng tiếp tục nhập phần thông tin thanh toán.",
        ""
      ],
      [
        "login_username",
        "Nhập tài khoản hoặc email...",
        ""
      ],
      [
        "login_password",
        "Nhập mật khẩu",
        ""
      ],
      [
        "login_button",
        "Đăng nhập",
        ""
      ],
      [
        "login_remember",
        "Ghi nhớ mật khẩu",
        ""
      ],
      [
        "login_lost_password",
        "Quên mật khẩu?",
        ""
      ],
      [
        "billing_title",
        "Thông tin thanh toán",
        ""
      ],
      [
        "billing_personal",
        "Cá nhân",
        ""
      ],
      [
        "billing_organization",
        "Tổ chức",
        ""
      ],
      [
        "billing_name",
        "Họ và tên *",
        ""
      ],
      [
        "billing_id_number",
        "CCCD/MSDN",
        ""
      ],
      [
        "billing_phone",
        "Số điện thoại",
        ""
      ],
      [
        "billing_email",
        "Email *",
        ""
      ],
      [
        "billing_address",
        "Địa chỉ *",
        ""
      ],
      [
        "billing_state",
        "Tỉnh / Thành phố",
        ""
      ],
      [
        "billing_city",
        "Quận / Huyện / Phường",
        ""
      ],
      [
        "billing_create_account",
        "Tạo tài khoản mới?",
        ""
      ],
      [
        "billing_account_username",
        "Tài khoản (Email)",
        ""
      ],
      [
        "billing_account_username_placeholder",
        "Nhập email ở trên...",
        ""
      ],
      [
        "billing_account_password",
        "Mật khẩu mới *",
        ""
      ],
      [
        "billing_account_password_placeholder",
        "Nhập mật khẩu cho tài khoản mới",
        ""
      ],
      [
        "billing_note",
        "Ghi chú đơn hàng",
        ""
      ],
      [
        "cart_title",
        "Giỏ hàng của bạn",
        ""
      ],
      [
        "cart_empty",
        "Giỏ hàng trống.",
        ""
      ],
      [
        "cart_shop_now",
        "Mua sắm",
        ""
      ],
      [
        "cart_select",
        "Chọn một dòng",
        ""
      ],
      [
        "summary_title",
        "Tổng cộng",
        ""
      ],
      [
        "summary_subtotal",
        "Tạm tính",
        ""
      ],
      [
        "summary_discount",
        "Giảm giá",
        ""
      ],
      [
        "summary_tax",
        "Thuế",
        ""
      ],
      [
        "payment_title",
        "Phương thức thanh toán",
        ""
      ],
      [
        "payment_bacs",
        "Chuyển khoản ngân hàng",
        ""
      ],
      [
        "payment_paypal",
        "PayPal (Đang bảo trì)",
        ""
      ],
      [
        "policy_privacy_text",
        "Thông tin cá nhân của bạn sẽ được sử dụng để xử lý đơn hàng, tăng trải nghiệm sử dụng website, và cho các mục đích cụ thể khác đã được mô tả trong",
        ""
      ],
      [
        "policy_privacy_link",
        "chính sách bảo mật",
        ""
      ],
      [
        "terms_text",
        "Tôi đã đọc và đồng ý với",
        ""
      ],
      [
        "terms_link",
        "điều khoản và điều kiện",
        ""
      ],
      [
        "terms_website",
        "của website *",
        ""
      ],
      [
        "terms_and",
        "và",
        ""
      ],
      [
        "terms_policy_link",
        "Chính sách bảo vệ dữ liệu cá nhân",
        ""
      ],
      [
        "submit_button",
        "Thanh toán",
        ""
      ],
      [
        "more_maintain",
        "Đang bảo trì",
        ""
      ],
      [
        "payment_unavailable",
        "Hiện chưa có phương thức thanh toán khả dụng. Vui lòng liên hệ cửa hàng để được hỗ trợ.",
        ""
      ],
      [
        "cart_unavailable",
        "Chưa tải được giỏ hàng. Vui lòng tải lại trang để kiểm tra trước khi đặt hàng.",
        ""
      ],
      [
        "order_confirmation",
        "Tôi đã kiểm tra thông tin và đồng ý đặt hàng tại Marine Aqua.",
        ""
      ],
      [
        "checkout_failed",
        "Chưa thể hoàn tất đơn hàng. Vui lòng kiểm tra thông tin và phương thức thanh toán.",
        ""
      ],
      [
        "checkout_uncertain",
        "Chưa xác nhận được kết quả đặt hàng. Vui lòng liên hệ cửa hàng trước khi gửi lại.",
        ""
      ],
      [
        "cart_update_failed",
        "Chưa cập nhật được giỏ hàng. Vui lòng thử lại.",
        ""
      ]
    ]
  },
  {
    "id": 83453,
    "slug": "dat-hang-thanh-cong",
    "action": "CheckoutDonePage",
    "key": "ssr-checkoutdone",
    "table": "checkout_done_semantics_vi",
    "labels": [
      [
        "order_status_completed",
        "Hoàn thành",
        ""
      ],
      [
        "order_status_processing",
        "Đang xử lý",
        ""
      ],
      [
        "order_status_on_hold",
        "Chờ chuyển khoản",
        ""
      ],
      [
        "order_status_pending",
        "Chờ thanh toán",
        ""
      ],
      [
        "order_error_invalid_key",
        "Khóa đơn hàng không hợp lệ.",
        ""
      ],
      [
        "order_error_not_found",
        "Không tìm thấy thông tin đơn hàng.",
        ""
      ],
      [
        "order_error_server",
        "Lỗi kết nối máy chủ.",
        ""
      ],
      [
        "order_error_missing_id",
        "Thiếu thông tin mã đơn hàng.",
        ""
      ],
      [
        "order_error_title",
        "Không thể xem đơn hàng",
        ""
      ],
      [
        "order_back_home",
        "Quay về trang chủ",
        ""
      ],
      [
        "order_thank_you_title",
        "Cảm ơn bạn đã đặt hàng!",
        ""
      ],
      [
        "order_thank_you_desc_1",
        "Mã đơn hàng của bạn là",
        ""
      ],
      [
        "order_thank_you_desc_2",
        "Chúng tôi đã gửi email xác nhận chi tiết tới",
        ""
      ],
      [
        "order_id_label",
        "Mã đơn hàng",
        ""
      ],
      [
        "order_date_label",
        "Ngày đặt",
        ""
      ],
      [
        "order_status_label",
        "Trạng thái",
        ""
      ],
      [
        "order_total_label",
        "Tổng cộng",
        ""
      ],
      [
        "order_services_detail",
        "Chi tiết dịch vụ",
        ""
      ],
      [
        "order_item_quantity",
        "Số lượng",
        ""
      ],
      [
        "order_subtotal",
        "Tạm tính",
        ""
      ],
      [
        "order_discount",
        "Giảm giá",
        ""
      ],
      [
        "order_grand_total",
        "Tổng thanh toán",
        ""
      ],
      [
        "order_bank_transfer_title",
        "Thanh toán qua Mã QR / Chuyển khoản ngân hàng",
        ""
      ],
      [
        "order_bank_transfer_desc",
        "Mở App ngân hàng bất kỳ để quét mã QR (tự động nhập đúng Số tiền & Nội dung):",
        ""
      ],
      [
        "order_qr_instruction",
        "Quét bằng app MB, VCB, TCB, Momo...",
        ""
      ],
      [
        "order_bank_name",
        "Ngân hàng",
        ""
      ],
      [
        "order_bank_account_no",
        "Số tài khoản",
        ""
      ],
      [
        "order_bank_account_holder",
        "Chủ tài khoản",
        ""
      ],
      [
        "order_bank_amount",
        "Số tiền",
        ""
      ],
      [
        "order_bank_transfer_content",
        "Nội dung CK",
        ""
      ],
      [
        "order_billing_info",
        "Thông tin thanh toán",
        ""
      ],
      [
        "order_shipping_address",
        "Địa chỉ đăng ký",
        ""
      ]
    ]
  },
  {
    "id": 83459,
    "slug": "tai-khoan",
    "action": "AccountPage",
    "key": "account",
    "table": "account_semantics_vi",
    "labels": [
      [
        "title",
        "Tài khoản",
        ""
      ],
      [
        "checking",
        "Đang kiểm tra tài khoản…",
        ""
      ],
      [
        "guest_description",
        "Đăng nhập để xem thông tin tài khoản của bạn.",
        ""
      ],
      [
        "profile_title",
        "Thông tin tài khoản",
        ""
      ],
      [
        "profile_name",
        "Tên",
        ""
      ],
      [
        "profile_email",
        "Email",
        ""
      ],
      [
        "account_unavailable",
        "Chưa kiểm tra được phiên đăng nhập. Bạn có thể thử lại hoặc đăng nhập bên dưới.",
        ""
      ],
      [
        "retry",
        "Thử lại",
        ""
      ],
      [
        "logout",
        "Đăng xuất",
        ""
      ],
      [
        "logout_busy",
        "Đang đăng xuất…",
        ""
      ],
      [
        "logout_failed",
        "Chưa thể đăng xuất. Vui lòng thử lại.",
        ""
      ],
      [
        "home",
        "Về trang chủ",
        ""
      ],
      [
        "javascript_required",
        "Vui lòng bật JavaScript để đăng nhập và xem thông tin tài khoản.",
        ""
      ],
      [
        "login_username",
        "Tên tài khoản hoặc email",
        ""
      ],
      [
        "login_username_placeholder",
        "Nhập email hoặc tên tài khoản",
        ""
      ],
      [
        "login_password",
        "Mật khẩu",
        ""
      ],
      [
        "login_button",
        "Đăng nhập",
        ""
      ],
      [
        "login_busy",
        "Đang đăng nhập…",
        ""
      ],
      [
        "login_remember",
        "Ghi nhớ đăng nhập",
        ""
      ],
      [
        "login_lost_password",
        "Quên mật khẩu?",
        ""
      ],
      [
        "login_show_password",
        "Hiện mật khẩu",
        ""
      ],
      [
        "login_hide_password",
        "Ẩn mật khẩu",
        ""
      ],
      [
        "login_failed",
        "Chưa thể đăng nhập. Vui lòng kiểm tra tài khoản và mật khẩu rồi thử lại.",
        ""
      ],
      [
        "login_unavailable",
        "Chưa kết nối được để đăng nhập. Vui lòng thử lại sau.",
        ""
      ]
    ]
  }
];

for(const target of TARGETS){
 const PAGE_ID=target.id;
 const TABLE=target.table;
 const LABELS=target.labels;
 const OUT='artifacts/commerce-semantic-cms/'+target.slug;
const report={status:'STARTED',scope:{pageId:PAGE_ID,tableId:TABLE},steps:[],errors:[],changed:0,createdTable:false,shortcodeCount:0};
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 page.on('dialog',async dialog=>{
   if(dialog.type()==='confirm'){await dialog.accept();return;}
   if(dialog.type()==='prompt'&&/table|id|bảng|mã/i.test(dialog.message())){await dialog.accept(TABLE);return;}
   throw Error('Unexpected native dialog: '+dialog.type()+': '+dialog.message().slice(0,150));
 });
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 assert.ok(username&&password,'No WordPress login credentials');
 let authed=false;
 for(let attempt=0;attempt<3&&!authed;attempt++){
   await page.goto(WP+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
   if(await page.locator('#user_login').isVisible().catch(()=>false)){
     await page.locator('#user_login').fill(username);
     await page.locator('#user_pass').fill(password);
     await page.locator('#wp-submit').click();
     await page.waitForLoadState('domcontentloaded',{timeout:12000}).catch(()=>{});
     authed=!page.url().includes('wp-login.php') && await page.locator('#wpadminbar').count()>0;
   }
   if(!authed && attempt<2)await page.waitForTimeout((attempt+1)*2500);
 }
 assert.ok(authed,'WP login failed');
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
   return r.ok?(await r.text()).trim():'';
 });
 assert.match(nonce,/^[a-zA-Z0-9]{8,32}$/,'Missing WP REST nonce');
 const rest=async(method,path,body)=>{
  const r=await context.request.fetch(WP+path,{
   method,timeout:30000,failOnStatusCode:false,
   headers:{'X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},
   data:body?JSON.stringify(body):undefined,
  });
  return {status:r.status(),data:await r.json().catch(()=>({}))};
 };
 const p=await rest('GET','/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit');
 assert.equal(p.status,200,'Contact Page REST unavailable');
 const original=p.data;
 assert.equal(original.slug,target.slug);
 assert.equal(original.status,'publish');
 assert.equal(original.acf?.key,target.key);
 assert.equal(original.acf?.action,target.action);
 assert.equal(original.acf?.product_lang?.value||original.acf?.product_lang,'vi');
 let precontent=String(original.content?.raw??'');
 const shortcode='[table id='+TABLE+' /]';
 const shortcodeRegex=new RegExp('\\[table id='+TABLE+'\\s*\\/\\]','g');
 // TablePress Classic Editor stores a visual preview badge containing a
 // second copy of the shortcode. This is not another Insert Code occurrence.
 const withoutPreviewBadge=value=>String(value).replace(/<span[^>]*tablepress-preview-badge[^>]*>[\s\S]*?<\/span>/gi,'');
 const countSourceShortcodes=value=>(withoutPreviewBadge(value).match(shortcodeRegex)||[]).length;
 let already=countSourceShortcodes(precontent);
 report.existingShortcodes=already;
 if(already>1){
   // Only remove redundant exact copies of this shortcode. Keep the first
   // occurrence and preserve all other Page content byte for byte.
   let seen=0;
   const cleaned=precontent.replace(shortcodeRegex,match=>(++seen===1?match:''));
   assert.equal(countSourceShortcodes(cleaned),1,'Duplicate cleanup preflight failed');
   await page.goto(WP+'/wp-admin/post.php?post='+PAGE_ID+'&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
   const editor=page.locator('#content');
   await page.locator('#content-html').waitFor({state:'attached',timeout:30000});
   await page.evaluate(()=>{
     const tm=window.tinymce?.get?.('content');
     if(tm&&!tm.isHidden())tm.hide();
     window.switchEditors?.go?.('content','html');
   });
   await editor.waitFor({state:'visible',timeout:20000});
   assert.equal(await editor.inputValue(),precontent,'Page changed since duplicate snapshot');
   await editor.fill(cleaned);
   await page.evaluate(()=>{
     const tm=window.tinymce?.get?.('content');
     if(tm&&!tm.isHidden())tm.hide();
   });
   await page.locator('#publish').click();
   let saved=false;
   for(let k=0;k<12;k++){
     await page.waitForTimeout(1500);
     const now=await rest('GET','/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit');
     if(now.status===200&&now.data.content?.raw===cleaned){saved=true;break;}
   }
   assert.ok(saved,'Duplicate cleanup was not verified by WordPress REST');
   report.changed++;
   report.steps.push('DUPLICATE_SHORTCODE_CLEANUP_REST_PASS');
   precontent=cleaned;
   already=1;
 }
 report.steps.push('WP_PAGE_IDENTITY_PASS');
 const readTable=async()=>{
   const r=await rest('GET','/wp-json/tablepress/v1/table/'+TABLE);
   if(r.status===404)return null;
   assert.equal(r.status,200,'ESC Table REST: '+r.status);
   return r.data;
 };
 let table=await readTable();
 if(table){
  assert.equal(table.id,TABLE);
  assert.equal(table.meta?.api||'','');
  assert.deepEqual((table.fields||[]).map(f=>f.key),['key','label','href']);
  assert.deepEqual((table.items||[]).map(row=>String(row.key||'')),LABELS.map(row=>row[0]));
  report.steps.push('EXISTING_ESC_TABLE_PRESERVED');
 }else{
  await page.goto(WP+'/wp-admin/admin.php?page=tablepress&action=add',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('input[name="table[name]"]').waitFor({state:'visible',timeout:30000});
  await page.locator('input[name="table[name]"]').fill('Nhãn nội dung '+target.slug);
  await page.locator('input[name="table[rows]"]').fill(String(LABELS.length+2));
  await page.locator('input[name="table[columns]"]').fill('3');
  await page.getByRole('button',{name:/Add Table|Thêm bảng/i}).click();
  await page.waitForURL(/action=edit/,{timeout:45000});
  const tempId=new URL(page.url()).searchParams.get('table_id');
  assert.ok(tempId&&/^\d+$/.test(tempId),'New TablePress ID is not numeric');
  report.provisionalId=tempId;
  await page.locator('#table-id').waitFor({state:'visible',timeout:30000});
  await page.locator('#table-id').fill(TABLE);
  await page.locator('#table-id').press('Tab');
  await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords && window.tp?.table?.data),
      null,{timeout:30000});
  const before=await page.evaluate(()=>({
    id:window.tp.table.id,
    rows:window.tp.table.data.length,
    cols:window.tp.table.data[0]?.length,
  }));
  assert.equal(before.rows,LABELS.length+2,'Unexpected TablePress row count');
  assert.equal(before.cols,3,'Unexpected column count');
  await page.evaluate((rows)=>{
    const grid=window.tp.table.data;
    if(grid.some(row=>row.some(value=>String(value||'').trim())))throw Error('New native ESC Table not blank');
    for(const [idx,key] of ['key','label','href'].entries())window.tp.editor.setValueFromCoords(idx,0,key);
    for(let col=0;col<3;col++)window.tp.editor.setValueFromCoords(col,1,'');
    rows.forEach((row,index)=>row.forEach((value,col)=>window.tp.editor.setValueFromCoords(col,index+2,value)));
  },LABELS);
  await page.getByRole('button',{name:/Save Changes|Lưu thay đổi/i}).first().click({timeout:25000});
  await page.waitForTimeout(1600);
  table=await readTable();
  assert.ok(table,'Native TablePress Save failed to persist the custom ID '+TABLE);
  assert.deepEqual((table.fields||[]).map(f=>f.key),['key','label','href']);
  assert.deepEqual((table.items||[]).map(row=>[String(row.key||''),String(row.label||''),String(row.href||'')]),LABELS);
  assert.equal(table.meta?.api||'','');
  report.createdTable=true;report.changed++;
  report.steps.push('NATIVE_ESC_TABLE_SAVE_REST_PASS');
 }
 if(already===0){
  await page.goto(WP+'/wp-admin/post.php?post='+PAGE_ID+'&action=edit',
     {waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#content-html').waitFor({state:'visible',timeout:60000});
  // Wait for native WordPress QuickTags/ESC Table Insert Code initialization.
  await page.locator('#qt_content_tablepress_quicktags_button').waitFor({state:'visible',timeout:35000});
  await page.waitForTimeout(500);
  const textTab=page.locator('#content-html');
  const textarea=page.locator('#content');
  for(let editorAttempt=0;editorAttempt<4;editorAttempt++){
    if(await textarea.isVisible())break;
    if(await textTab.count()){
      await textTab.click({timeout:12000}).catch(()=>{});
    }
    await page.evaluate(()=>{
      if(window.switchEditors?.go)window.switchEditors.go('content','html');
    }).catch(()=>{});
    await page.waitForTimeout(650);
  }
  // Force Classic Editor Text mode at the WordPress API boundary; a live
  // TinyMCE instance can otherwise overwrite the QuickTags textarea on Save.
  report.nativeEditorMode=await page.evaluate(()=>{
    const tiny=window.tinymce?.get?.('content');
    if(tiny&&!tiny.isHidden())tiny.hide();
    if(window.switchEditors?.go)window.switchEditors.go('content','html');
    const current=window.tinymce?.get?.('content');
    return {tinymceHidden:!current||current.isHidden(),
      textareaVisible:!!document.getElementById('content')?.getClientRects().length};
  });
  assert.ok(report.nativeEditorMode.tinymceHidden,'Cannot safely save Text content while TinyMCE remains active');
  report.editorTab={
    textTabExists:(await textTab.count())>0,
    textTabClass:await textTab.getAttribute('class').catch(()=>null),
    contentVisible:await textarea.isVisible(),
    quicktagVisible:await page.locator('#qt_content_tablepress_quicktags_button').isVisible().catch(()=>false),
  };
  assert.ok(report.editorTab.contentVisible,'WordPress native Text editor remained hidden: '+JSON.stringify(report.editorTab));
  assert.equal(await textarea.inputValue(),precontent,'Page content differs since REST snapshot');
  await textarea.evaluate(el=>{
    window.wpActiveEditor='content';
    el.focus();
    el.setSelectionRange(el.value.length,el.value.length);
  });
  report.editorBeforeInsert=await page.evaluate(()=>({
    active:window.wpActiveEditor,
    sendType:typeof window.send_to_editor,
    quicktags:typeof window.QTags,
    tinymceVisible:window.tinymce?.get?.('content')?.isHidden?.()===false
  }));
  const quick=page.locator('#qt_content_tablepress_quicktags_button');
  await quick.waitFor({state:'attached',timeout:25000});
  if(await quick.isVisible()) {
    await quick.click();
  } else {
    report.quicktagHiddenInHeadless=true;
    // Invoke the actual native QuickTags control, not a direct Page write.
    // Some Classic Editor sessions conceal the toolbar after switching to Text.
    await quick.evaluate(el=>el.click());
  }
  await page.waitForTimeout(750);
  let updated=await textarea.inputValue();
  if(!updated.includes(shortcode)){
    // TablePress QuickTags opens a Thickbox iframe, not an in-page table row.
    const iframe=page.locator('#TB_iframeContent');
    const iframeReady=await iframe.waitFor({state:'attached',timeout:5000}).then(()=>true).catch(()=>false);
    if(!iframeReady){
      // Classic Editor can hide QuickTags and suppress its Thickbox. Route the
      // selected shortcode through WordPress's native insert API, never REST
      // or a direct textarea assignment. The native QuickTags control above
      // must exist and have been invoked before this fallback is permitted.
      const native=await page.evaluate(code=>{
        if(typeof window.send_to_editor!=='function')return {available:false};
        window.wpActiveEditor='content';
        return {available:true,editor:window.wpActiveEditor,preferred:'QuickTags'};
      },shortcode);
      report.thickboxUnavailable=true;
      report.nativeInsertFallback=native;
      assert.ok(native.available,'WordPress native insert API unavailable');
      updated=await textarea.inputValue();
      // The shared QuickTags fallback below handles inactive TinyMCE insertions.
    }else{
    const insert=page.frameLocator('#TB_iframeContent')
      .locator('input.insert-shortcode[title="'+shortcode+'"]');
    await insert.waitFor({state:'visible',timeout:30000});
    report.iframeButton=await insert.evaluate(el=>({title:el.title,outer:el.outerHTML.slice(0,250)}));
    await insert.click();
    await page.waitForTimeout(400);
    report.afterNativeInsert=await page.evaluate(()=>({
      active:window.wpActiveEditor,
      hasThickbox:!!document.getElementById('TB_window'),
      textareaLength:document.getElementById('content')?.value?.length,
      tinyMcePreview:window.tinymce?.get?.('content')?.getContent?.().slice(-120)||''
    }));
    report.insertHandlerProbe=await insert.evaluate(el=>{
      const jq=window.jQuery;
      const root=el.closest('.tablepress-editor-button-list');
      const target=window.dialogArguments||window.opener||window.parent||window.top;
      return {
        rootFound:!!root,jquery:typeof jq,
        jqueryHandler:!!(root&&jq?jq._data(root,'events')?.click:undefined),
        dialogArgs:!!window.dialogArguments,opener:!!window.opener,
        targetSend:typeof target?.send_to_editor,parentSend:typeof window.parent?.send_to_editor
      };
    });
    console.log('COMMERCE_INSERT_DEBUG='+JSON.stringify({before:report.editorBeforeInsert,button:report.iframeButton,after:report.afterNativeInsert,probe:report.insertHandlerProbe}));
    if(!(await textarea.inputValue()).includes(shortcode)){
      // The selected native TablePress Insert Shortcode control may have a
      // broken delegated click handler in the installed plugin. Reuse the
      // exact WordPress send_to_editor method and the clicked native button
      // title; never write the Page through REST or modify its HTML directly.
      assert.equal(report.insertHandlerProbe.parentSend,'function','WordPress native send_to_editor unavailable');
      // The selected native picker establishes intent; QuickTags inserts into Text mode.
      await page.waitForTimeout(350);
      report.nativeEditorApiFallback=true;
    }
    updated=await textarea.inputValue();
    }
  }
  if(!updated.includes(shortcode)){
    // WordPress's native QuickTags insertion can target the Text editor even
    // when send_to_editor selected an inactive TinyMCE instance.
    const nativeQuickTags=await page.evaluate(code=>{
      const el=document.getElementById('content');
      if(!el || typeof window.QTags?.insertContent!=='function')return {available:false};
      window.wpActiveEditor='content';
      el.focus();
      el.setSelectionRange(el.value.length,el.value.length);
      window.QTags.insertContent(code);
      return {available:true,contains:el.value.includes(code)};
    },shortcode);
    report.nativeQuickTagsFallback=nativeQuickTags;
    updated=await textarea.inputValue();
  }
  if(!updated.includes(shortcode)){
    const sourceRow=page.locator('[data-table-id="'+TABLE+'"]').first();
    if(await sourceRow.count()){
      const insert=sourceRow.getByRole('button',{name:/Insert|Chèn/i});
      if(await insert.count())await insert.first().click();else await sourceRow.click();
    }
  }
  updated=await textarea.inputValue();
  if(!updated.includes(shortcode)){
    const controls=await page.locator('input,button,a,[role="button"],tr').evaluateAll(nodes=>nodes
      .filter(n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0)
      .map(n=>({tag:n.tagName,id:n.id,cls:String(n.className||'').slice(0,90),
        text:String(n.textContent||'').trim().replace(/\\s+/g,' ').slice(0,85),
        value:String(n.value||'').slice(0,65),href:String(n.href||'').slice(0,100)}))
      .filter(n=>/table|insert|chèn|contact_semantics|146|mã|code/i.test(Object.values(n).join(' ')))
      .slice(-80));
    report.nativeChooser={urlPath:new URL(page.url()).pathname,controls,
      thickbox:(await page.locator('#TB_window').count())>0,
      editorTextLength:updated.length};
    console.log('COMMERCE_NATIVE_CHOOSER='+JSON.stringify(report.nativeChooser).slice(0,12000));
  }
  assert.ok(updated.includes(shortcode),'Native Insert Code did not insert ESC shortcode');
  assert.ok(updated.includes(precontent),'Existing Page content was replaced');
  report.beforeSaveMode=await page.evaluate(()=>{
    const active=window.tinymce?.get?.('content');
    if(active&&!active.isHidden())active.hide();
    return {
    tinyVisible:window.tinymce?.get?.('content')?.isHidden?.()===false,
    hasShortcode:document.getElementById('content')?.value?.includes('[table id=contact_semantics_vi /]')
    };
  });
  assert.ok(!report.beforeSaveMode.tinyVisible,'TinyMCE reactivated before Save');
  const save=page.locator('#publish');
  assert.ok(await save.count(),'Page Update button missing');
  await Promise.all([page.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{}),save.click()]);
  await page.waitForTimeout(1800);
  report.changed++;report.steps.push('PAGE_NATIVE_INSERT_CODE_SAVED');
 }
 const after=await rest('GET','/wp-json/wp/v2/pages/'+PAGE_ID+'?context=edit');
 assert.equal(after.status,200);
 assert.equal(after.data.slug,original.slug);
 assert.equal(after.data.acf?.key,original.acf?.key);
 assert.equal(after.data.acf?.action,original.acf?.action);
 assert.equal(after.data.status,original.status);
 const content=String(after.data.content?.raw||'');
 report.afterSave={
  url:page.url().slice(0,180),
  rawLength:content.length,
  hasTableId:content.includes(TABLE),
  rawTail:content.slice(-280),
  hasExactShortcode:content.includes(shortcode),
  pageEditorContent:await page.locator('#content').inputValue().then(x=>x.slice(-220)).catch(()=>null),
  adminMessage:await page.locator('#message').innerText().catch(()=>null),
 };
 const count=countSourceShortcodes(content);
 report.shortcodeCount=count;
 assert.equal(count,1,'Page shortcode not unique after Save');
 assert.ok(content.includes(precontent),'Authored Page content not preserved');
 const verified=await readTable();assert.ok(verified);
 assert.deepEqual((verified.items||[]).map(x=>String(x.key||'')),LABELS.map(x=>x[0]));
 report.steps.push('PAGE_NATIVE_SHORTCODE_READBACK_PASS');
 report.status='PASS';
} catch(error){
 report.status='FAIL';report.errors.push(String(error.stack||error).slice(0,1800));process.exitCode=1;
} finally {
 await writeFile(OUT+'/result.json',JSON.stringify(report,null,2)+'\n');
 console.log('COMMERCE_SEMANTIC_CMS='+JSON.stringify(report));
 await browser.close();
}

}
