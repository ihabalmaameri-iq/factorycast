/* =====================================================
   نظام إدارة مصنع الصبّ - منطق التطبيق
   ===================================================== */

// ---------- الحالة العامة ----------
const S = { materials:[], movements:[], customers:[], mixtures:[], mixture_items:[], invoices:[], expenses:[],
            vehicles:[], partners:[], partner_withdrawals:[], employees:[], salaries:[], profiles:[],
            recipes:[], recipe_items:[], suppliers:[], supplier_vehicles:[],
            revenues:[], cash_counts:[], app_settings:[], payments:[] };
let CUR = localStorage.getItem('currency') || 'د.ع';

// ---------- الصلاحيات ----------
let ROLE = 'owner';           // الدور الحالي
let USER = null;              // مستخدم Supabase الحالي
const ROLE_NAMES = { owner:'👑 المالك', manager:'📋 المدير', accountant:'🧮 المحاسب' };
// الصفحات المتاحة لكل دور
const ROLE_PAGES = {
  owner:      ['dashboard','materials','suppliers','recipes','mixtures','customers','sales','vehicles','revenues','expenses','cash','employees','partners','reports','audit','users','settings'],
  manager:    ['dashboard','materials','suppliers','recipes','mixtures','customers','sales','vehicles','revenues','expenses','cash','employees','reports'],
  accountant: ['dashboard','materials','suppliers','recipes','mixtures','customers','sales','vehicles','revenues','expenses','cash','employees','reports']
};
// أقسام يحق للدور تعديلها (المالك حصرياً: الشركاء، الحسابات، السجل، الإعدادات)
const ROLE_EDIT = {
  owner:      ['materials','suppliers','recipes','mixtures','customers','sales','vehicles','revenues','expenses','cash','employees','partners','users'],
  manager:    ['materials','suppliers','recipes','mixtures','customers','sales','vehicles','revenues','expenses','cash','employees'],
  accountant: ['materials','suppliers','recipes','mixtures','customers','sales','vehicles','revenues','expenses','cash','employees']
};
const canView = page => ROLE_PAGES[ROLE].includes(page);
const canEdit = section => ROLE_EDIT[ROLE].includes(section);

// ---------- أدوات مساعدة ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => (Number(n)||0).toLocaleString('ar-IQ', {maximumFractionDigits:2});
const money = n => `${fmt(n)} ${CUR}`;
const today = () => new Date().toISOString().slice(0,10);

function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = 'toast-msg ' + type;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function modal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalOverlay').classList.add('open');
}
function closeModal() { $('#modalOverlay').classList.remove('open'); }
$('#modalClose').onclick = closeModal;
$('#modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

// ---------- تحميل البيانات ----------
async function loadAll() {
  const tables = Object.keys(S);
  const results = await Promise.all(tables.map(t =>
    DB.list(t).catch(e => { console.warn(`تعذر تحميل ${t}:`, e.message); return []; })
  ));
  tables.forEach((t,i) => S[t] = results[i]);
}

// الكمية الحالية لمادة = مجموع التوريد - مجموع الصرف
function qtyOf(matId) {
  return S.movements.reduce((sum,m) =>
    m.material_id === matId ? sum + (m.type==='in' ? Number(m.qty) : -Number(m.qty)) : sum, 0);
}
const matById  = id => S.materials.find(m => m.id === id);
const custById = id => S.customers.find(c => c.id === id);
const mixById  = id => S.mixtures.find(m => m.id === id);
const mixItems = mixId => S.mixture_items.filter(i => i.mixture_id === mixId);

// كلفة خلطة حسب أسعار المواد الحالية
function mixtureCostNow(mixId) {
  return mixItems(mixId).reduce((s,i) => {
    const m = matById(i.material_id);
    return s + Number(i.qty) * (m ? Number(m.unit_price) : 0);
  }, 0);
}

// ---------- التنقل بين الصفحات ----------
$$('.nav-btn').forEach(btn => btn.onclick = () => {
  if (btn.dataset.page === 'customers') backToCustomers();
  showPage(btn.dataset.page);
});
function showPage(page) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-'+page));
  renderPage(page);
}
function renderPage(page) {
  if (!canView(page)) return;
  ({dashboard:renderDashboard, materials:renderMaterials, suppliers:renderSuppliers,
    recipes:renderRecipes, mixtures:renderMixtures,
    customers:renderCustomers, sales:renderSales, expenses:renderExpenses,
    revenues:renderRevenues, cash:renderCash,
    vehicles:renderVehicles, employees:renderEmployees, partners:renderPartners,
    users:renderUsers, audit:renderAudit, reports:renderReports, settings:renderSettings}[page] || (()=>{}))();
}
function currentPage() {
  const b = $('.nav-btn.active'); return b ? b.dataset.page : 'dashboard';
}
async function refresh() { await loadAll(); renderPage(currentPage()); }

/* =====================================================
   🧱 المواد الخام
   ===================================================== */
function renderMaterials() {
  const q = ($('#matSearch').value || '').trim();
  const rows = S.materials
    .filter(m => !q || m.name.includes(q))
    .map(m => {
      const qty = qtyOf(m.id);
      const low = qty <= Number(m.min_qty);
      return `<tr>
        <td><b>${esc(m.name)}</b></td>
        <td class="num">${fmt(qty)}</td>
        <td>${esc(m.unit)}</td>
        <td class="num">${money(m.unit_price)}</td>
        <td class="num">${money(qty * m.unit_price)}</td>
        <td><span class="badge ${low?'low':'ok'}">${low?'⚠️ منخفض':'✔ متوفر'}</span></td>
        <td>${canEdit('materials') ? `<div class="actions">
          <button class="btn sm primary" onclick="supplyForm(${m.id})">➕ توريد</button>
          <button class="btn sm" onclick="issueForm(${m.id})">➖ صرف</button>
          <button class="btn sm" onclick="materialForm(${m.id})">✏️</button>
          <button class="btn sm danger" onclick="delMaterial(${m.id})">🗑️</button>
        </div>` : '<span class="hint">عرض فقط</span>'}</td>
      </tr>`;
    }).join('');
  $('#matTable').innerHTML = `
    <tr><th>اسم المادة</th><th>الكمية الحالية</th><th>الوحدة</th><th>سعر الوحدة</th><th>القيمة الإجمالية</th><th>الحالة</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="7" class="empty-row">لا توجد مواد بعد — ابدأ بإضافة مادة جديدة</td></tr>'}`;

  const movs = [...S.movements].sort((a,b)=> (b.date||'').localeCompare(a.date||'') || b.id-a.id).slice(0,30)
    .map(mv => {
      const m = matById(mv.material_id);
      const sup = mv.supplier_id ? supById(mv.supplier_id) : null;
      const veh = mv.supplier_vehicle_id ? S.supplier_vehicles.find(v=>v.id===mv.supplier_vehicle_id) : null;
      return `<tr>
        <td>${esc(mv.date)}</td>
        <td>${esc(m?m.name:'—')}</td>
        <td><span class="badge ${mv.type}">${mv.type==='in'?'⬇️ توريد':'⬆️ صرف'}</span></td>
        <td class="num">${fmt(mv.qty)} ${esc(m?m.unit:'')}</td>
        <td class="num">${mv.type==='in'&&mv.price?money(mv.price):'—'}</td>
        <td>${sup?`🏪 ${esc(sup.name)}${veh?`<div class="hint">🚛 ${esc(veh.name)}</div>`:''}`:'—'}</td>
        <td>${mv.type==='in'?`${esc(mv.doc_no||'—')}<div class="hint"><span class="badge ${mv.paid===false?'low':'ok'}">${mv.paid===false?'آجل':'مسدد'}</span></div>`:'—'}</td>
        <td>${esc(mv.note||'')}</td>
        <td>${canEdit('materials') ? `<div class="actions">
          <button class="btn sm" onclick="movementForm(${mv.id})">✏️</button>
          <button class="btn sm danger" onclick="delMovement(${mv.id})">🗑️</button></div>` : ''}</td>
      </tr>`;
    }).join('');
  $('#movTable').innerHTML = `
    <tr><th>التاريخ</th><th>المادة</th><th>النوع</th><th>الكمية</th><th>سعر الوحدة</th><th>المورد</th><th>رقم الوصل</th><th>ملاحظة</th><th></th></tr>
    ${movs || '<tr><td colspan="9" class="empty-row">لا توجد حركات</td></tr>'}`;
}
$('#matSearch').oninput = renderMaterials;

// نموذج إضافة / تعديل مادة
window.materialForm = function(id) {
  const m = id ? matById(id) : null;
  modal(m ? 'تعديل مادة' : 'مادة خام جديدة', `
    <div class="form-grid">
      <div class="form-row"><label>اسم المادة *</label><input id="f_name" value="${esc(m?.name||'')}"></div>
      <div class="form-row"><label>الوحدة</label>
        <select id="f_unit">${['كغم','طن','لتر','م³','كيس','قطعة'].map(u=>`<option ${m?.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
      <div class="form-row"><label>سعر الوحدة (${CUR})</label><input id="f_price" type="number" min="0" step="any" value="${m?.unit_price??''}"></div>
      <div class="form-row"><label>حد التنبيه (الحد الأدنى)</label><input id="f_min" type="number" min="0" step="any" value="${m?.min_qty??''}"></div>
      ${m ? '' : '<div class="form-row"><label>كمية افتتاحية (اختياري)</label><input id="f_init" type="number" min="0" step="any" placeholder="0"></div>'}
    </div>
    <div class="form-row"><label>ملاحظات</label><input id="f_notes" value="${esc(m?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveMaterial(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};

window.saveMaterial = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم المادة مطلوب', 'err');
  // منع التكرار
  const dup = S.materials.find(m => m.name === name && m.id !== id);
  if (dup) return toast('⚠️ هذه المادة موجودة مسبقاً — استخدم زر "توريد" لإضافة كمية جديدة', 'err');
  const data = {
    name, unit: $('#f_unit').value,
    unit_price: Number($('#f_price').value)||0,
    min_qty: Number($('#f_min').value)||0,
    notes: $('#f_notes').value.trim()
  };
  try {
    if (id) await DB.update('materials', id, data);
    else {
      const row = await DB.insert('materials', data);
      const init = Number($('#f_init')?.value)||0;
      if (init > 0) await DB.insert('movements', { material_id: row.id, type:'in', qty:init, price:data.unit_price, note:'رصيد افتتاحي', date: today() });
    }
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

// توريد دفعة جديدة
window.supplyForm = function(matId) {
  const m = matById(matId);
  modal(`📥 توريد دفعة: ${esc(m.name)}`, `
    <div class="form-grid">
      <div class="form-row"><label>🏪 المورد</label>
        <select id="f_supplier" onchange="onSupplierChange(); supplyCalc()">
          <option value="">— بدون مورد —</option>
          ${S.suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
        ${S.suppliers.length ? '' : '<div class="hint">لا يوجد موردون — أضفهم من صفحة 🏪 الموردون</div>'}</div>
      <div class="form-row"><label>🚛 عربة المورد</label>
        <select id="f_supveh" disabled><option value="">— اختر المورد أولاً —</option></select></div>
      <div class="form-row"><label>الكمية * (${esc(m.unit)})</label><input id="f_qty" type="number" min="0" step="any" oninput="supplyCalc()"></div>
      <div class="form-row"><label>سعر الوحدة (${CUR})</label><input id="f_price" type="number" min="0" step="any" value="${m.unit_price}" oninput="supplyCalc()"></div>
      <div class="form-row"><label>📄 رقم وصل المورد</label><input id="f_doc" dir="ltr" placeholder="رقم الوصل / القائمة"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${today()}"></div>
      <div class="form-row"><label>حالة الدفع</label>
        <select id="f_paid"><option value="1">مسدد</option><option value="0">آجل</option></select></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note"></div>
    </div>
    <div class="calc-box" id="supplyCalcBox"></div>
    <div class="hint">الكمية الحالية: ${fmt(qtyOf(matId))} ${esc(m.unit)} — ستُحدَّث تلقائياً بعد الحفظ.</div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveSupply(${matId})">💾 إضافة التوريد</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
  supplyCalc();
};
window.supplyCalc = function() {
  const qty = Number($('#f_qty').value)||0;
  const price = Number($('#f_price').value)||0;
  const sid = Number($('#f_supplier').value);
  const s = sid ? supById(sid) : null;
  $('#supplyCalcBox').innerHTML = `القيمة الإجمالية: <b>${money(qty*price)}</b>${s?` &nbsp;|&nbsp; المورد: <b>${esc(s.name)}</b>${s.phone?` (<span dir="ltr">${esc(s.phone)}</span>)`:''}`:''}`;
};
window.saveSupply = async function(matId) {
  const qty = Number($('#f_qty').value);
  if (!qty || qty <= 0) return toast('أدخل كمية صحيحة', 'err');
  const price = Number($('#f_price').value)||0;
  try {
    await DB.insert('movements', {
      material_id: matId, type:'in', qty, price,
      supplier_id: Number($('#f_supplier').value) || null,
      supplier_vehicle_id: Number($('#f_supveh').value) || null,
      doc_no: $('#f_doc').value.trim(),
      paid: $('#f_paid').value === '1',
      note: $('#f_note').value.trim(),
      date: $('#f_date').value || today()
    });
    const m = matById(matId);
    if (price && price !== Number(m.unit_price)) await DB.update('materials', matId, { unit_price: price });
    closeModal(); toast('تم تسجيل التوريد ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

// صرف يدوي
window.issueForm = function(matId) {
  const m = matById(matId);
  modal(`صرف من: ${esc(m.name)}`, `
    <div class="form-grid">
      <div class="form-row"><label>الكمية *</label><input id="f_qty" type="number" min="0" step="any"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${today()}"></div>
    </div>
    <div class="form-row"><label>سبب الصرف</label><input id="f_note" placeholder="تالف، استخدام خارجي..."></div>
    <div class="hint">المتوفر: ${fmt(qtyOf(matId))} ${esc(m.unit)}</div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveIssue(${matId})">💾 تسجيل الصرف</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveIssue = async function(matId) {
  const qty = Number($('#f_qty').value);
  if (!qty || qty <= 0) return toast('أدخل كمية صحيحة', 'err');
  if (qty > qtyOf(matId)) return toast('⚠️ الكمية المطلوبة أكبر من المتوفر', 'err');
  try {
    await DB.insert('movements', { material_id: matId, type:'out', qty, note: $('#f_note').value.trim() || 'صرف يدوي', date: $('#f_date').value || today() });
    closeModal(); toast('تم تسجيل الصرف ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

// تعديل / حذف حركة مخزون
window.movementForm = function(id) {
  const mv = S.movements.find(x=>x.id===id);
  const m = matById(mv.material_id);
  modal(`تعديل حركة (${mv.type==='in'?'توريد':'صرف'}): ${esc(m?m.name:'')}`, `
    <div class="form-grid">
      ${mv.type==='in'?`
      <div class="form-row"><label>🏪 المورد</label>
        <select id="f_supplier" onchange="onSupplierChange()">
          <option value="">— بدون مورد —</option>
          ${S.suppliers.map(s=>`<option value="${s.id}" ${mv.supplier_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        </select></div>
      <div class="form-row"><label>🚛 عربة المورد</label>
        <select id="f_supveh"><option value="">— بدون عربة —</option></select></div>` : ''}
      <div class="form-row"><label>الكمية *</label><input id="f_qty" type="number" min="0" step="any" value="${mv.qty}"></div>
      ${mv.type==='in'?`<div class="form-row"><label>سعر الوحدة (${CUR})</label><input id="f_price" type="number" min="0" step="any" value="${mv.price||0}"></div>
      <div class="form-row"><label>📄 رقم وصل المورد</label><input id="f_doc" dir="ltr" value="${esc(mv.doc_no||'')}"></div>
      <div class="form-row"><label>حالة الدفع</label>
        <select id="f_paid"><option value="1">مسدد</option><option value="0" ${mv.paid===false?'selected':''}>آجل</option></select></div>`:''}
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${esc(mv.date)}"></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note" value="${esc(mv.note||'')}"></div>
    </div>
    <div class="hint">⚠️ تعديل الحركة يغيّر الكمية الحالية للمادة تلقائياً.</div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveMovement(${id})">💾 حفظ التعديل</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
  if (mv.type === 'in') {
    onSupplierChange();
    if (mv.supplier_vehicle_id) $('#f_supveh').value = String(mv.supplier_vehicle_id);
  }
};
window.saveMovement = async function(id) {
  const mv = S.movements.find(x=>x.id===id);
  const qty = Number($('#f_qty').value);
  if (!qty || qty <= 0) return toast('أدخل كمية صحيحة', 'err');
  const patch = { qty, date: $('#f_date').value || mv.date, note: $('#f_note').value.trim() };
  if (mv.type === 'in') {
    patch.price = Number($('#f_price').value)||0;
    patch.supplier_id = Number($('#f_supplier').value) || null;
    patch.supplier_vehicle_id = Number($('#f_supveh').value) || null;
    patch.doc_no = $('#f_doc').value.trim();
    patch.paid = $('#f_paid').value === '1';
  }
  try {
    await DB.update('movements', id, patch);
    closeModal(); toast('تم التعديل ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delMovement = async function(id) {
  const mv = S.movements.find(x=>x.id===id);
  const m = matById(mv.material_id);
  if (!confirm(`حذف حركة ${mv.type==='in'?'التوريد':'الصرف'} (${fmt(mv.qty)} ${m?m.unit:''}) للمادة "${m?m.name:''}"؟\nستتغير الكمية الحالية تلقائياً.`)) return;
  try { await DB.remove('movements', id); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.delMaterial = async function(id) {
  const m = matById(id);
  if (S.mixture_items.some(i => i.material_id === id)) return toast('لا يمكن حذف مادة مستخدمة في خلطات', 'err');
  if (!confirm(`حذف المادة "${m.name}" وكل حركاتها؟`)) return;
  try { await DB.remove('materials', id); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   🏪 الموردون وعرباتهم
   ===================================================== */
const supById = id => S.suppliers.find(s => s.id === id);
const supVehicles = sid => S.supplier_vehicles.filter(v => v.supplier_id === sid);
const supMovements = sid => S.movements.filter(m => m.type === 'in' && m.supplier_id === sid);
const movValue = mv => Number(mv.qty) * Number(mv.price || 0);

function renderSuppliers() {
  const ce = canEdit('suppliers');
  const q = ($('#supSearch').value || '').trim();
  const allIn = S.movements.filter(m => m.type === 'in');
  const totalValue = allIn.reduce((s,m) => s + movValue(m), 0);
  const unpaidValue = allIn.filter(m => m.paid === false).reduce((s,m) => s + movValue(m), 0);

  $('#supCards').innerHTML = `
    <div class="card blue"><div class="c-label">🏪 عدد الموردين</div><div class="c-value">${S.suppliers.length}</div>
      <div class="c-sub">${S.supplier_vehicles.length} عربة مسجلة</div></div>
    <div class="card"><div class="c-label">📥 عمليات التوريد</div><div class="c-value">${allIn.length}</div></div>
    <div class="card amber"><div class="c-label">💵 قيمة المشتريات</div><div class="c-value">${money(totalValue)}</div></div>
    <div class="card ${unpaidValue>0?'red':'green'}"><div class="c-label">⏳ توريدات غير مسددة</div><div class="c-value">${money(unpaidValue)}</div></div>`;

  const list = S.suppliers.filter(s => !q || s.name.includes(q) || (s.phone||'').includes(q));
  $('#suppliersList').innerHTML = list.length ? list.map(s => {
    const vehs = supVehicles(s.id);
    const movs = supMovements(s.id);
    const total = movs.reduce((x,m) => x + movValue(m), 0);
    const unpaid = movs.filter(m => m.paid === false).reduce((x,m) => x + movValue(m), 0);
    const vehRows = vehs.map(v => `<tr>
      <td><b>🚛 ${esc(v.name)}</b></td>
      <td>${esc(v.driver||'—')}</td>
      <td dir="ltr" style="text-align:right">${esc(v.phone||'—')}</td>
      <td class="num">${v.capacity?fmt(v.capacity):'—'}</td>
      <td class="num">${S.movements.filter(m=>m.supplier_vehicle_id===v.id).length}</td>
      <td>${ce ? `<div class="actions">
        <button class="btn sm" onclick="supVehicleForm(${s.id}, ${v.id})">✏️</button>
        <button class="btn sm danger" onclick="delSupVehicle(${v.id})">🗑️</button></div>` : ''}</td>
    </tr>`).join('');
    const lastMovs = [...movs].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id).slice(0,5).map(m => {
      const mat = matById(m.material_id);
      return `<tr>
        <td>${esc(m.date)}</td>
        <td>${esc(mat?mat.name:'—')}</td>
        <td class="num">${fmt(m.qty)} ${esc(mat?mat.unit:'')}</td>
        <td class="num">${money(movValue(m))}</td>
        <td><span class="badge ${m.paid===false?'low':'ok'}">${m.paid===false?'آجل':'مسدد'}</span></td>
      </tr>`;
    }).join('');
    return `<div class="panel recipe-card">
      <div class="recipe-head">
        <div>
          <h3 style="margin:0">🏪 ${esc(s.name)}</h3>
          <div class="hint">
            ${s.phone?`📞 <span dir="ltr">${esc(s.phone)}</span> &nbsp;`:''}
            ${s.address?`📍 ${esc(s.address)} &nbsp;`:''}
            ${s.material_types?`🧱 ${esc(s.material_types)}`:''}
          </div>
          <div class="hint">${vehs.length} عربة — ${movs.length} توريد — الإجمالي: <b>${money(total)}</b>${unpaid>0?` — <span style="color:var(--red)">آجل: ${money(unpaid)}</span>`:''}</div>
        </div>
        <div class="actions">
          ${ce ? `<button class="btn sm primary" onclick="supVehicleForm(${s.id}, 0)">➕ عربة</button>
          <button class="btn sm" onclick="supplierForm(${s.id})">✏️</button>
          <button class="btn sm danger" onclick="delSupplier(${s.id})">🗑️</button>` : ''}
        </div>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>العربة</th><th>السائق</th><th>الهاتف</th><th>الحمولة</th><th>التوريدات</th><th></th></tr>
        ${vehRows || '<tr><td colspan="6" class="empty-row">لا توجد عربات مسجلة لهذا المورد</td></tr>'}
      </table></div>
      ${movs.length ? `<div class="hint" style="margin-top:10px">آخر التوريدات:</div>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>التاريخ</th><th>المادة</th><th>الكمية</th><th>القيمة</th><th>الدفع</th></tr>${lastMovs}
      </table></div>` : ''}
      ${s.notes ? `<div class="hint" style="margin-top:8px">📝 ${esc(s.notes)}</div>` : ''}
    </div>`;
  }).join('') : `<div class="panel"><p class="empty-row">${q?'لا نتائج مطابقة':'لا يوجد موردون بعد — اضغط "➕ مورد جديد"'}</p></div>`;

  // آخر عمليات التوريد (كل الموردين)
  const rows = [...allIn].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id).slice(0,25).map(m => {
    const mat = matById(m.material_id);
    const sup = m.supplier_id ? supById(m.supplier_id) : null;
    const veh = m.supplier_vehicle_id ? S.supplier_vehicles.find(v=>v.id===m.supplier_vehicle_id) : null;
    return `<tr>
      <td>${esc(m.date)}</td>
      <td>${sup?esc(sup.name):'<span class="hint">بدون مورد</span>'}</td>
      <td>${veh?'🚛 '+esc(veh.name):'—'}</td>
      <td>${esc(mat?mat.name:'—')}</td>
      <td class="num">${fmt(m.qty)} ${esc(mat?mat.unit:'')}</td>
      <td class="num">${money(m.price||0)}</td>
      <td class="num"><b>${money(movValue(m))}</b></td>
      <td>${esc(m.doc_no||'—')}</td>
      <td><span class="badge ${m.paid===false?'low':'ok'}">${m.paid===false?'آجل':'مسدد'}</span></td>
    </tr>`;
  }).join('');
  $('#supMovTable').innerHTML = `
    <tr><th>التاريخ</th><th>المورد</th><th>العربة</th><th>المادة</th><th>الكمية</th><th>سعر الوحدة</th><th>القيمة</th><th>رقم الوصل</th><th>الدفع</th></tr>
    ${rows || '<tr><td colspan="9" class="empty-row">لا توجد عمليات توريد بعد</td></tr>'}`;
}
$('#supSearch').oninput = renderSuppliers;

window.supplierForm = function(id) {
  const s = id ? supById(id) : null;
  modal(s ? 'تعديل مورد' : 'مورد جديد', `
    <div class="form-grid">
      <div class="form-row"><label>اسم المورد *</label><input id="f_name" value="${esc(s?.name||'')}" placeholder="معمل سمنت الكوفة"></div>
      <div class="form-row"><label>رقم الهاتف</label><input id="f_phone" dir="ltr" value="${esc(s?.phone||'')}"></div>
      <div class="form-row"><label>العنوان</label><input id="f_addr" value="${esc(s?.address||'')}"></div>
      <div class="form-row"><label>المواد التي يوردها</label><input id="f_types" value="${esc(s?.material_types||'')}" placeholder="سمنت، رمل، حصى"></div>
    </div>
    <div class="form-row"><label>ملاحظات</label><input id="f_notes" value="${esc(s?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveSupplier(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveSupplier = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم المورد مطلوب', 'err');
  if (S.suppliers.find(s => s.name === name && s.id !== id)) return toast('⚠️ يوجد مورد بنفس الاسم', 'err');
  const data = { name, phone: $('#f_phone').value.trim(), address: $('#f_addr').value.trim(),
    material_types: $('#f_types').value.trim(), notes: $('#f_notes').value.trim() };
  try {
    if (id) await DB.update('suppliers', id, data); else await DB.insert('suppliers', data);
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delSupplier = async function(id) {
  const s = supById(id);
  if (S.movements.some(m => m.supplier_id === id)) return toast('لا يمكن حذف مورد مرتبط بعمليات توريد', 'err');
  if (!confirm(`حذف المورد "${s.name}" وكل عرباته؟`)) return;
  try { await DB.remove('suppliers', id); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.supVehicleForm = function(supId, vehId) {
  const v = vehId ? S.supplier_vehicles.find(x=>x.id===vehId) : null;
  const s = supById(v ? v.supplier_id : supId);
  modal(v ? 'تعديل عربة مورد' : `➕ عربة جديدة: ${esc(s.name)}`, `
    <div class="form-grid">
      <div class="form-row"><label>اسم / رقم العربة *</label><input id="f_name" value="${esc(v?.name||'')}" placeholder="حوضية 12 طن / رقم اللوحة"></div>
      <div class="form-row"><label>اسم السائق</label><input id="f_driver" value="${esc(v?.driver||'')}"></div>
      <div class="form-row"><label>هاتف السائق</label><input id="f_phone" dir="ltr" value="${esc(v?.phone||'')}"></div>
      <div class="form-row"><label>الحمولة</label><input id="f_cap" type="number" min="0" step="any" value="${v?.capacity??''}" placeholder="بالطن أو م³"></div>
    </div>
    <div class="form-row"><label>ملاحظات</label><input id="f_notes" value="${esc(v?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveSupVehicle(${v?v.supplier_id:supId}, ${vehId||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveSupVehicle = async function(supId, vehId) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم العربة مطلوب', 'err');
  const data = { supplier_id: supId, name, driver: $('#f_driver').value.trim(),
    phone: $('#f_phone').value.trim(), capacity: Number($('#f_cap').value) || null,
    notes: $('#f_notes').value.trim() };
  try {
    if (vehId) await DB.update('supplier_vehicles', vehId, data);
    else await DB.insert('supplier_vehicles', data);
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delSupVehicle = async function(id) {
  if (S.movements.some(m => m.supplier_vehicle_id === id)) return toast('لا يمكن حذف عربة مرتبطة بتوريدات', 'err');
  if (!confirm('حذف هذه العربة؟')) return;
  try { await DB.remove('supplier_vehicles', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

// تحديث قائمة عربات المورد داخل نموذج التوريد
window.onSupplierChange = function() {
  const sid = Number($('#f_supplier').value);
  const sel = $('#f_supveh');
  const vehs = sid ? supVehicles(sid) : [];
  sel.innerHTML = '<option value="">— بدون عربة —</option>' +
    vehs.map(v=>`<option value="${v.id}">${esc(v.name)}${v.driver?' — '+esc(v.driver):''}</option>`).join('');
  sel.disabled = !sid;
  if (sid && !vehs.length) sel.innerHTML = '<option value="">— لا توجد عربات مسجلة لهذا المورد —</option>';
};

/* =====================================================
   📋 الخلطات الجاهزة (وصفات محفوظة)
   ===================================================== */
const recipeItems = rid => S.recipe_items.filter(i => i.recipe_id === rid);
// كلفة الوحدة الواحدة من الوصفة حسب أسعار المواد الحالية
function recipeUnitCost(rid) {
  return recipeItems(rid).reduce((s,i) => {
    const m = matById(i.material_id);
    return s + Number(i.qty_per_unit) * (m ? Number(m.unit_price) : 0);
  }, 0);
}

function renderRecipes() {
  const ce = canEdit('recipes');
  if (!S.recipes.length) {
    $('#recipesList').innerHTML = `<div class="panel"><p class="empty-row">لا توجد خلطات جاهزة بعد — اضغط "➕ خلطة جاهزة جديدة" لتعريف أول خلطة</p></div>`;
    return;
  }
  $('#recipesList').innerHTML = S.recipes.map(r => {
    const items = recipeItems(r.id);
    const used = S.mixtures.filter(m => m.recipe_id === r.id).length;
    const rows = items.map(i => {
      const m = matById(i.material_id);
      const avail = m ? qtyOf(m.id) : 0;
      return `<tr>
        <td>${esc(m?m.name:'— مادة محذوفة —')}</td>
        <td class="num">${fmt(i.qty_per_unit)} ${esc(m?m.unit:'')}</td>
        <td class="num">${money(Number(i.qty_per_unit) * (m?Number(m.unit_price):0))}</td>
        <td class="num">${fmt(avail)} ${esc(m?m.unit:'')}</td>
      </tr>`;
    }).join('');
    return `<div class="panel recipe-card">
      <div class="recipe-head">
        <div>
          <h3 style="margin:0">📋 ${esc(r.name)}</h3>
          <div class="hint">${items.length} مكوّن — الكلفة لكل ${esc(r.unit)}: <b>${money(recipeUnitCost(r.id))}</b>${used?` — استُخدمت ${used} مرة`:''}</div>
        </div>
        <div class="actions">
          <button class="btn sm primary" onclick="useRecipe(${r.id})">▶️ تنفيذ خلطة منها</button>
          ${ce ? `<button class="btn sm" onclick="recipeForm(${r.id})">✏️</button>
          <button class="btn sm danger" onclick="delRecipe(${r.id})">🗑️</button>` : ''}
        </div>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>المادة</th><th>الكمية لكل ${esc(r.unit)}</th><th>الكلفة</th><th>المتوفر بالمخزن</th></tr>
        ${rows || '<tr><td colspan="4" class="empty-row">لا توجد مكونات</td></tr>'}
      </table></div>
      ${r.notes ? `<div class="hint" style="margin-top:8px">📝 ${esc(r.notes)}</div>` : ''}
    </div>`;
  }).join('');
}

let rcpCounter = 0;
window.recipeForm = function(id) {
  if (!S.materials.length) return toast('أضف مواد خام أولاً', 'err');
  const r = id ? S.recipes.find(x=>x.id===id) : null;
  const items = id ? recipeItems(id) : [];
  modal(r ? 'تعديل خلطة جاهزة' : 'خلطة جاهزة جديدة', `
    <div class="form-grid">
      <div class="form-row"><label>اسم الخلطة *</label><input id="f_name" value="${esc(r?.name||'')}" placeholder="خرسانة C30 / سمنت كار مقاوم"></div>
      <div class="form-row"><label>وحدة الإنتاج</label>
        <select id="f_unit">${['م³','طن','كغم','لتر','قطعة'].map(u=>`<option ${r?.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
    </div>
    <div class="form-row"><label>المكونات — الكمية المطلوبة لإنتاج <b>وحدة واحدة</b></label>
      <div id="rcpList"></div>
      <button class="btn sm" onclick="addRcpRow()">➕ إضافة مكوّن</button>
    </div>
    <div class="calc-box" id="rcpCalc"></div>
    <div class="form-row" style="margin-top:12px"><label>ملاحظات</label><input id="f_notes" value="${esc(r?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveRecipe(${id||0})">💾 حفظ الخلطة الجاهزة</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
  $('#rcpList').innerHTML = '';
  rcpCounter = 0;
  if (items.length) items.forEach(i => addRcpRow(i.material_id, i.qty_per_unit));
  else addRcpRow();
  recalcRcp();
};

window.addRcpRow = function(matId, qty) {
  const rid = ++rcpCounter;
  const div = document.createElement('div');
  div.className = 'ing-row'; div.id = 'rcp'+rid;
  div.innerHTML = `
    <select class="rcp-mat" onchange="recalcRcp()">
      <option value="">— اختر مادة —</option>
      ${S.materials.map(m=>`<option value="${m.id}" ${m.id===matId?'selected':''}>${esc(m.name)} (${esc(m.unit)})</option>`).join('')}
    </select>
    <input class="rcp-qty" type="number" min="0" step="any" placeholder="الكمية" value="${qty??''}" oninput="recalcRcp()">
    <div class="ing-pct">—</div>
    <button class="ing-del" onclick="document.getElementById('rcp${rid}').remove(); recalcRcp()">✕</button>`;
  $('#rcpList').appendChild(div);
};

function readRcpItems() {
  return $$('#rcpList .ing-row').map(r => ({
    material_id: Number(r.querySelector('.rcp-mat').value),
    qty_per_unit: Number(r.querySelector('.rcp-qty').value)
  })).filter(i => i.material_id && i.qty_per_unit > 0);
}

window.recalcRcp = function() {
  const items = readRcpItems();
  const total = items.reduce((s,i)=>s+i.qty_per_unit, 0);
  $$('#rcpList .ing-row').forEach(r => {
    const q = Number(r.querySelector('.rcp-qty').value);
    r.querySelector('.ing-pct').textContent = (q>0 && total>0) ? (q/total*100).toFixed(1)+'%' : '—';
  });
  const cost = items.reduce((s,i) => {
    const m = matById(i.material_id);
    return s + i.qty_per_unit * (m?Number(m.unit_price):0);
  }, 0);
  const unit = $('#f_unit')?.value || 'وحدة';
  $('#rcpCalc').innerHTML = `مجموع المكونات لكل ${esc(unit)}: <b>${fmt(total)}</b> &nbsp;|&nbsp; الكلفة التقديرية لكل ${esc(unit)}: <b>${money(cost)}</b>`;
};

window.saveRecipe = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم الخلطة مطلوب', 'err');
  if (S.recipes.find(r => r.name === name && r.id !== id)) return toast('⚠️ توجد خلطة جاهزة بنفس الاسم', 'err');
  const items = readRcpItems();
  if (!items.length) return toast('أضف مكوّناً واحداً على الأقل', 'err');
  const data = { name, unit: $('#f_unit').value, notes: $('#f_notes').value.trim() };
  try {
    let rid = id;
    if (id) {
      await DB.update('recipes', id, data);
      for (const it of recipeItems(id)) await DB.remove('recipe_items', it.id);
    } else {
      const row = await DB.insert('recipes', data);
      rid = row.id;
    }
    for (const i of items) await DB.insert('recipe_items', { recipe_id: rid, material_id: i.material_id, qty_per_unit: i.qty_per_unit });
    closeModal(); toast('تم حفظ الخلطة الجاهزة ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.delRecipe = async function(id) {
  const r = S.recipes.find(x=>x.id===id);
  if (!confirm(`حذف الخلطة الجاهزة "${r.name}"؟\n(الخلطات المنفذة سابقاً لن تتأثر)`)) return;
  try { await DB.remove('recipes', id); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

// تنفيذ خلطة من وصفة جاهزة: اختر الكمية فقط
window.useRecipe = function(rid) {
  const r = S.recipes.find(x=>x.id===rid);
  modal(`▶️ تنفيذ خلطة: ${esc(r.name)}`, `
    <div class="form-grid">
      <div class="form-row"><label>الكمية المطلوبة (${esc(r.unit)}) *</label>
        <input id="ur_qty" type="number" min="0" step="any" value="1" oninput="urPreview(${rid})"></div>
      <div class="form-row"><label>التاريخ</label><input id="ur_date" type="date" value="${today()}"></div>
    </div>
    <div class="form-row"><label>الزبون (اختياري)</label>
      <select id="ur_cust"><option value="">— بدون زبون —</option>
      ${S.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div class="form-row"><label>المواد التي ستُخصم من المخزون</label>
      <div class="tbl-wrap"><table class="tbl" id="urTable"></table></div></div>
    <div class="calc-box" id="urCalc"></div>
    <div class="form-row" style="margin-top:12px"><label>ملاحظات</label><input id="ur_notes"></div>
    <div class="form-actions">
      <button class="btn primary" id="urBtn" onclick="runRecipe(${rid})">▶️ تنفيذ وخصم المواد</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
  urPreview(rid);
};

window.urPreview = function(rid) {
  const r = S.recipes.find(x=>x.id===rid);
  const qty = Number($('#ur_qty').value) || 0;
  const items = recipeItems(rid);
  let cost = 0, short = false;
  const rows = items.map(i => {
    const m = matById(i.material_id);
    const need = Number(i.qty_per_unit) * qty;
    const avail = m ? qtyOf(m.id) : 0;
    const ok = need <= avail;
    if (!ok) short = true;
    cost += need * (m?Number(m.unit_price):0);
    return `<tr>
      <td>${esc(m?m.name:'—')}</td>
      <td class="num"><b>${fmt(need)}</b> ${esc(m?m.unit:'')}</td>
      <td class="num">${fmt(avail)}</td>
      <td><span class="badge ${ok?'ok':'low'}">${ok?'✔ متوفر':'⚠️ ناقص'}</span></td>
    </tr>`;
  }).join('');
  $('#urTable').innerHTML = `
    <tr><th>المادة</th><th>المطلوب</th><th>المتوفر</th><th>الحالة</th></tr>
    ${rows || '<tr><td colspan="4" class="empty-row">لا مكونات</td></tr>'}`;
  $('#urCalc').innerHTML = `الكمية: <b>${fmt(qty)} ${esc(r.unit)}</b> &nbsp;|&nbsp; الكلفة الإجمالية: <b>${money(cost)}</b>
    ${short?'<div style="color:var(--red);margin-top:6px">⚠️ لا يمكن التنفيذ — مواد غير كافية في المخزون</div>':''}`;
  const btn = $('#urBtn');
  if (btn) { btn.disabled = short || qty <= 0; btn.style.opacity = (short || qty<=0) ? .5 : 1; }
};

window.runRecipe = async function(rid) {
  const r = S.recipes.find(x=>x.id===rid);
  const qty = Number($('#ur_qty').value) || 0;
  if (qty <= 0) return toast('أدخل كمية صحيحة', 'err');
  const items = recipeItems(rid);
  // فحص المخزون مرة أخيرة
  for (const i of items) {
    const need = Number(i.qty_per_unit) * qty;
    if (need > qtyOf(i.material_id)) {
      const m = matById(i.material_id);
      return toast(`⚠️ المخزون لا يكفي من: ${m?m.name:''}`, 'err');
    }
  }
  const date = $('#ur_date').value || today();
  try {
    const mix = await DB.insert('mixtures', {
      name: r.name, date, output_qty: qty, output_unit: r.unit,
      customer_id: Number($('#ur_cust').value) || null,
      notes: $('#ur_notes').value.trim(), recipe_id: rid,
      status: 'draft', cost: 0
    });
    let cost = 0;
    for (const i of items) {
      const need = Number(i.qty_per_unit) * qty;
      const m = matById(i.material_id);
      cost += need * Number(m.unit_price);
      await DB.insert('mixture_items', { mixture_id: mix.id, material_id: i.material_id, qty: need });
      await DB.insert('movements', { material_id: i.material_id, type:'out', qty: need,
        note: `تنفيذ خلطة جاهزة: ${r.name} (#${mix.id})`, date });
    }
    await DB.update('mixtures', mix.id, { status:'executed', cost });
    closeModal();
    toast(`✔ تم تنفيذ ${fmt(qty)} ${r.unit} — الكلفة: ${money(cost)}`, 'ok');
    await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   ⚗️ الخلطات
   ===================================================== */
function renderMixtures() {
  const q = ($('#mixSearch').value || '').trim();
  const rows = [...S.mixtures].sort((a,b)=>b.id-a.id)
    .filter(m => !q || m.name.includes(q))
    .map(m => {
      const items = mixItems(m.id);
      const ingNames = items.map(i => { const mat = matById(i.material_id); return mat ? mat.name : '?'; }).join('، ');
      const cost = m.status==='executed' ? Number(m.cost) : mixtureCostNow(m.id);
      const cust = m.customer_id ? custById(m.customer_id) : null;
      return `<tr>
        <td class="num">#${m.id}</td>
        <td><b>${esc(m.name)}</b><div class="hint">${esc(ingNames)}</div></td>
        <td>${esc(m.date)}</td>
        <td class="num">${fmt(m.output_qty)} ${esc(m.output_unit)}</td>
        <td class="num">${money(cost)}</td>
        <td>${cust ? esc(cust.name) : '—'}</td>
        <td><span class="badge ${m.status==='executed'?'done':'draft'}">${m.status==='executed'?'✔ منفذة':'⏳ مسودة'}</span></td>
        <td>${canEdit('mixtures') ? `<div class="actions">
          ${m.status!=='executed' ? `<button class="btn sm primary" onclick="executeMixture(${m.id})">▶️ تنفيذ</button>` : ''}
          <button class="btn sm" onclick="mixtureForm(${m.id})">✏️</button>
          <button class="btn sm danger" onclick="delMixture(${m.id})">🗑️</button>
        </div>` : '<span class="hint">عرض فقط</span>'}</td>
      </tr>`;
    }).join('');
  $('#mixTable').innerHTML = `
    <tr><th>ID</th><th>اسم الخلطة</th><th>التاريخ</th><th>كمية المنتج</th><th>الكلفة</th><th>الزبون</th><th>الحالة</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="8" class="empty-row">لا توجد خلطات بعد</td></tr>'}`;
}
$('#mixSearch').oninput = renderMixtures;

let ingCounter = 0;
window.mixtureForm = function(id) {
  if (!S.materials.length) return toast('أضف مواد خام أولاً', 'err');
  const m = id ? mixById(id) : null;
  const items = id ? mixItems(id) : [];
  const executed = m && m.status === 'executed';
  modal(m ? (executed ? 'تعديل خلطة منفذة (البيانات فقط)' : 'تعديل خلطة') : 'خلطة جديدة', `
    <div class="form-grid">
      <div class="form-row"><label>اسم الخلطة *</label><input id="f_name" value="${esc(m?.name||'')}" placeholder="خلطة خرسانة C30 مثلاً"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${m?.date||today()}"></div>
      <div class="form-row"><label>كمية المنتج النهائي</label><input id="f_out" type="number" min="0" step="any" value="${m?.output_qty??''}"></div>
      <div class="form-row"><label>وحدة المنتج</label>
        <select id="f_outunit">${['كغم','طن','م³','قطعة','لتر'].map(u=>`<option ${m?.output_unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
    </div>
    <div class="form-row"><label>الزبون (اختياري)</label>
      <select id="f_cust"><option value="">— بدون زبون —</option>
      ${S.customers.map(c=>`<option value="${c.id}" ${m?.customer_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    ${executed ? '<div class="hint">⚠️ الخلطة منفذة — المكونات مثبتة لأن المواد خُصمت من المخزون. يمكن تعديل البيانات الأساسية فقط.</div>' : `
    ${S.recipes.length ? `<div class="form-row"><label>📋 تعبئة من خلطة جاهزة (اختياري)</label>
      <select id="f_recipe" onchange="fillFromRecipe()">
        <option value="">— إدخال المكونات يدوياً —</option>
        ${S.recipes.map(r=>`<option value="${r.id}">${esc(r.name)} (لكل ${esc(r.unit)})</option>`).join('')}
      </select>
      <div class="hint">اختر خلطة جاهزة فتُعبأ المكونات تلقائياً مضروبة بكمية المنتج أعلاه.</div></div>` : ''}
    <div class="form-row"><label>المكونات (من المخزون)</label>
      <div id="ingList"></div>
      <button class="btn sm" onclick="addIngRow()">➕ إضافة مكوّن</button>
    </div>
    <div class="calc-box" id="mixCalc"></div>`}
    <div class="form-row" style="margin-top:12px"><label>ملاحظات</label><input id="f_notes" value="${esc(m?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveMixture(${id||0})">💾 حفظ الخلطة</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
  if (!executed) {
    $('#ingList').innerHTML = '';
    ingCounter = 0;
    if (items.length) items.forEach(i => addIngRow(i.material_id, i.qty));
    else addIngRow();
    recalcMix();
  }
};

// تعبئة مكونات الخلطة من وصفة جاهزة (مضروبة بالكمية)
window.fillFromRecipe = function() {
  const rid = Number($('#f_recipe').value);
  if (!rid) return;
  const r = S.recipes.find(x=>x.id===rid);
  const mult = Number($('#f_out').value) || 1;
  if (!$('#f_name').value.trim()) $('#f_name').value = r.name;
  const unitSel = $('#f_outunit');
  if ([...unitSel.options].some(o => o.value === r.unit)) unitSel.value = r.unit;
  if (!Number($('#f_out').value)) $('#f_out').value = 1;
  $('#ingList').innerHTML = '';
  ingCounter = 0;
  recipeItems(rid).forEach(i => addIngRow(i.material_id, Number(i.qty_per_unit) * mult));
  recalcMix();
  toast(`تم تعبئة مكونات "${r.name}" لـ ${fmt(mult)} ${r.unit}`, 'ok');
};

window.addIngRow = function(matId, qty) {
  const rid = ++ingCounter;
  const div = document.createElement('div');
  div.className = 'ing-row'; div.id = 'ing'+rid;
  div.innerHTML = `
    <select class="ing-mat" onchange="recalcMix()">
      <option value="">— اختر مادة —</option>
      ${S.materials.map(m=>`<option value="${m.id}" ${m.id===matId?'selected':''}>${esc(m.name)} (متوفر: ${fmt(qtyOf(m.id))} ${esc(m.unit)})</option>`).join('')}
    </select>
    <input class="ing-qty" type="number" min="0" step="any" placeholder="الكمية" value="${qty??''}" oninput="recalcMix()">
    <div class="ing-pct">—</div>
    <button class="ing-del" onclick="document.getElementById('ing${rid}').remove(); recalcMix()">✕</button>`;
  $('#ingList').appendChild(div);
};

function readIngredients() {
  return $$('#ingList .ing-row').map(r => ({
    material_id: Number(r.querySelector('.ing-mat').value),
    qty: Number(r.querySelector('.ing-qty').value)
  })).filter(i => i.material_id && i.qty > 0);
}

window.recalcMix = function() {
  const ings = readIngredients();
  const totalQty = ings.reduce((s,i)=>s+i.qty, 0);
  // نسب المكونات
  $$('#ingList .ing-row').forEach(r => {
    const q = Number(r.querySelector('.ing-qty').value);
    r.querySelector('.ing-pct').textContent = (q>0 && totalQty>0) ? (q/totalQty*100).toFixed(1)+'%' : '—';
  });
  let cost = 0, shortages = [];
  ings.forEach(i => {
    const m = matById(i.material_id);
    if (!m) return;
    cost += i.qty * Number(m.unit_price);
    if (i.qty > qtyOf(i.material_id)) shortages.push(m.name);
  });
  $('#mixCalc').innerHTML = `
    إجمالي كمية المكونات: <b>${fmt(totalQty)}</b> &nbsp;|&nbsp;
    الكلفة التقديرية: <b>${money(cost)}</b>
    ${shortages.length ? `<div style="color:var(--red);margin-top:6px">⚠️ نقص في المخزون: ${esc(shortages.join('، '))}</div>` : ''}`;
};

window.saveMixture = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم الخلطة مطلوب', 'err');
  const executed = id && mixById(id)?.status === 'executed';
  const ings = executed ? [] : readIngredients();
  if (!executed && !ings.length) return toast('أضف مكوّناً واحداً على الأقل', 'err');
  const data = {
    name, date: $('#f_date').value || today(),
    output_qty: Number($('#f_out').value)||0,
    output_unit: $('#f_outunit').value,
    customer_id: Number($('#f_cust').value) || null,
    notes: $('#f_notes').value.trim()
  };
  try {
    let mixId = id;
    if (id) {
      await DB.update('mixtures', id, data);
      if (!executed) {
        // إعادة بناء المكونات (للمسودات فقط)
        for (const it of mixItems(id)) await DB.remove('mixture_items', it.id);
      }
    } else {
      const row = await DB.insert('mixtures', { ...data, status:'draft', cost:0 });
      mixId = row.id;
    }
    for (const i of ings) await DB.insert('mixture_items', { mixture_id: mixId, material_id: i.material_id, qty: i.qty });
    closeModal(); toast('تم حفظ الخلطة ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

// تنفيذ الخلطة: خصم المواد من المخزون + تثبيت الكلفة
window.executeMixture = async function(id) {
  const m = mixById(id);
  const items = mixItems(id);
  const shortages = items.filter(i => i.qty > qtyOf(i.material_id));
  if (shortages.length) {
    const names = shortages.map(i => { const mat = matById(i.material_id); return `${mat.name} (متوفر ${fmt(qtyOf(i.material_id))} / مطلوب ${fmt(i.qty)})`; }).join('\n');
    return toast('⚠️ لا يمكن التنفيذ — نقص مخزون:\n'+names, 'err');
  }
  if (!confirm(`تنفيذ الخلطة "${m.name}"؟\nسيتم خصم المواد المستخدمة من المخزون تلقائياً.`)) return;
  try {
    let cost = 0;
    for (const i of items) {
      const mat = matById(i.material_id);
      cost += Number(i.qty) * Number(mat.unit_price);
      await DB.insert('movements', { material_id: i.material_id, type:'out', qty: i.qty, note:`تنفيذ خلطة: ${m.name} (#${m.id})`, date: today() });
    }
    await DB.update('mixtures', id, { status:'executed', cost });
    toast(`✔ تم تنفيذ الخلطة — الكلفة: ${money(cost)}`, 'ok');
    await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.delMixture = async function(id) {
  const m = mixById(id);
  if (S.invoices.some(v => v.mixture_id === id)) return toast('لا يمكن حذف خلطة مرتبطة بفواتير', 'err');
  if (!confirm(`حذف الخلطة "${m.name}"؟${m.status==='executed'?'\n(ملاحظة: لن تُعاد المواد المخصومة للمخزون)':''}`)) return;
  try { await DB.remove('mixtures', id); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   👥 الزبائن
   ===================================================== */
function renderCustomers() {
  const q = ($('#custSearch').value || '').trim();
  const rows = S.customers
    .filter(c => !q || c.name.includes(q) || (c.phone||'').includes(q))
    .map(c => {
      const mixCount = S.mixtures.filter(m => m.customer_id === c.id).length;
      const invs = S.invoices.filter(v => v.customer_id === c.id);
      const total = invs.reduce((s,v)=>s+Number(v.total), 0);
      const prof = invs.reduce((s,v)=>s+invProfit(v), 0);
      const due = invs.reduce((s,v)=>s+remainOf(v), 0);
      return `<tr>
        <td class="num">#${c.id}</td>
        <td><b>${esc(c.name)}</b></td>
        <td dir="ltr" style="text-align:right">${esc(c.phone||'—')}</td>
        <td>${esc(c.address||'—')}</td>
        <td class="num">${mixCount}</td>
        <td class="num">${invs.length}</td>
        <td class="num">${money(total)}</td>
        <td class="num" style="color:${prof>=0?'var(--green)':'var(--red)'}">${money(prof)}
          <div class="hint">${fmt((total>0?prof/total*100:0).toFixed(1))}%</div></td>
        <td class="num" style="color:${due>0?'var(--red)':'inherit'}">${money(due)}</td>
        <td><div class="actions">
          <button class="btn sm" onclick="showCustomer(${c.id})">👁️ التفاصيل</button>
          ${canEdit('customers') ? `<button class="btn sm" onclick="customerForm(${c.id})">✏️</button>
          <button class="btn sm danger" onclick="delCustomer(${c.id})">🗑️</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  $('#custTable').innerHTML = `
    <tr><th>المعرف</th><th>اسم الزبون</th><th>الهاتف</th><th>العنوان</th><th>الخلطات</th><th>الفواتير</th><th>إجمالي المشتريات</th><th>الربح</th><th>الآجل</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="10" class="empty-row">لا يوجد زبائن بعد</td></tr>'}`;
  // إعادة رسم ملف الزبون المفتوح بعد أي تحديث
  if (CUR_CUSTOMER && $('#custDetailPanel').style.display === 'block') drawCustomer();
}
$('#custSearch').oninput = renderCustomers;

window.customerForm = function(id) {
  const c = id ? custById(id) : null;
  modal(c ? 'تعديل زبون' : 'زبون جديد', `
    <div class="form-grid">
      <div class="form-row"><label>اسم الزبون *</label><input id="f_name" value="${esc(c?.name||'')}"></div>
      <div class="form-row"><label>رقم الهاتف</label><input id="f_phone" dir="ltr" value="${esc(c?.phone||'')}"></div>
    </div>
    <div class="form-row"><label>العنوان</label><input id="f_addr" value="${esc(c?.address||'')}"></div>
    <div class="form-row"><label>ملاحظات</label><textarea id="f_notes" rows="2">${esc(c?.notes||'')}</textarea></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveCustomer(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};

window.saveCustomer = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم الزبون مطلوب', 'err');
  const phone = $('#f_phone').value.trim();
  // منع التكرار بالاسم أو الهاتف
  const dup = S.customers.find(c => c.id !== id && (c.name === name || (phone && c.phone === phone)));
  if (dup) return toast('⚠️ زبون بنفس الاسم أو الهاتف موجود مسبقاً', 'err');
  const data = { name, phone, address: $('#f_addr').value.trim(), notes: $('#f_notes').value.trim() };
  try {
    if (id) await DB.update('customers', id, data);
    else await DB.insert('customers', data);
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* ---------- ملف الزبون التفصيلي ---------- */
let CUR_CUSTOMER = null;
const invProfit = v => Number(v.total) - Number(v.cost);

window.showCustomer = function(id) {
  CUR_CUSTOMER = id;
  $('#custListWrap').style.display = 'none';
  $('#custDetailPanel').style.display = 'block';
  $('#cdFrom').value = ''; $('#cdTo').value = ''; $('#cdPaid').value = '';
  drawCustomer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
window.backToCustomers = function() {
  CUR_CUSTOMER = null;
  $('#custDetailPanel').style.display = 'none';
  $('#custListWrap').style.display = 'block';
};
$('#cdBack').onclick = backToCustomers;
$('#cdApply').onclick = () => drawCustomer();
$('#cdPrint').onclick = () => printStatement();

function customerData() {
  const id = CUR_CUSTOMER;
  const from = $('#cdFrom').value, to = $('#cdTo').value, paidF = $('#cdPaid').value;
  let invs = S.invoices.filter(v => v.customer_id === id);
  if (from || to) invs = invs.filter(v => inRange(v.date, from, to));
  if (paidF === '1') invs = invs.filter(v => remainOf(v) <= 0.009);
  if (paidF === '0') invs = invs.filter(v => remainOf(v) > 0.009);
  invs.sort((a,b) => (b.date||'').localeCompare(a.date||'') || b.id - a.id);
  return { c: custById(id), invs, from, to };
}

function drawCustomer() {
  const { c, invs, from, to } = customerData();
  if (!c) return backToCustomers();
  $('#custDetailTitle').textContent = `👤 ${c.name}`;

  const sales   = invs.reduce((s,v) => s + Number(v.total), 0);
  const cogs    = invs.reduce((s,v) => s + Number(v.cost), 0);
  const dfees   = invs.reduce((s,v) => s + Number(v.delivery_fee||0), 0);
  const profit  = sales - cogs;
  const pct     = sales > 0 ? profit / sales * 100 : 0;
  const paidAmt = invs.reduce((s,v) => s + paidOf(v), 0);
  const dueAmt  = invs.reduce((s,v) => s + remainOf(v), 0);
  const totalQty= invs.reduce((s,v) => s + Number(v.qty||0), 0);
  const period  = (from || to) ? `${from||'البداية'} ← ${to||'اليوم'}` : 'كل الفترات';

  // بطاقات الملخص
  const cards = `<div class="cards">
    <div class="card green"><div class="c-label">🧾 إجمالي المشتريات</div><div class="c-value">${money(sales)}</div>
      <div class="c-sub">${invs.length} فاتورة — ${fmt(totalQty)} وحدة</div></div>
    <div class="card amber"><div class="c-label">📦 كلفة المواد</div><div class="c-value">${money(cogs)}</div>
      <div class="c-sub">${dfees>0?`أجور نقل: ${money(dfees)}`:''}</div></div>
    <div class="card ${profit>=0?'green':'red'}"><div class="c-label">💰 الربح من هذا الزبون</div><div class="c-value">${money(profit)}</div>
      <div class="c-sub">نسبة الربح: <b>${fmt(pct.toFixed(1))}%</b></div></div>
    <div class="card ${dueAmt>0?'red':'green'}"><div class="c-label">⏳ المبلغ الآجل</div><div class="c-value">${money(dueAmt)}</div>
      <div class="c-sub">المسدد: ${money(paidAmt)}</div></div>
  </div>`;

  // معلومات الزبون
  const info = `<div class="panel">
    <div class="recipe-head">
      <div>
        <h3 style="margin:0">📇 بيانات الزبون</h3>
        <div class="hint" style="font-size:14px;line-height:2">
          📞 <span dir="ltr">${esc(c.phone||'—')}</span> &nbsp;|&nbsp; 📍 ${esc(c.address||'—')}
          ${c.notes?`<br>📝 ${esc(c.notes)}`:''}
          <br>🗓️ الفترة المعروضة: <b>${esc(period)}</b>
        </div>
      </div>
      ${canEdit('customers') ? `<div class="actions">
        <button class="btn sm primary" onclick="saleFormFor(${c.id})">➕ فاتورة جديدة</button>
        <button class="btn sm" onclick="customerForm(${c.id})">✏️ تعديل البيانات</button>
      </div>` : ''}
    </div>
  </div>`;

  // جدول الفواتير مع الأرباح
  const invRows = invs.map(v => {
    const mix = v.mixture_id ? mixById(v.mixture_id) : null;
    const veh = v.vehicle_id ? S.vehicles.find(x=>x.id===v.vehicle_id) : null;
    const p = invProfit(v);
    const pp = Number(v.total) > 0 ? p / Number(v.total) * 100 : 0;
    return `<tr>
      <td><b>${esc(v.invoice_no)}</b></td>
      <td>${esc(v.date)}</td>
      <td>${mix?esc(mix.name):'—'}</td>
      <td class="num">${fmt(v.qty)}</td>
      <td class="num">${money(v.cost)}</td>
      <td class="num">${money(v.delivery_fee||0)}</td>
      <td class="num"><b>${money(v.total)}</b></td>
      <td class="num" style="color:${p>=0?'var(--green)':'var(--red)'}"><b>${money(p)}</b>
        <div class="hint">${fmt(pp.toFixed(1))}%</div></td>
      <td>${v.delivery_location?`📍 ${esc(v.delivery_location)}`:'—'}${veh?`<div class="hint">🚚 ${esc(veh.name)}</div>`:''}</td>
      <td>${(() => { const st = payStatus(v);
        return `<span class="badge ${st.cls}">${st.label}</span>
          ${st.key!=='paid'?`<div class="hint">متبقي <b style="color:var(--red)">${fmt(remainOf(v))}</b></div>`:''}`; })()}</td>
      <td><div class="actions">
        <button class="btn sm" onclick="receiptForm(${v.id})">📄</button>
        <button class="btn sm" onclick="printInvoice(${v.id})">🖨️</button>
        ${canEdit('sales')?`<button class="btn sm ${remainOf(v)>0?'primary':''}" onclick="paymentsForm(${v.id})">💵</button>
        <button class="btn sm" onclick="saleForm(${v.id})">✏️</button>`:''}
      </div></td>
    </tr>`;
  }).join('');
  const invTable = `<div class="panel">
    <h3>🧾 فواتير الزبون (${invs.length})</h3>
    <div class="tbl-wrap"><table class="tbl">
      <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الخلطة</th><th>الكمية</th><th>الكلفة</th><th>أجرة النقل</th><th>المبلغ</th><th>الربح</th><th>موقع التسليم</th><th>الدفع</th><th>إجراءات</th></tr>
      ${invRows || '<tr><td colspan="11" class="empty-row">لا توجد فواتير ضمن هذه الفترة</td></tr>'}
      ${invs.length ? `<tr style="background:#f8fafc;font-weight:900">
        <td colspan="4">الإجمالي</td>
        <td class="num">${money(cogs)}</td>
        <td class="num">${money(dfees)}</td>
        <td class="num">${money(sales)}</td>
        <td class="num" style="color:${profit>=0?'var(--green)':'var(--red)'}">${money(profit)}</td>
        <td colspan="3"></td></tr>` : ''}
    </table></div>
  </div>`;

  // تحليل شهري
  const byMonth = {};
  invs.forEach(v => {
    const mo = (v.date||'').slice(0,7);
    byMonth[mo] = byMonth[mo] || { sales:0, profit:0, n:0 };
    byMonth[mo].sales += Number(v.total);
    byMonth[mo].profit += invProfit(v);
    byMonth[mo].n++;
  });
  const months = Object.keys(byMonth).sort();
  const maxSale = Math.max(...months.map(m=>byMonth[m].sales), 1);
  const chart = months.length ? `<div class="panel">
    <h3>📊 مشتريات الزبون شهرياً</h3>
    <div class="barchart">${months.map(mo => `
      <div class="bar-col">
        <div class="bar-val">${fmt(byMonth[mo].sales)}</div>
        <div class="bar" style="height:${Math.max(byMonth[mo].sales/maxSale*100,1.5)}%"></div>
        <div class="bar-label">${mo}</div>
      </div>`).join('')}</div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl">
      <tr><th>الشهر</th><th>عدد الفواتير</th><th>المبيعات</th><th>الربح</th><th>نسبة الربح</th></tr>
      ${months.slice().reverse().map(mo => {
        const b = byMonth[mo];
        return `<tr><td>${mo}</td><td class="num">${b.n}</td><td class="num">${money(b.sales)}</td>
          <td class="num" style="color:${b.profit>=0?'var(--green)':'var(--red)'}">${money(b.profit)}</td>
          <td class="num">${fmt((b.sales>0?b.profit/b.sales*100:0).toFixed(1))}%</td></tr>`;
      }).join('')}
    </table></div>
  </div>` : '';

  // الخلطات الأكثر طلباً + الخلطات المرتبطة به
  const byMix = {};
  invs.forEach(v => {
    const key = v.mixture_id ? (mixById(v.mixture_id)?.name || '—') : 'بيع مباشر';
    byMix[key] = byMix[key] || { qty:0, sales:0, profit:0, n:0 };
    byMix[key].qty += Number(v.qty||0);
    byMix[key].sales += Number(v.total);
    byMix[key].profit += invProfit(v);
    byMix[key].n++;
  });
  const mixStats = Object.entries(byMix).sort((a,b)=>b[1].sales-a[1].sales);
  const linkedMixes = S.mixtures.filter(m => m.customer_id === CUR_CUSTOMER);
  const analysis = `<div class="grid-2">
    <div class="panel"><h3>⚗️ الأكثر طلباً</h3>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>الخلطة</th><th>مرات</th><th>الكمية</th><th>المبيعات</th><th>الربح</th></tr>
        ${mixStats.map(([n,b])=>`<tr><td>${esc(n)}</td><td class="num">${b.n}</td><td class="num">${fmt(b.qty)}</td>
          <td class="num">${money(b.sales)}</td><td class="num">${money(b.profit)}</td></tr>`).join('')
          || '<tr><td colspan="5" class="empty-row">لا بيانات</td></tr>'}
      </table></div></div>
    <div class="panel"><h3>🧪 الخلطات المزوّدة له (${linkedMixes.length})</h3>
      <div class="tbl-wrap"><table class="tbl">
        <tr><th>الخلطة</th><th>التاريخ</th><th>الكمية</th><th>الكلفة</th><th>الحالة</th></tr>
        ${linkedMixes.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.date)}</td>
          <td class="num">${fmt(m.output_qty)} ${esc(m.output_unit)}</td><td class="num">${money(m.cost)}</td>
          <td><span class="badge ${m.status==='executed'?'done':'draft'}">${m.status==='executed'?'منفذة':'مسودة'}</span></td></tr>`).join('')
          || '<tr><td colspan="5" class="empty-row">لا خلطات مرتبطة</td></tr>'}
      </table></div></div>
  </div>`;

  $('#custDetail').innerHTML = cards + info + invTable + chart + analysis;
}

// فاتورة جديدة لزبون محدد
window.saleFormFor = function(custId) {
  saleForm();
  const sel = $('#f_cust');
  if (sel) sel.value = String(custId);
};

// كشف حساب قابل للطباعة
window.printStatement = function() {
  const { c, invs, from, to } = customerData();
  const sales = invs.reduce((s,v)=>s+Number(v.total),0);
  const cogs  = invs.reduce((s,v)=>s+Number(v.cost),0);
  const paid  = invs.reduce((s,v)=>s+paidOf(v),0);
  const due   = invs.reduce((s,v)=>s+remainOf(v),0);
  const profit = sales - cogs;
  $('#printArea').innerHTML = `
    <div class="inv-print">
      <div class="inv-head">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="assets/logo.png" alt="" style="width:85px;height:85px;object-fit:contain" onerror="this.remove()">
          <div><h1>شركة بوابة الخليج</h1><div>للكونكريت الجاهز — كشف حساب زبون</div>
          <div style="font-size:13px">📞 <span dir="ltr">078000002060</span></div></div>
        </div>
        <div class="inv-meta">
          <b>الزبون:</b> ${esc(c.name)}<br>
          ${c.phone?`<b>الهاتف:</b> <span dir="ltr">${esc(c.phone)}</span><br>`:''}
          <b>الفترة:</b> ${esc(from||'البداية')} ← ${esc(to||'اليوم')}<br>
          <b>تاريخ الطباعة:</b> ${today()}
        </div>
      </div>
      <table>
        <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>المسدد</th><th>المتبقي</th><th>الحالة</th></tr>
        ${invs.slice().reverse().map(v => {
          const mix = v.mixture_id ? mixById(v.mixture_id) : null;
          return `<tr><td>${esc(v.invoice_no)}</td><td>${esc(v.date)}</td>
            <td>${mix?esc(mix.name):'بيع مباشر'}${v.delivery_location?` — ${esc(v.delivery_location)}`:''}</td>
            <td>${money(v.total)}</td><td>${money(paidOf(v))}</td><td>${money(remainOf(v))}</td>
            <td>${payStatus(v).label}</td></tr>`;
        }).join('') || '<tr><td colspan="7">لا توجد فواتير ضمن الفترة</td></tr>'}
        <tr style="font-weight:900;background:#eee">
          <td colspan="3">الإجمالي (${invs.length} فاتورة)</td><td>${money(sales)}</td>
          <td>${money(paid)}</td><td>${money(due)}</td><td></td></tr>
      </table>
      ${(() => {
        const ps = invs.flatMap(v => invPayments(v.id).map(p => ({...p, no: v.invoice_no})))
          .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
        return ps.length ? `<h3 style="margin-top:14px;font-size:15px">سجل الدفعات المستلمة</h3>
        <table><tr><th>التاريخ</th><th>الفاتورة</th><th>المبلغ</th><th>الطريقة</th></tr>
        ${ps.map(p=>`<tr><td>${esc(p.date)}</td><td>${esc(p.no)}</td><td>${money(p.amount)}</td><td>${esc(p.method||'نقد')}</td></tr>`).join('')}
        </table>` : '';
      })()}
      <div class="inv-total">
        المسدد: ${money(paid)} &nbsp;|&nbsp; <span style="color:#b00">المتبقي بالذمة: ${money(due)}</span>
      </div>
      <p style="margin-top:34px;font-size:13px">التوقيع: ______________________ &nbsp;&nbsp;&nbsp; الإدارة: ______________________</p>
    </div>`;
  window.print();
};

window.delCustomer = async function(id) {
  const c = custById(id);
  if (S.invoices.some(v => v.customer_id === id)) return toast('لا يمكن حذف زبون لديه فواتير', 'err');
  if (!confirm(`حذف الزبون "${c.name}"؟`)) return;
  try { await DB.remove('customers', id); backToCustomers(); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   💵 دفعات تسديد الفواتير
   ===================================================== */
const PAY_METHODS = ['نقد','تحويل بنكي','صك','أخرى'];
const invPayments = invId => S.payments.filter(p => p.invoice_id === invId)
  .sort((a,b) => (a.date||'').localeCompare(b.date||'') || a.id - b.id);

// المدفوع من فاتورة (مع توافقية الفواتير القديمة التي لا دفعات لها)
function paidOf(v) {
  const ps = invPayments(v.id);
  if (ps.length) return ps.reduce((s,p) => s + Number(p.amount), 0);
  return v.paid ? Number(v.total) : 0;
}
const remainOf = v => Math.max(0, Number(v.total) - paidOf(v));
function payStatus(v) {
  const rem = remainOf(v);
  if (rem <= 0.009) return { key:'paid',    label:'مسددة',        cls:'ok' };
  if (paidOf(v) > 0) return { key:'partial', label:'مسددة جزئياً', cls:'draft' };
  return { key:'unpaid', label:'آجلة', cls:'low' };
}
// مجموع الدفعات المقبوضة فعلاً ضمن فترة (للقاصة والإيرادات)
function collectedInPeriod(from, to) {
  const withPayments = new Set(S.payments.map(p => p.invoice_id));
  const fromPayments = S.payments.filter(p => inPeriod(p.date, from, to))
    .reduce((s,p) => s + Number(p.amount), 0);
  // فواتير قديمة مسددة بلا سجل دفعات
  const legacy = S.invoices.filter(v => v.paid && !withPayments.has(v.id) && inPeriod(v.date, from, to))
    .reduce((s,v) => s + Number(v.total), 0);
  return fromPayments + legacy;
}

// مزامنة حالة الفاتورة بعد أي تغيير بالدفعات
async function syncInvoicePaid(invId) {
  const v = S.invoices.find(x => x.id === invId);
  if (!v) return;
  const total = invPayments(invId).reduce((s,p) => s + Number(p.amount), 0);
  const shouldBePaid = total >= Number(v.total) - 0.009;
  if (!!v.paid !== shouldBePaid) await DB.update('invoices', invId, { paid: shouldBePaid });
}

window.paymentsForm = function(invId) {
  const v = S.invoices.find(x => x.id === invId);
  const c = custById(v.customer_id);
  const paid = paidOf(v), rem = remainOf(v);
  const st = payStatus(v);
  const ps = invPayments(invId);
  modal(`💵 تسديد الفاتورة ${esc(v.invoice_no)}`, `
    <div class="calc-box" style="font-size:15px;line-height:2">
      الزبون: <b>${esc(c?c.name:'—')}</b><br>
      مبلغ الفاتورة: <b>${money(v.total)}</b> &nbsp;|&nbsp;
      المسدد: <b style="color:var(--green)">${money(paid)}</b> &nbsp;|&nbsp;
      المتبقي: <b style="color:${rem>0?'var(--red)':'var(--green)'}">${money(rem)}</b>
      <span class="badge ${st.cls}" style="margin-right:8px">${st.label}</span>
    </div>
    ${rem > 0 ? `
    <div class="form-grid" style="margin-top:14px">
      <div class="form-row"><label>مبلغ الدفعة (${CUR}) *</label>
        <input id="p_amount" type="number" min="0" step="any" value="${rem}"></div>
      <div class="form-row"><label>التاريخ</label><input id="p_date" type="date" value="${today()}"></div>
      <div class="form-row"><label>طريقة الدفع</label>
        <select id="p_method">${PAY_METHODS.map(m=>`<option>${m}</option>`).join('')}</select></div>
      <div class="form-row"><label>ملاحظة</label><input id="p_note" placeholder="رقم الوصل / المستلم"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="savePayment(${invId})">💾 تسجيل الدفعة</button>
      <button class="btn" onclick="document.getElementById('p_amount').value='${rem}'; savePayment(${invId})">✔ تسديد كامل المتبقي</button>
      <button class="btn ghost" onclick="closeModal()">إغلاق</button>
    </div>` : `
    <div class="hint" style="margin-top:12px;color:var(--green);font-weight:900">✔ هذه الفاتورة مسددة بالكامل</div>
    <div class="form-actions"><button class="btn ghost" onclick="closeModal()">إغلاق</button></div>`}
    <h3 style="margin-top:18px">📒 سجل الدفعات (${ps.length})</h3>
    <div class="tbl-wrap"><table class="tbl">
      <tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظة</th><th></th></tr>
      ${ps.map(p => `<tr>
        <td>${esc(p.date)}</td>
        <td class="num"><b>${money(p.amount)}</b></td>
        <td>${esc(p.method||'نقد')}</td>
        <td>${esc(p.note||'')}</td>
        <td>${canEdit('sales')?`<button class="btn sm danger" onclick="delPayment(${p.id}, ${invId})">🗑️</button>`:''}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty-row">لا دفعات بعد</td></tr>'}
    </table></div>`);
};

window.savePayment = async function(invId) {
  const v = S.invoices.find(x => x.id === invId);
  const amount = Number($('#p_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغ الدفعة', 'err');
  const rem = remainOf(v);
  if (amount > rem + 0.009) return toast(`⚠️ المبلغ أكبر من المتبقي (${money(rem)})`, 'err');
  try {
    // تثبيت الفواتير القديمة المسددة قبل إضافة دفعات جديدة
    if (v.paid && !invPayments(invId).length) {
      await DB.insert('payments', { invoice_id: invId, date: v.date, amount: Number(v.total),
        method: 'نقد', note: 'تسديد سابق' });
    }
    await DB.insert('payments', { invoice_id: invId, date: $('#p_date').value || today(),
      amount, method: $('#p_method').value, note: $('#p_note').value.trim() });
    await loadAll();
    await syncInvoicePaid(invId);
    await refresh();
    const nv = S.invoices.find(x => x.id === invId);
    toast(remainOf(nv) <= 0.009 ? '✔ تم التسديد بالكامل' : `تم تسجيل الدفعة — المتبقي: ${money(remainOf(nv))}`, 'ok');
    paymentsForm(invId);
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.delPayment = async function(payId, invId) {
  if (!confirm('حذف هذه الدفعة؟')) return;
  try {
    await DB.remove('payments', payId);
    await loadAll();
    await syncInvoicePaid(invId);
    await refresh();
    toast('تم حذف الدفعة', 'ok');
    paymentsForm(invId);
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   🧾 المبيعات والفواتير
   ===================================================== */
function nextInvoiceNo() {
  const year = new Date().getFullYear();
  const count = S.invoices.filter(v => (v.invoice_no||'').includes(String(year))).length + 1;
  return `INV-${year}-${String(count).padStart(4,'0')}`;
}

function renderSales() {
  const q = ($('#saleSearch').value || '').trim();
  const rows = [...S.invoices].sort((a,b)=>b.id-a.id)
    .filter(v => {
      if (!q) return true;
      const c = custById(v.customer_id);
      return (v.invoice_no||'').includes(q) || (c && c.name.includes(q));
    })
    .map(v => {
      const c = custById(v.customer_id);
      const m = v.mixture_id ? mixById(v.mixture_id) : null;
      const veh = v.vehicle_id ? S.vehicles.find(x=>x.id===v.vehicle_id) : null;
      const deliv = [v.delivery_location, veh ? '🚚 '+veh.name : ''].filter(Boolean).join('<br>');
      return `<tr>
        <td><b>${esc(v.invoice_no)}</b></td>
        <td>${esc(v.date)}</td>
        <td>${esc(c?c.name:'—')}</td>
        <td>${m?esc(m.name):'—'}</td>
        <td>${deliv || '—'}</td>
        <td class="num">${fmt(v.qty)}</td>
        <td class="num">${money(v.cost)}</td>
        <td class="num">${fmt(v.margin_pct)}%</td>
        <td class="num"><b>${money(v.total)}</b></td>
        <td>${(() => {
          const st = payStatus(v), pd = paidOf(v), rem = remainOf(v);
          return `<span class="badge ${st.cls}">${st.label}</span>
            ${st.key!=='paid' ? `<div class="hint">مسدد ${fmt(pd)} — متبقي <b style="color:var(--red)">${fmt(rem)}</b></div>` : ''}`;
        })()}</td>
        <td><div class="actions">
          <button class="btn sm primary" onclick="receiptForm(${v.id})">📄 وصل</button>
          <button class="btn sm" onclick="printInvoice(${v.id})">🖨️ فاتورة</button>
          ${canEdit('sales') ? `<button class="btn sm ${remainOf(v)>0?'primary':''}" onclick="paymentsForm(${v.id})">💵 دفعات</button>
          <button class="btn sm" onclick="saleForm(${v.id})">✏️</button>
          <button class="btn sm danger" onclick="delInvoice(${v.id})">🗑️</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  $('#saleTable').innerHTML = `
    <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الزبون</th><th>الخلطة</th><th>التوصيل</th><th>الكمية</th><th>الكلفة</th><th>هامش الربح</th><th>المبلغ النهائي</th><th>الدفع</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="11" class="empty-row">لا توجد فواتير بعد</td></tr>'}`;
}
$('#saleSearch').oninput = renderSales;

window.saleForm = function(id) {
  if (!S.customers.length) return toast('أضف زبوناً أولاً', 'err');
  const v = id ? S.invoices.find(x=>x.id===id) : null;
  const executed = S.mixtures.filter(m => m.status === 'executed' || (v && m.id === v.mixture_id));
  modal(v ? `تعديل الفاتورة ${esc(v.invoice_no)}` : 'فاتورة جديدة', `
    <div class="form-grid">
      <div class="form-row"><label>رقم الفاتورة</label><input id="f_no" value="${esc(v?v.invoice_no:nextInvoiceNo())}" dir="ltr"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${esc(v?.date||today())}"></div>
    </div>
    <div class="form-row"><label>الزبون *</label>
      <select id="f_cust">${S.customers.map(c=>`<option value="${c.id}" ${v?.customer_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="form-row"><label>الخلطة (المنفذة فقط)</label>
      <select id="f_mix" onchange="saleRecalc()">
        <option value="">— بيع بدون خلطة —</option>
        ${executed.map(m=>`<option value="${m.id}" ${v?.mixture_id===m.id?'selected':''}>${esc(m.name)} (#${m.id}) — ${fmt(m.output_qty)} ${esc(m.output_unit)}</option>`).join('')}
      </select></div>
    <div class="form-grid">
      <div class="form-row"><label>الكمية المباعة</label><input id="f_qty" type="number" min="0" step="any" value="${v?.qty??''}" oninput="saleRecalc()"></div>
      <div class="form-row"><label>الكلفة (${CUR})</label><input id="f_cost" type="number" min="0" step="any" value="${v?.cost??''}" oninput="saleRecalc(true)"></div>
      <div class="form-row"><label>هامش الربح %</label><input id="f_margin" type="number" step="any" value="${v?.margin_pct??20}" oninput="saleRecalc(true)"></div>
      <div class="form-row"><label>المبلغ النهائي (${CUR})</label><input id="f_total" type="number" min="0" step="any" value="${v?.total??''}"></div>
    </div>
    <div class="calc-box" id="saleCalc">اختر خلطة لحساب الكلفة تلقائياً من المواد الخام.</div>
    <div class="form-grid" style="margin-top:12px">
      <div class="form-row"><label>🚚 العربة الناقلة</label>
        <select id="f_vehicle"><option value="">— بدون —</option>
        ${S.vehicles.map(x=>`<option value="${x.id}" ${v?.vehicle_id===x.id?'selected':''}>${esc(x.name)}${x.driver?' — '+esc(x.driver):''}</option>`).join('')}</select></div>
      <div class="form-row"><label>📍 موقع الإرسال</label><input id="f_loc" value="${esc(v?.delivery_location||'')}" placeholder="العنوان / الموقع"></div>
      <div class="form-row"><label>أجرة النقل (${CUR})</label><input id="f_dfee" type="number" min="0" step="any" value="${v?.delivery_fee??0}" oninput="saleRecalc(true)"></div>
      ${v ? `<div class="form-row"><label>حالة التسديد</label>
        <div style="padding:9px 0"><span class="badge ${payStatus(v).cls}">${payStatus(v).label}</span>
        ${remainOf(v)>0?` — متبقي <b>${money(remainOf(v))}</b>`:''}
        <button type="button" class="btn sm" style="margin-right:8px" onclick="closeModal(); paymentsForm(${v.id})">💵 إدارة الدفعات</button></div></div>`
      : `<div class="form-row"><label>المبلغ المدفوع الآن (${CUR})</label>
        <input id="f_paidnow" type="number" min="0" step="any" value="0">
        <div class="hint">اتركه صفراً للبيع الآجل — ويمكن التسديد لاحقاً على دفعات.</div></div>`}
    </div>
    <div class="form-row"><label>ملاحظات</label><input id="f_notes" value="${esc(v?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveSale(${id||0})">💾 ${v?'حفظ التعديل':'إنشاء الفاتورة'}</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
  if (v) saleRecalc(true);
};

window.saleRecalc = function(manual) {
  const mixId = Number($('#f_mix').value);
  const m = mixId ? mixById(mixId) : null;
  if (m && !manual) {
    if (!$('#f_qty').value) $('#f_qty').value = m.output_qty;
    const qty = Number($('#f_qty').value)||0;
    const unitCost = Number(m.output_qty) > 0 ? Number(m.cost)/Number(m.output_qty) : 0;
    $('#f_cost').value = (unitCost * qty).toFixed(2);
  }
  const cost = Number($('#f_cost').value)||0;
  const margin = Number($('#f_margin').value)||0;
  const dfee = Number($('#f_dfee')?.value)||0;
  const total = cost * (1 + margin/100) + dfee;
  $('#f_total').value = total.toFixed(2);
  $('#saleCalc').innerHTML = `الكلفة: <b>${money(cost)}</b> + هامش <b>${fmt(margin)}%</b>${dfee?` + نقل <b>${money(dfee)}</b>`:''} = المبلغ النهائي: <b>${money(total)}</b>`;
};

window.saveSale = async function(id) {
  const custId = Number($('#f_cust').value);
  const total = Number($('#f_total').value)||0;
  if (!custId) return toast('اختر الزبون', 'err');
  if (total <= 0) return toast('أدخل مبلغ الفاتورة', 'err');
  const data = {
    invoice_no: $('#f_no').value.trim() || nextInvoiceNo(),
    date: $('#f_date').value || today(),
    customer_id: custId,
    mixture_id: Number($('#f_mix').value) || null,
    qty: Number($('#f_qty').value)||0,
    cost: Number($('#f_cost').value)||0,
    margin_pct: Number($('#f_margin').value)||0,
    total,
    vehicle_id: Number($('#f_vehicle').value) || null,
    delivery_location: $('#f_loc').value.trim(),
    delivery_fee: Number($('#f_dfee').value)||0,
    notes: $('#f_notes').value.trim()
  };
  try {
    if (id) {
      await DB.update('invoices', id, data);
      closeModal(); toast('تم تعديل الفاتورة ✔', 'ok'); await refresh();
      await syncInvoicePaid(id);
    } else {
      const paidNow = Math.min(Number($('#f_paidnow').value)||0, total);
      const row = await DB.insert('invoices', { ...data, paid: paidNow >= total - 0.009 });
      if (paidNow > 0) {
        await DB.insert('payments', { invoice_id: row.id, date: data.date, amount: paidNow,
          method: 'نقد', note: 'دفعة عند البيع' });
      }
      closeModal();
      toast(paidNow >= total - 0.009 ? 'تم إنشاء الفاتورة مسددة ✔'
            : `تم إنشاء الفاتورة — المتبقي: ${money(total - paidNow)}`, 'ok');
      await refresh();
    }
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};


window.delInvoice = async function(id) {
  const v = S.invoices.find(x=>x.id===id);
  if (!confirm(`حذف الفاتورة ${v.invoice_no}؟`)) return;
  try { await DB.remove('invoices', id); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

// وصل تجهيز كونكريت (بدون أسعار) - بنفس شكل الوصل الورقي
window.receiptForm = function(id) {
  const v = S.invoices.find(x=>x.id===id);
  const c = custById(v.customer_id);
  const veh = v.vehicle_id ? S.vehicles.find(x=>x.id===v.vehicle_id) : null;
  const m = v.mixture_id ? mixById(v.mixture_id) : null;
  modal('📄 وصل تجهيز كونكريت (بدون أسعار)', `
    <div class="form-grid">
      <div class="form-row"><label>رقم الوصل</label><input id="rf_no" value="${esc(String(v.id))}" dir="ltr"></div>
      <div class="form-row"><label>التاريخ</label><input id="rf_date" type="date" value="${esc(v.date)}"></div>
      <div class="form-row"><label>اسم السائق</label><input id="rf_driver" value="${esc(veh?.driver||'')}"></div>
      <div class="form-row"><label>رقم الخباطة</label><input id="rf_mixer" value="${esc(veh?.name||'')}"></div>
      <div class="form-row"><label>تسلسل الخباطة</label><input id="rf_seq"></div>
      <div class="form-row"><label>كمية الكونكريت</label><input id="rf_qty" value="${esc(String(v.qty||''))}"></div>
      <div class="form-row"><label>نوع الاسمنت</label><input id="rf_cement" value="${esc(m?.name||'')}"></div>
      <div class="form-row"><label>كمية الاسمنت</label><input id="rf_cementqty"></div>
      <div class="form-row"><label>نوع المضاف</label><input id="rf_add"></div>
      <div class="form-row"><label>كمية المضاف</label><input id="rf_addqty"></div>
      <div class="form-row"><label>اسم الزبون</label><input id="rf_cust" value="${esc(c?.name||'')}"></div>
      <div class="form-row"><label>عنوان الزبون</label><input id="rf_addr" value="${esc(v.delivery_location || c?.address || '')}"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="printReceipt()">🖨️ طباعة الوصل</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};

window.printReceipt = function() {
  const g = id => esc($('#'+id).value.trim());
  $('#printArea').innerHTML = `
    <div class="receipt-print">
      <div class="rc-head">
        <div class="rc-title">
          <div class="rc-name">بوابة الخليج العربي</div>
          <div class="rc-sub">للكونكريت الجاهز</div>
          <div class="rc-phone" dir="ltr">07800002060</div>
        </div>
        <img src="assets/logo.png" class="rc-logo" alt="" onerror="this.remove()">
        <div class="rc-no">
          <div class="rc-no-box">${g('rf_no')}</div>
          <div class="rc-tag">وصل تجهيز كونكريت</div>
        </div>
      </div>
      <div class="rc-row"><span class="rc-l">التاريخ :</span><span class="rc-v" dir="ltr">${g('rf_date')}</span></div>
      <div class="rc-row"><span class="rc-l">اسم السائق :</span><span class="rc-v">${g('rf_driver')}</span></div>
      <div class="rc-row"><span class="rc-l">رقم الخباطة :</span><span class="rc-v">${g('rf_mixer')}</span></div>
      <div class="rc-row"><span class="rc-l">تسلسل الخباطة :</span><span class="rc-v">${g('rf_seq')}</span></div>
      <div class="rc-row"><span class="rc-l">كمية الكونكريت :</span><span class="rc-v">${g('rf_qty')}</span></div>
      <div class="rc-row"><span class="rc-l">نوع الاسمنت :</span><span class="rc-v">${g('rf_cement')}</span><span class="rc-l">الكمية :</span><span class="rc-v">${g('rf_cementqty')}</span></div>
      <div class="rc-row"><span class="rc-l">نوع المضاف :</span><span class="rc-v">${g('rf_add')}</span><span class="rc-l">الكمية :</span><span class="rc-v">${g('rf_addqty')}</span></div>
      <div class="rc-row"><span class="rc-l">اسم الزبون :</span><span class="rc-v">${g('rf_cust')}</span></div>
      <div class="rc-row"><span class="rc-l">عنوان الزبون :</span><span class="rc-v">${g('rf_addr')}</span></div>
      <div class="rc-sign"><span>اسم المستلم و توقيعه</span><span>الإدارة</span></div>
    </div>`;
  closeModal();
  window.print();
};

window.printInvoice = function(id) {
  const v = S.invoices.find(x=>x.id===id);
  const c = custById(v.customer_id);
  const m = v.mixture_id ? mixById(v.mixture_id) : null;
  const veh = v.vehicle_id ? S.vehicles.find(x=>x.id===v.vehicle_id) : null;
  $('#printArea').innerHTML = `
    <div class="inv-print">
      <div class="inv-head">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="assets/logo.png" alt="" style="width:85px;height:85px;object-fit:contain" onerror="this.remove()">
          <div><h1>شركة بوابة الخليج</h1><div>للكونكريت الجاهز — فاتورة مبيعات</div>
          <div style="font-size:13px">📞 <span dir="ltr">078000002060</span></div></div>
        </div>
        <div class="inv-meta">
          <b>رقم الفاتورة:</b> ${esc(v.invoice_no)}<br>
          <b>التاريخ:</b> ${esc(v.date)}
        </div>
      </div>
      <div class="inv-meta">
        <b>الزبون:</b> ${esc(c?c.name:'—')}<br>
        ${c&&c.phone?`<b>الهاتف:</b> <span dir="ltr">${esc(c.phone)}</span><br>`:''}
        ${c&&c.address?`<b>العنوان:</b> ${esc(c.address)}<br>`:''}
        ${v.delivery_location?`<b>📍 موقع الإرسال:</b> ${esc(v.delivery_location)}<br>`:''}
        ${veh?`<b>🚚 العربة الناقلة:</b> ${esc(veh.name)}${veh.driver?' — السائق: '+esc(veh.driver):''}<br>`:''}
      </div>
      <table>
        <tr><th>البيان</th><th>الكمية</th><th>الكلفة</th><th>هامش الربح</th><th>أجرة النقل</th><th>المبلغ</th></tr>
        <tr>
          <td>${m?esc(m.name):'بيع مباشر'}</td>
          <td>${fmt(v.qty)} ${m?esc(m.output_unit):''}</td>
          <td>${money(v.cost)}</td>
          <td>${fmt(v.margin_pct)}%</td>
          <td>${money(v.delivery_fee||0)}</td>
          <td>${money(v.total)}</td>
        </tr>
      </table>
      <div class="inv-total">المبلغ النهائي: ${money(v.total)} — ${payStatus(v).label}
        ${remainOf(v)>0?`<div style="font-size:15px">المسدد: ${money(paidOf(v))} — المتبقي: ${money(remainOf(v))}</div>`:''}</div>
      ${invPayments(v.id).length ? `<table style="margin-top:10px">
        <tr><th>تاريخ الدفعة</th><th>المبلغ</th><th>الطريقة</th></tr>
        ${invPayments(v.id).map(p=>`<tr><td>${esc(p.date)}</td><td>${money(p.amount)}</td><td>${esc(p.method||'نقد')}</td></tr>`).join('')}
      </table>` : ''}
      ${v.notes?`<p><b>ملاحظات:</b> ${esc(v.notes)}</p>`:''}
      <p style="margin-top:30px; font-size:13px">التوقيع: ______________________</p>
    </div>`;
  window.print();
};

/* =====================================================
   💰 المصروفات
   ===================================================== */
const EXP_CATS = ['رواتب','كهرباء','نقل','صيانة','وقود','إيجار','أخرى'];

function renderExpenses() {
  const month = today().slice(0,7);
  const monthTotal = S.expenses.filter(e=>(e.date||'').startsWith(month)).reduce((s,e)=>s+Number(e.amount),0);
  const allTotal = S.expenses.reduce((s,e)=>s+Number(e.amount),0);
  $('#expCards').innerHTML = `
    <div class="card red"><div class="c-label">مصاريف هذا الشهر</div><div class="c-value">${money(monthTotal)}</div></div>
    <div class="card"><div class="c-label">إجمالي المصاريف</div><div class="c-value">${money(allTotal)}</div></div>`;
  const rows = [...S.expenses].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id)
    .map(e => `<tr>
      <td>${esc(e.date)}</td>
      <td><span class="badge draft">${esc(e.category)}</span></td>
      <td class="num">${money(e.amount)}</td>
      <td>${esc(e.note||'')}</td>
      <td>${canEdit('expenses') ? `<div class="actions">
        <button class="btn sm" onclick="expenseForm(${e.id})">✏️</button>
        <button class="btn sm danger" onclick="delExpense(${e.id})">🗑️</button></div>` : ''}</td>
    </tr>`).join('');
  $('#expTable').innerHTML = `
    <tr><th>التاريخ</th><th>الفئة</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr>
    ${rows || '<tr><td colspan="5" class="empty-row">لا توجد مصاريف مسجلة</td></tr>'}`;
}

window.expenseForm = function(id) {
  const ex = id ? S.expenses.find(x=>x.id===id) : null;
  modal(ex ? 'تعديل مصروف' : 'مصروف جديد', `
    <div class="form-grid">
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${esc(ex?.date||today())}"></div>
      <div class="form-row"><label>الفئة</label>
        <select id="f_cat">${EXP_CATS.map(c=>`<option ${ex?.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="form-row"><label>المبلغ (${CUR}) *</label><input id="f_amount" type="number" min="0" step="any" value="${ex?.amount??''}"></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note" value="${esc(ex?.note||'')}"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveExpense(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveExpense = async function(id) {
  const amount = Number($('#f_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  const data = { date: $('#f_date').value||today(), category: $('#f_cat').value, amount, note: $('#f_note').value.trim() };
  try {
    if (id) await DB.update('expenses', id, data);
    else await DB.insert('expenses', data);
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delExpense = async function(id) {
  if (!confirm('حذف هذا المصروف؟')) return;
  try { await DB.remove('expenses', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   🚚 النقل والعربات
   ===================================================== */
function renderVehicles() {
  const ce = canEdit('vehicles');
  const rows = S.vehicles.map(v => {
    const trips = S.invoices.filter(i => i.vehicle_id === v.id).length;
    return `<tr>
      <td><b>🚚 ${esc(v.name)}</b></td>
      <td>${esc(v.driver||'—')}</td>
      <td dir="ltr" style="text-align:right">${esc(v.phone||'—')}</td>
      <td class="num">${trips}</td>
      <td>${esc(v.notes||'')}</td>
      <td>${ce ? `<div class="actions">
        <button class="btn sm" onclick="vehicleForm(${v.id})">✏️</button>
        <button class="btn sm danger" onclick="delVehicle(${v.id})">🗑️</button></div>` : ''}</td>
    </tr>`;
  }).join('');
  $('#vehTable').innerHTML = `
    <tr><th>العربة</th><th>السائق</th><th>الهاتف</th><th>عدد التوصيلات</th><th>ملاحظات</th><th></th></tr>
    ${rows || '<tr><td colspan="6" class="empty-row">لا توجد عربات مسجلة</td></tr>'}`;

  const delivs = [...S.invoices].filter(i => i.vehicle_id || i.delivery_location)
    .sort((a,b)=>b.id-a.id).slice(0,30)
    .map(i => {
      const veh = S.vehicles.find(x=>x.id===i.vehicle_id);
      const c = custById(i.customer_id);
      const m = i.mixture_id ? mixById(i.mixture_id) : null;
      return `<tr>
        <td>${esc(i.date)}</td>
        <td>${esc(i.invoice_no)}</td>
        <td>${veh?esc(veh.name):'—'}</td>
        <td>${esc(c?c.name:'—')}</td>
        <td>${m?esc(m.name):'—'}</td>
        <td>📍 ${esc(i.delivery_location||'—')}</td>
        <td class="num">${money(i.delivery_fee||0)}</td>
      </tr>`;
    }).join('');
  $('#delivTable').innerHTML = `
    <tr><th>التاريخ</th><th>الفاتورة</th><th>العربة</th><th>الزبون</th><th>الخلطة</th><th>موقع الإرسال</th><th>أجرة النقل</th></tr>
    ${delivs || '<tr><td colspan="7" class="empty-row">لا توجد توصيلات بعد</td></tr>'}`;
}

window.vehicleForm = function(id) {
  const v = id ? S.vehicles.find(x=>x.id===id) : null;
  modal(v ? 'تعديل عربة' : 'عربة جديدة', `
    <div class="form-grid">
      <div class="form-row"><label>اسم / رقم العربة *</label><input id="f_name" value="${esc(v?.name||'')}" placeholder="قلاب 1 / رقم اللوحة"></div>
      <div class="form-row"><label>اسم السائق</label><input id="f_driver" value="${esc(v?.driver||'')}"></div>
      <div class="form-row"><label>هاتف السائق</label><input id="f_phone" dir="ltr" value="${esc(v?.phone||'')}"></div>
      <div class="form-row"><label>ملاحظات</label><input id="f_notes" value="${esc(v?.notes||'')}"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveVehicle(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveVehicle = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم العربة مطلوب', 'err');
  const data = { name, driver: $('#f_driver').value.trim(), phone: $('#f_phone').value.trim(), notes: $('#f_notes').value.trim() };
  try {
    if (id) await DB.update('vehicles', id, data); else await DB.insert('vehicles', data);
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delVehicle = async function(id) {
  if (S.invoices.some(i => i.vehicle_id === id)) return toast('لا يمكن حذف عربة مرتبطة بفواتير', 'err');
  if (!confirm('حذف هذه العربة؟')) return;
  try { await DB.remove('vehicles', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   👷 الموظفون والرواتب
   ===================================================== */
function salariesTotal(from, to) {
  return S.salaries.filter(s => (!from && !to) || inRange(s.date, from, to))
    .reduce((sum,s)=>sum+Number(s.amount),0);
}

function renderEmployees() {
  const ce = canEdit('employees');
  const month = today().slice(0,7);
  const monthPaid = S.salaries.filter(s=>(s.month||s.date||'').startsWith(month)).reduce((x,s)=>x+Number(s.amount),0);
  const expectedMonthly = S.employees.filter(e=>e.active!==false).reduce((x,e)=>x+Number(e.base_salary),0);
  $('#empCards').innerHTML = `
    <div class="card blue"><div class="c-label">عدد الموظفين</div><div class="c-value">${S.employees.filter(e=>e.active!==false).length}</div></div>
    <div class="card amber"><div class="c-label">الرواتب الشهرية المتوقعة</div><div class="c-value">${money(expectedMonthly)}</div></div>
    <div class="card red"><div class="c-label">المدفوع هذا الشهر</div><div class="c-value">${money(monthPaid)}</div></div>
    <div class="card"><div class="c-label">إجمالي الرواتب المدفوعة</div><div class="c-value">${money(salariesTotal())}</div></div>`;

  const rows = S.employees.map(e => {
    const paid = S.salaries.filter(s=>s.employee_id===e.id).reduce((x,s)=>x+Number(s.amount),0);
    return `<tr>
      <td><b>${esc(e.name)}</b>${e.active===false?' <span class="badge low">موقوف</span>':''}</td>
      <td>${esc(e.title||'—')}</td>
      <td dir="ltr" style="text-align:right">${esc(e.phone||'—')}</td>
      <td class="num">${money(e.base_salary)}</td>
      <td class="num">${money(paid)}</td>
      <td>${ce ? `<div class="actions">
        <button class="btn sm primary" onclick="payForm(${e.id})">💵 دفع راتب</button>
        <button class="btn sm" onclick="employeeForm(${e.id})">✏️</button>
        <button class="btn sm danger" onclick="delEmployee(${e.id})">🗑️</button></div>` : ''}</td>
    </tr>`;
  }).join('');
  $('#empTable').innerHTML = `
    <tr><th>الموظف</th><th>الوظيفة</th><th>الهاتف</th><th>الراتب الأساسي</th><th>إجمالي المدفوع له</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="6" class="empty-row">لا يوجد موظفون بعد</td></tr>'}`;

  const sal = [...S.salaries].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id).slice(0,30)
    .map(s => {
      const e = S.employees.find(x=>x.id===s.employee_id);
      return `<tr>
        <td>${esc(s.date)}</td>
        <td>${esc(e?e.name:'—')}</td>
        <td>${esc(s.month||'—')}</td>
        <td class="num">${money(s.amount)}</td>
        <td>${esc(s.note||'')}</td>
        <td>${ce ? `<div class="actions">
          <button class="btn sm" onclick="salaryForm(${s.id})">✏️</button>
          <button class="btn sm danger" onclick="delSalary(${s.id})">🗑️</button></div>` : ''}</td>
      </tr>`;
    }).join('');
  $('#salTable').innerHTML = `
    <tr><th>تاريخ الدفع</th><th>الموظف</th><th>عن شهر</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr>
    ${sal || '<tr><td colspan="6" class="empty-row">لا توجد رواتب مدفوعة</td></tr>'}`;
}

window.employeeForm = function(id) {
  const e = id ? S.employees.find(x=>x.id===id) : null;
  modal(e ? 'تعديل موظف' : 'موظف جديد', `
    <div class="form-grid">
      <div class="form-row"><label>الاسم *</label><input id="f_name" value="${esc(e?.name||'')}"></div>
      <div class="form-row"><label>الوظيفة</label><input id="f_title" value="${esc(e?.title||'')}" placeholder="عامل خلط / سائق..."></div>
      <div class="form-row"><label>الهاتف</label><input id="f_phone" dir="ltr" value="${esc(e?.phone||'')}"></div>
      <div class="form-row"><label>الراتب الأساسي (${CUR})</label><input id="f_salary" type="number" min="0" step="any" value="${e?.base_salary??''}"></div>
      ${e?`<div class="form-row"><label>الحالة</label><select id="f_active"><option value="1" ${e.active!==false?'selected':''}>يعمل</option><option value="0" ${e.active===false?'selected':''}>موقوف</option></select></div>`:''}
    </div>
    <div class="form-row"><label>ملاحظات</label><input id="f_notes" value="${esc(e?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveEmployee(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveEmployee = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم الموظف مطلوب', 'err');
  const data = { name, title: $('#f_title').value.trim(), phone: $('#f_phone').value.trim(),
    base_salary: Number($('#f_salary').value)||0, notes: $('#f_notes').value.trim() };
  if (id) data.active = $('#f_active').value === '1';
  try {
    if (id) await DB.update('employees', id, data); else await DB.insert('employees', {...data, active:true});
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.payForm = function(empId) {
  const e = S.employees.find(x=>x.id===empId);
  modal(`دفع راتب: ${esc(e.name)}`, `
    <div class="form-grid">
      <div class="form-row"><label>المبلغ (${CUR}) *</label><input id="f_amount" type="number" min="0" step="any" value="${e.base_salary}"></div>
      <div class="form-row"><label>عن شهر</label><input id="f_month" type="month" value="${today().slice(0,7)}"></div>
      <div class="form-row"><label>تاريخ الدفع</label><input id="f_date" type="date" value="${today()}"></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note" placeholder="سلفة، مكافأة..."></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="savePay(${empId})">💾 تسجيل الدفع</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.savePay = async function(empId) {
  const amount = Number($('#f_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  try {
    await DB.insert('salaries', { employee_id: empId, amount, month: $('#f_month').value,
      date: $('#f_date').value || today(), note: $('#f_note').value.trim() });
    closeModal(); toast('تم تسجيل الراتب ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.salaryForm = function(id) {
  const s = S.salaries.find(x=>x.id===id);
  const e = S.employees.find(x=>x.id===s.employee_id);
  modal(`تعديل راتب: ${esc(e?e.name:'')}`, `
    <div class="form-grid">
      <div class="form-row"><label>المبلغ (${CUR}) *</label><input id="f_amount" type="number" min="0" step="any" value="${s.amount}"></div>
      <div class="form-row"><label>عن شهر</label><input id="f_month" type="month" value="${esc(s.month||'')}"></div>
      <div class="form-row"><label>تاريخ الدفع</label><input id="f_date" type="date" value="${esc(s.date)}"></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note" value="${esc(s.note||'')}"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveSalaryEdit(${id})">💾 حفظ التعديل</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveSalaryEdit = async function(id) {
  const amount = Number($('#f_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  try {
    await DB.update('salaries', id, { amount, month: $('#f_month').value, date: $('#f_date').value, note: $('#f_note').value.trim() });
    closeModal(); toast('تم التعديل ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delSalary = async function(id) {
  if (!confirm('حذف سجل الراتب هذا؟')) return;
  try { await DB.remove('salaries', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delEmployee = async function(id) {
  const e = S.employees.find(x=>x.id===id);
  if (!confirm(`حذف الموظف "${e.name}" وسجل رواتبه؟`)) return;
  try { await DB.remove('employees', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   🤝 الشركاء والأرباح (للمالك فقط)
   ===================================================== */
function netProfit(from, to) {
  const invs = S.invoices.filter(v => (!from && !to) || inRange(v.date, from, to));
  const sales = invs.reduce((s,v)=>s+Number(v.total),0);
  const cogs = invs.reduce((s,v)=>s+Number(v.cost),0);
  const dfees = invs.reduce((s,v)=>s+Number(v.delivery_fee||0),0);
  const exps = S.expenses.filter(e => (!from && !to) || inRange(e.date, from, to)).reduce((s,e)=>s+Number(e.amount),0);
  const sals = salariesTotal(from, to);
  const otherRev = S.revenues.filter(r => (!from && !to) || inRange(r.date, from, to)).reduce((s,r)=>s+Number(r.amount),0);
  return { sales, cogs, exps, sals, dfees, otherRev, profit: sales + otherRev - cogs - exps - sals };
}

function renderPartners() {
  const from = $('#parFrom').value, to = $('#parTo').value;
  const np = netProfit(from, to);
  const totalPct = S.partners.reduce((s,p)=>s+Number(p.share_pct),0);
  const totalWd = S.partner_withdrawals.reduce((s,w)=>s+Number(w.amount),0);

  $('#parCards').innerHTML = `
    <div class="card ${np.profit>=0?'green':'red'}"><div class="c-label">💰 صافي الربح ${from||to?'(للفترة)':'الكلي'}</div><div class="c-value">${money(np.profit)}</div>
      <div class="c-sub">مبيعات ${fmt(np.sales)}${np.otherRev?` + إيرادات ${fmt(np.otherRev)}`:''} − مواد ${fmt(np.cogs)} − مصاريف ${fmt(np.exps)} − رواتب ${fmt(np.sals)}</div></div>
    <div class="card blue"><div class="c-label">عدد الشركاء</div><div class="c-value">${S.partners.length}</div>
      <div class="c-sub">${totalPct !== 100 && S.partners.length ? `⚠️ مجموع النسب ${fmt(totalPct)}% (يفضل 100%)` : 'مجموع النسب 100% ✔'}</div></div>
    <div class="card amber"><div class="c-label">إجمالي السحوبات</div><div class="c-value">${money(totalWd)}</div></div>`;

  const rows = S.partners.map(p => {
    const share = np.profit * Number(p.share_pct) / 100;
    const wd = S.partner_withdrawals.filter(w=>w.partner_id===p.id).reduce((s,w)=>s+Number(w.amount),0);
    const remain = share - wd;
    return `<tr>
      <td><b>${esc(p.name)}</b></td>
      <td dir="ltr" style="text-align:right">${esc(p.phone||'—')}</td>
      <td class="num">${fmt(p.share_pct)}%</td>
      <td class="num">${money(share)}</td>
      <td class="num">${money(wd)}</td>
      <td class="num" style="color:${remain>=0?'var(--green)':'var(--red)'}"><b>${money(remain)}</b></td>
      <td><div class="actions">
        <button class="btn sm primary" onclick="withdrawForm(${p.id})">💸 سحب</button>
        <button class="btn sm" onclick="partnerForm(${p.id})">✏️</button>
        <button class="btn sm danger" onclick="delPartner(${p.id})">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
  $('#parTable').innerHTML = `
    <tr><th>الشريك</th><th>الهاتف</th><th>نسبة الشراكة</th><th>حصته من الربح</th><th>سحوباته</th><th>المتبقي له</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="7" class="empty-row">لا يوجد شركاء — أضف الشركاء ونسبهم</td></tr>'}`;

  const wds = [...S.partner_withdrawals].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id).slice(0,30)
    .map(w => {
      const p = S.partners.find(x=>x.id===w.partner_id);
      return `<tr><td>${esc(w.date)}</td><td>${esc(p?p.name:'—')}</td>
        <td class="num">${money(w.amount)}</td><td>${esc(w.note||'')}</td>
        <td><div class="actions">
          <button class="btn sm" onclick="withdrawEditForm(${w.id})">✏️</button>
          <button class="btn sm danger" onclick="delWithdrawal(${w.id})">🗑️</button></div></td></tr>`;
    }).join('');
  $('#pwTable').innerHTML = `
    <tr><th>التاريخ</th><th>الشريك</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr>
    ${wds || '<tr><td colspan="5" class="empty-row">لا توجد سحوبات</td></tr>'}`;
}

window.partnerForm = function(id) {
  const p = id ? S.partners.find(x=>x.id===id) : null;
  modal(p ? 'تعديل شريك' : 'شريك جديد', `
    <div class="form-grid">
      <div class="form-row"><label>اسم الشريك *</label><input id="f_name" value="${esc(p?.name||'')}"></div>
      <div class="form-row"><label>نسبة الشراكة % *</label><input id="f_pct" type="number" min="0" max="100" step="any" value="${p?.share_pct??''}"></div>
      <div class="form-row"><label>الهاتف</label><input id="f_phone" dir="ltr" value="${esc(p?.phone||'')}"></div>
      <div class="form-row"><label>ملاحظات</label><input id="f_notes" value="${esc(p?.notes||'')}"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="savePartner(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.savePartner = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('اسم الشريك مطلوب', 'err');
  const dup = S.partners.find(p => p.name === name && p.id !== id);
  if (dup) return toast('⚠️ شريك بنفس الاسم موجود', 'err');
  const data = { name, share_pct: Number($('#f_pct').value)||0, phone: $('#f_phone').value.trim(), notes: $('#f_notes').value.trim() };
  try {
    if (id) await DB.update('partners', id, data); else await DB.insert('partners', data);
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.withdrawForm = function(partnerId) {
  const p = S.partners.find(x=>x.id===partnerId);
  modal(`سحب أرباح: ${esc(p.name)}`, `
    <div class="form-grid">
      <div class="form-row"><label>المبلغ (${CUR}) *</label><input id="f_amount" type="number" min="0" step="any"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${today()}"></div>
    </div>
    <div class="form-row"><label>ملاحظة</label><input id="f_note"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveWithdrawal(${partnerId})">💾 تسجيل السحب</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveWithdrawal = async function(partnerId) {
  const amount = Number($('#f_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  try {
    await DB.insert('partner_withdrawals', { partner_id: partnerId, amount, date: $('#f_date').value||today(), note: $('#f_note').value.trim() });
    closeModal(); toast('تم تسجيل السحب ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.withdrawEditForm = function(id) {
  const w = S.partner_withdrawals.find(x=>x.id===id);
  const p = S.partners.find(x=>x.id===w.partner_id);
  modal(`تعديل سحب: ${esc(p?p.name:'')}`, `
    <div class="form-grid">
      <div class="form-row"><label>المبلغ (${CUR}) *</label><input id="f_amount" type="number" min="0" step="any" value="${w.amount}"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${esc(w.date)}"></div>
    </div>
    <div class="form-row"><label>ملاحظة</label><input id="f_note" value="${esc(w.note||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveWithdrawEdit(${id})">💾 حفظ التعديل</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveWithdrawEdit = async function(id) {
  const amount = Number($('#f_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  try {
    await DB.update('partner_withdrawals', id, { amount, date: $('#f_date').value, note: $('#f_note').value.trim() });
    closeModal(); toast('تم التعديل ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delWithdrawal = async function(id) {
  if (!confirm('حذف هذا السحب؟')) return;
  try { await DB.remove('partner_withdrawals', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delPartner = async function(id) {
  const p = S.partners.find(x=>x.id===id);
  if (!confirm(`حذف الشريك "${p.name}" وكل سحوباته؟`)) return;
  try { await DB.remove('partners', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};
$('#parApply').onclick = renderPartners;

/* =====================================================
   👤 المستخدمون والصلاحيات (للمالك فقط)
   ===================================================== */
function renderUsers() {
  $('#rolesHelp').innerHTML = `
    <table class="tbl">
      <tr><th>الدور</th><th>الصلاحيات</th></tr>
      <tr><td>👑 المالك</td><td>كل شيء — وحصرياً: الشركاء والأرباح، سجل الحركات، إدارة الحسابات، الإعدادات</td></tr>
      <tr><td>📋 المدير</td><td>عمل كامل في كل الأقسام التشغيلية: مواد، خلطات، مبيعات، زبائن، مصاريف، رواتب، نقل</td></tr>
      <tr><td>🧮 المحاسب</td><td>عمل كامل في كل الأقسام التشغيلية: مواد، خلطات، مبيعات، زبائن، مصاريف، رواتب، نقل</td></tr>
    </table>`;
  if (DB.backend !== 'supabase') {
    $('#userTable').innerHTML = '<tr><td class="empty-row">⚠️ إدارة الحسابات تعمل فقط عند الاتصال بقاعدة البيانات السحابية</td></tr>';
    return;
  }
  const rows = S.profiles.map(p => `<tr>
    <td><b>${esc(p.name)}</b>${p.id===USER?.id?' <span class="badge done">أنت</span>':''}</td>
    <td>${ROLE_NAMES[p.role]||esc(p.role)}</td>
    <td><span class="badge ${p.active?'ok':'low'}">${p.active?'مفعّل':'موقوف'}</span></td>
    <td>${esc((p.created_at||'').slice(0,10))}</td>
    <td><div class="actions">
      <button class="btn sm" onclick="userNameForm('${p.id}')">✏️ الاسم</button>
      <button class="btn sm" onclick="passwordForm('${p.id}')">🔑 كلمة المرور</button>
      ${p.id!==USER?.id ? `
      <button class="btn sm" onclick="toggleUser('${p.id}', ${p.active})">${p.active?'⏸️ إيقاف':'▶️ تفعيل'}</button>
      <button class="btn sm" onclick="userRoleForm('${p.id}')">🔁 الدور</button>
      <button class="btn sm danger" onclick="delUser('${p.id}')">🗑️ حذف</button>` : ''}
    </div></td>
  </tr>`).join('');
  $('#userTable').innerHTML = `
    <tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="5" class="empty-row">لا توجد حسابات</td></tr>'}`;
}

window.userForm = function() {
  if (DB.backend !== 'supabase') return toast('إنشاء الحسابات يتطلب الاتصال بقاعدة البيانات السحابية', 'err');
  modal('حساب جديد', `
    <div class="form-grid">
      <div class="form-row"><label>الاسم الظاهر *</label><input id="f_name" placeholder="اسم الموظف"></div>
      <div class="form-row"><label>اسم المستخدم *</label><input id="f_user" dir="ltr" placeholder="ali أو بريد إلكتروني">
        <div class="hint">إن لم يكن بريداً سيصبح: name@factory.local</div></div>
      <div class="form-row"><label>كلمة المرور * (6 أحرف فأكثر)</label><input id="f_pass" type="text" dir="ltr"></div>
      <div class="form-row"><label>الدور</label>
        <select id="f_role">
          <option value="accountant">🧮 محاسب</option>
          <option value="manager">📋 مدير</option>
          <option value="owner">👑 مالك</option>
        </select></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveUser()">💾 إنشاء الحساب</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveUser = async function() {
  const name = $('#f_name').value.trim();
  let username = $('#f_user').value.trim().toLowerCase();
  const pass = $('#f_pass').value;
  if (!name || !username) return toast('الاسم واسم المستخدم مطلوبان', 'err');
  if (pass.length < 6) return toast('كلمة المرور 6 أحرف على الأقل', 'err');
  if (!username.includes('@') && !/^[a-z0-9._-]+$/.test(username))
    return toast('✖ اسم المستخدم بأحرف إنجليزية فقط (مثل ali)', 'err');
  const email = username.includes('@') ? username : `${username}@factory.local`;
  try {
    const newUser = await DB.createUser(email, pass);
    await DB.insert('profiles', { id: newUser.id, name, role: $('#f_role').value, active: true });
    closeModal(); toast(`✔ تم إنشاء الحساب — الدخول بـ: ${email}`, 'ok'); await refresh();
  } catch(e) { toast('خطأ: ' + sbErrorAr(e.message), 'err'); }
};
window.toggleUser = async function(id, active) {
  try { await DB.update('profiles', id, { active: !active }); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.userRoleForm = function(id) {
  const p = S.profiles.find(x=>x.id===id);
  modal(`تغيير دور: ${esc(p.name)}`, `
    <div class="form-row"><label>الدور الجديد</label>
      <select id="f_role">
        <option value="accountant" ${p.role==='accountant'?'selected':''}>🧮 محاسب</option>
        <option value="manager" ${p.role==='manager'?'selected':''}>📋 مدير</option>
        <option value="owner" ${p.role==='owner'?'selected':''}>👑 مالك</option>
      </select></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveUserRole('${id}')">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveUserRole = async function(id) {
  try { await DB.update('profiles', id, { role: $('#f_role').value }); closeModal(); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.userNameForm = function(id) {
  const p = S.profiles.find(x=>x.id===id);
  modal('تعديل الاسم الظاهر', `
    <div class="form-row"><label>الاسم</label><input id="f_name" value="${esc(p.name)}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveUserName('${id}')">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveUserName = async function(id) {
  const name = $('#f_name').value.trim();
  if (!name) return toast('الاسم مطلوب', 'err');
  try { await DB.update('profiles', id, { name }); closeModal(); toast('تم التعديل ✔', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};
// إظهار / إخفاء كلمة المرور
window.togglePass = function(inputId, btn) {
  const inp = document.getElementById(inputId);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.classList.toggle('on', show);
  btn.textContent = show ? '🙈' : '👁';
};

// تغيير كلمة المرور (لنفسي أو لمستخدم آخر - للمالك)
window.passwordForm = function(id) {
  const p = S.profiles.find(x=>x.id===id);
  const isSelf = id === USER?.id;
  modal(`🔑 كلمة مرور جديدة: ${esc(p.name)}${isSelf?' (أنت)':''}`, `
    <div class="form-row"><label>كلمة المرور الجديدة (6 أحرف فأكثر)</label>
      <div class="pass-wrap">
        <input id="f_newpass" type="password" dir="ltr">
        <button type="button" class="eye-btn" onclick="togglePass('f_newpass', this)">👁</button>
      </div></div>
    ${isSelf ? '<div class="hint">ستبقى جلستك الحالية مفتوحة، وتستخدم الكلمة الجديدة في الدخول القادم.</div>'
             : `<div class="hint">بلّغ ${esc(p.name)} بالكلمة الجديدة شفهياً — جلساته المفتوحة تبقى تعمل حتى يسجل خروجاً.</div>`}
    <div class="form-actions">
      <button class="btn primary" onclick="savePassword('${id}', ${isSelf})">💾 تغيير كلمة المرور</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.savePassword = async function(id, isSelf) {
  const pass = $('#f_newpass').value;
  if (pass.length < 6) return toast('كلمة المرور 6 أحرف على الأقل', 'err');
  try {
    if (isSelf) await DB.changeMyPassword(pass);
    else await DB.adminSetPassword(id, pass);
    closeModal(); toast('✔ تم تغيير كلمة المرور', 'ok');
  } catch(e) { toast('خطأ: ' + sbErrorAr(e.message), 'err'); }
};

window.delUser = async function(id) {
  const p = S.profiles.find(x=>x.id===id);
  if (p.role === 'owner' && S.profiles.filter(x=>x.role==='owner' && x.active).length <= 1)
    return toast('لا يمكن حذف المالك الوحيد في النظام', 'err');
  if (!confirm(`حذف حساب "${p.name}"؟\nلن يستطيع الدخول للنظام نهائياً بعد الحذف.`)) return;
  try {
    await DB.remove('profiles', id);
    toast('✔ تم حذف الحساب ومُنع من الدخول', 'ok');
    await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   🕵️ سجل الحركات (للمالك فقط)
   ===================================================== */
const AUDIT_TABLES = {
  materials:'المواد الخام', movements:'حركات المخزون', customers:'الزبائن',
  mixtures:'الخلطات', mixture_items:'مكونات الخلطات', invoices:'الفواتير',
  expenses:'المصاريف', vehicles:'العربات', partners:'الشركاء',
  partner_withdrawals:'سحوبات الشركاء', employees:'الموظفون', salaries:'الرواتب', profiles:'حسابات الدخول',
  recipes:'الخلطات الجاهزة', recipe_items:'مكونات الخلطات الجاهزة',
  suppliers:'الموردون', supplier_vehicles:'عربات الموردين',
  revenues:'الإيرادات', cash_counts:'جرد القاصة', app_settings:'إعدادات النظام'
};
const AUDIT_ACTIONS = {
  insert:['➕ إضافة','ok'], update:['✏️ تعديل','draft'], delete:['🗑️ حذف','low']
};
const AUDIT_FIELDS = {
  name:'الاسم', qty:'الكمية', unit_price:'سعر الوحدة', price:'السعر', min_qty:'حد التنبيه',
  amount:'المبلغ', total:'المبلغ النهائي', cost:'الكلفة', margin_pct:'هامش الربح',
  paid:'الدفع', date:'التاريخ', note:'الملاحظة', notes:'الملاحظات', phone:'الهاتف',
  address:'العنوان', status:'الحالة', output_qty:'كمية المنتج', share_pct:'نسبة الشراكة',
  base_salary:'الراتب الأساسي', delivery_fee:'أجرة النقل', delivery_location:'موقع الإرسال',
  invoice_no:'رقم الفاتورة', category:'الفئة', role:'الدور', active:'مفعّل', driver:'السائق',
  title:'الوظيفة', month:'الشهر', unit:'الوحدة', customer_id:'الزبون', vehicle_id:'العربة',
  material_id:'المادة', mixture_id:'الخلطة', employee_id:'الموظف', partner_id:'الشريك',
  supplier_id:'المورد', supplier_vehicle_id:'عربة المورد', doc_no:'رقم الوصل',
  qty_per_unit:'الكمية لكل وحدة', recipe_id:'الخلطة الجاهزة', capacity:'الحمولة', material_types:'المواد المورّدة'
};

function auditValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'نعم';
  if (v === false) return 'لا';
  if (typeof v === 'number') return fmt(v);
  return String(v).length > 40 ? String(v).slice(0,40)+'…' : String(v);
}

// وصف مختصر للسجل: اسم العنصر + أهم التغييرات
function auditDesc(row) {
  const d = row.new_data || row.old_data || {};
  const label = d.name || d.invoice_no || d.category || (d.qty !== undefined ? `كمية ${fmt(d.qty)}` : '') || `#${row.record_id}`;
  if (row.action !== 'update') {
    const amt = d.total ?? d.amount ?? d.unit_price;
    return `<b>${esc(auditValue(label))}</b>${amt !== undefined && amt !== null ? ` — ${money(amt)}` : ''}`;
  }
  // للتعديل: عرض الحقول المتغيرة (قديم ← جديد)
  const oldD = row.old_data || {}, newD = row.new_data || {};
  const skip = new Set(['created_at','id']);
  const changes = [];
  for (const k of Object.keys(newD)) {
    if (skip.has(k)) continue;
    if (JSON.stringify(oldD[k]) !== JSON.stringify(newD[k])) {
      changes.push(`${AUDIT_FIELDS[k]||k}: ${esc(auditValue(oldD[k]))} ← <b>${esc(auditValue(newD[k]))}</b>`);
    }
    if (changes.length >= 3) break;
  }
  return `<b>${esc(auditValue(label))}</b>${changes.length ? '<div class="hint">'+changes.join(' • ')+'</div>' : ''}`;
}

let AUDIT_ROWS = [];
async function renderAudit() {
  if (DB.backend !== 'supabase') {
    $('#auditTable').innerHTML = '<tr><td class="empty-row">⚠️ سجل الحركات يعمل فقط عند الاتصال بقاعدة البيانات السحابية</td></tr>';
    return;
  }
  try { AUDIT_ROWS = await DB.listAudit(500); }
  catch(e) {
    $('#auditTable').innerHTML = `<tr><td class="empty-row">تعذر جلب السجل: ${esc(sbErrorAr(e.message))}</td></tr>`;
    return;
  }
  // تعبئة الفلاتر
  const tSel = $('#audTable'), uSel = $('#audUser');
  const tCur = tSel.value, uCur = uSel.value;
  tSel.innerHTML = '<option value="">كل الأقسام</option>' +
    Object.entries(AUDIT_TABLES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  uSel.innerHTML = '<option value="">كل المستخدمين</option>' +
    [...new Set(AUDIT_ROWS.map(r=>r.user_name).filter(Boolean))].map(u=>`<option>${esc(u)}</option>`).join('');
  tSel.value = tCur; uSel.value = uCur;
  drawAuditRows();
}

function drawAuditRows() {
  const from = $('#audFrom').value, to = $('#audTo').value;
  const tF = $('#audTable').value, uF = $('#audUser').value;
  const rows = AUDIT_ROWS.filter(r => {
    const d = (r.at||'').slice(0,10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (tF && r.table_name !== tF) return false;
    if (uF && r.user_name !== uF) return false;
    return true;
  }).map(r => {
    const [aLabel, aClass] = AUDIT_ACTIONS[r.action] || [r.action,'draft'];
    const time = new Date(r.at);
    return `<tr>
      <td style="white-space:nowrap">${time.toLocaleDateString('en-CA')}<div class="hint">${time.toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})}</div></td>
      <td><b>${esc(r.user_name||'—')}</b></td>
      <td><span class="badge ${aClass}">${aLabel}</span></td>
      <td>${AUDIT_TABLES[r.table_name]||esc(r.table_name)}</td>
      <td>${auditDesc(r)}</td>
    </tr>`;
  }).join('');
  $('#auditTable').innerHTML = `
    <tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>التفاصيل</th></tr>
    ${rows || '<tr><td colspan="5" class="empty-row">لا توجد حركات مطابقة</td></tr>'}`;
}
$('#audApply').onclick = renderAudit;

/* =====================================================
   💵 الإيرادات والمقبوضات
   ===================================================== */
const REV_CATS = ['إيجارات','بيع خردة','دعم / رأس مال','فوائد','أخرى'];
const inPeriod = (d, from, to) => (!from && !to) || inRange(d, from, to);
const openingBalance = () => Number(S.app_settings.find(s => s.key === 'opening_balance')?.value || 0);

// كل الإيرادات موحّدة: فواتير المبيعات (تلقائي) + إيرادات أخرى (يدوي)
function allRevenues(from, to) {
  const fromInvoices = S.invoices.filter(v => inPeriod(v.date, from, to)).map(v => {
    const c = custById(v.customer_id);
    const mix = v.mixture_id ? mixById(v.mixture_id) : null;
    return {
      kind: 'invoice', id: v.id, date: v.date,
      category: 'مبيعات الخلطات',
      source: c ? c.name : '—',
      desc: `${v.invoice_no}${mix?` — ${mix.name}`:''}${v.qty?` (${fmt(v.qty)})`:''}`,
      amount: Number(v.total), receivedAmt: paidOf(v), status: payStatus(v)
    };
  });
  const manual = S.revenues.filter(r => inPeriod(r.date, from, to)).map(r => ({
    kind: 'revenue', id: r.id, date: r.date,
    category: r.category, source: r.source || '—',
    desc: r.note || '', amount: Number(r.amount), receivedAmt: Number(r.amount),
    status: { key:'paid', label:'مقبوض', cls:'ok' }
  }));
  return [...fromInvoices, ...manual].sort((a,b) => (b.date||'').localeCompare(a.date||'') || b.id - a.id);
}

function renderRevenues() {
  const from = $('#revFrom').value, to = $('#revTo').value;
  const rows = allRevenues(from, to);
  const total    = rows.reduce((s,r) => s + r.amount, 0);
  const received = rows.reduce((s,r) => s + r.receivedAmt, 0);
  const due      = total - received;
  const sales    = rows.filter(r => r.kind === 'invoice').reduce((s,r) => s + r.amount, 0);
  const other    = total - sales;

  $('#revCards').innerHTML = `
    <div class="card green"><div class="c-label">💵 إجمالي الإيرادات</div><div class="c-value">${money(total)}</div>
      <div class="c-sub">${rows.length} عملية</div></div>
    <div class="card blue"><div class="c-label">🧾 مبيعات الخلطات</div><div class="c-value">${money(sales)}</div>
      <div class="c-sub">تلقائياً من الفواتير</div></div>
    <div class="card amber"><div class="c-label">➕ إيرادات أخرى</div><div class="c-value">${money(other)}</div></div>
    <div class="card ${due>0?'red':'green'}"><div class="c-label">💰 المقبوض فعلاً</div><div class="c-value">${money(received)}</div>
      <div class="c-sub">${due>0?`لم يُقبض بعد: ${money(due)}`:'كل الإيرادات مقبوضة ✔'}</div></div>`;

  $('#revTable').innerHTML = `
    <tr><th>التاريخ</th><th>النوع</th><th>المصدر</th><th>البيان</th><th>المبلغ</th><th>الاستلام</th><th></th></tr>
    ${rows.map(r => `<tr>
      <td>${esc(r.date)}</td>
      <td><span class="badge ${r.kind==='invoice'?'done':'draft'}">${esc(r.category)}</span></td>
      <td>${esc(r.source)}</td>
      <td>${esc(r.desc)}</td>
      <td class="num"><b>${money(r.amount)}</b></td>
      <td><span class="badge ${r.status.cls}">${r.status.label}</span>
        ${r.receivedAmt > 0 && r.receivedAmt < r.amount ? `<div class="hint">قُبض ${fmt(r.receivedAmt)} من ${fmt(r.amount)}</div>` : ''}</td>
      <td><div class="actions">
        ${r.kind==='invoice'
          ? (canEdit('sales') ? `<button class="btn sm ${r.receivedAmt<r.amount?'primary':''}" onclick="paymentsForm(${r.id})">💵 دفعات</button>` : '')
          : (canEdit('revenues') ? `<button class="btn sm" onclick="revenueForm(${r.id})">✏️</button>
             <button class="btn sm danger" onclick="delRevenue(${r.id})">🗑️</button>` : '')}
      </div></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-row">لا توجد إيرادات ضمن هذه الفترة</td></tr>'}`;

  // مخطط شهري
  const byMonth = {};
  rows.forEach(r => { const mo = (r.date||'').slice(0,7); byMonth[mo] = (byMonth[mo]||0) + r.amount; });
  const months = Object.keys(byMonth).sort().slice(-8);
  const max = Math.max(...months.map(m=>byMonth[m]), 1);
  $('#revChart').innerHTML = months.map(mo => `
    <div class="bar-col">
      <div class="bar-val">${fmt(byMonth[mo])}</div>
      <div class="bar" style="height:${Math.max(byMonth[mo]/max*100,1.5)}%"></div>
      <div class="bar-label">${mo}</div>
    </div>`).join('') || '<p class="muted">لا بيانات</p>';

  // حسب المصدر
  const bySrc = {};
  rows.forEach(r => {
    bySrc[r.category] = bySrc[r.category] || { n:0, total:0 };
    bySrc[r.category].n++; bySrc[r.category].total += r.amount;
  });
  $('#revBySrc').innerHTML = `
    <tr><th>المصدر</th><th>عدد</th><th>المبلغ</th><th>النسبة</th></tr>
    ${Object.entries(bySrc).sort((a,b)=>b[1].total-a[1].total).map(([k,v]) => `<tr>
      <td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${money(v.total)}</td>
      <td class="num">${fmt((total>0?v.total/total*100:0).toFixed(1))}%</td></tr>`).join('')
      || '<tr><td colspan="4" class="empty-row">لا بيانات</td></tr>'}`;
}
$('#revApply').onclick = renderRevenues;

window.revenueForm = function(id) {
  const r = id ? S.revenues.find(x=>x.id===id) : null;
  modal(r ? 'تعديل إيراد' : 'إيراد جديد', `
    <div class="form-grid">
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${esc(r?.date||today())}"></div>
      <div class="form-row"><label>النوع</label>
        <select id="f_cat">${REV_CATS.map(c=>`<option ${r?.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="form-row"><label>المصدر / الجهة</label><input id="f_src" value="${esc(r?.source||'')}" placeholder="اسم الجهة"></div>
      <div class="form-row"><label>المبلغ (${CUR}) *</label><input id="f_amount" type="number" min="0" step="any" value="${r?.amount??''}"></div>
    </div>
    <div class="form-row"><label>ملاحظة</label><input id="f_note" value="${esc(r?.note||'')}"></div>
    <div class="hint">💡 لا تُدخل مبيعات الخلطات هنا — تدخل تلقائياً من الفواتير.</div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveRevenue(${id||0})">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveRevenue = async function(id) {
  const amount = Number($('#f_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  const data = { date: $('#f_date').value||today(), category: $('#f_cat').value,
    source: $('#f_src').value.trim(), amount, note: $('#f_note').value.trim() };
  try {
    if (id) await DB.update('revenues', id, data); else await DB.insert('revenues', data);
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delRevenue = async function(id) {
  if (!confirm('حذف هذا الإيراد؟')) return;
  try { await DB.remove('revenues', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

/* =====================================================
   🏦 القاصة — مطابقة الداخل والخارج
   ===================================================== */
async function withdrawalsTotal(from, to) {
  if (ROLE === 'owner' || DB.backend !== 'supabase') {
    return S.partner_withdrawals.filter(w => inPeriod(w.date, from, to))
      .reduce((s,w) => s + Number(w.amount), 0);
  }
  try { return Number(await DB.rpc('withdrawals_total', { d_from: from||null, d_to: to||null })) || 0; }
  catch { return 0; }
}

async function cashSummary(from, to) {
  const invs = S.invoices.filter(v => inPeriod(v.date, from, to));
  const collected = collectedInPeriod(from, to);
  const dueFromCustomers = S.invoices.filter(v => inPeriod(v.date, from, to))
    .reduce((s,v) => s + remainOf(v), 0);
  const otherRev = S.revenues.filter(r => inPeriod(r.date, from, to)).reduce((s,r) => s + Number(r.amount), 0);
  const opening = (!from) ? openingBalance() : 0;   // الافتتاحي يُحتسب عند عرض كل الفترات فقط

  const purchases = S.movements.filter(m => m.type === 'in' && inPeriod(m.date, from, to));
  const purchasesPaid = purchases.filter(m => m.paid !== false).reduce((s,m) => s + movValue(m), 0);
  const dueToSuppliers = purchases.filter(m => m.paid === false).reduce((s,m) => s + movValue(m), 0);
  const expenses = S.expenses.filter(e => inPeriod(e.date, from, to)).reduce((s,e) => s + Number(e.amount), 0);
  const salaries = S.salaries.filter(s2 => inPeriod(s2.date, from, to)).reduce((s,x) => s + Number(x.amount), 0);
  const withdrawals = await withdrawalsTotal(from, to);

  const totalIn  = opening + collected + otherRev;
  const totalOut = purchasesPaid + expenses + salaries + withdrawals;
  return { opening, collected, otherRev, totalIn, purchasesPaid, expenses, salaries, withdrawals,
           totalOut, expected: totalIn - totalOut, dueFromCustomers, dueToSuppliers,
           invCount: invs.length, period: (from||to) ? `${from||'البداية'} ← ${to||'اليوم'}` : 'كل الفترات' };
}

let CASH = null;
async function renderCash() {
  const from = $('#cashFrom').value, to = $('#cashTo').value;
  const c = await cashSummary(from, to);
  CASH = c;

  const lastCount = [...S.cash_counts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id)[0];

  $('#cashCards').innerHTML = `
    <div class="card green"><div class="c-label">⬇️ إجمالي الداخل</div><div class="c-value">${money(c.totalIn)}</div>
      <div class="c-sub">${c.opening>0?`منها افتتاحي: ${money(c.opening)}`:''}</div></div>
    <div class="card red"><div class="c-label">⬆️ إجمالي الخارج</div><div class="c-value">${money(c.totalOut)}</div></div>
    <div class="card ${c.expected>=0?'blue':'red'}"><div class="c-label">🏦 المفروض في القاصة</div>
      <div class="c-value">${money(c.expected)}</div><div class="c-sub">${esc(c.period)}</div></div>
    <div class="card amber"><div class="c-label">📌 ذمم على الزبائن</div><div class="c-value">${money(c.dueFromCustomers)}</div>
      <div class="c-sub">${c.dueToSuppliers>0?`وعليك للموردين: ${money(c.dueToSuppliers)}`:''}</div></div>`;

  $('#cashInTable').innerHTML = `
    <tr><th>البند</th><th>المبلغ</th></tr>
    ${c.opening ? `<tr><td>💼 رصيد افتتاحي</td><td class="num">${money(c.opening)}</td></tr>` : ''}
    <tr><td>🧾 مقبوضات فواتير المبيعات</td><td class="num">${money(c.collected)}</td></tr>
    <tr><td>➕ إيرادات أخرى</td><td class="num">${money(c.otherRev)}</td></tr>
    <tr style="background:#f0fdf4;font-weight:900"><td>الإجمالي الداخل</td><td class="num">${money(c.totalIn)}</td></tr>`;

  $('#cashOutTable').innerHTML = `
    <tr><th>البند</th><th>المبلغ</th></tr>
    <tr><td>🏪 مشتريات مواد مسددة</td><td class="num">${money(c.purchasesPaid)}</td></tr>
    <tr><td>💰 مصروفات تشغيلية</td><td class="num">${money(c.expenses)}</td></tr>
    <tr><td>👷 رواتب مدفوعة</td><td class="num">${money(c.salaries)}</td></tr>
    <tr><td>🤝 سحوبات الشركاء</td><td class="num">${money(c.withdrawals)}</td></tr>
    <tr style="background:#fef2f2;font-weight:900"><td>الإجمالي الخارج</td><td class="num">${money(c.totalOut)}</td></tr>`;

  // نتيجة المطابقة
  const diff = lastCount ? Number(lastCount.counted) - c.expected : null;
  $('#cashResultPanel').innerHTML = `
    <h3>⚖️ نتيجة المطابقة</h3>
    <div class="calc-box" style="font-size:16px;line-height:2.2">
      الداخل <b>${money(c.totalIn)}</b> − الخارج <b>${money(c.totalOut)}</b> =
      <span style="font-size:20px">المفروض في القاصة: <b>${money(c.expected)}</b></span>
      ${lastCount ? `
        <div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:10px">
          آخر جرد فعلي (${esc(lastCount.date)}): <b>${money(lastCount.counted)}</b> —
          ${Math.abs(diff) < 0.01
            ? '<span style="color:var(--green);font-weight:900">✔ مطابق تماماً</span>'
            : `<span style="color:var(--red);font-weight:900">${diff > 0 ? 'زيادة' : 'عجز'} بمقدار ${money(Math.abs(diff))}</span>`}
          ${lastCount.note?`<div class="hint">📝 ${esc(lastCount.note)}</div>`:''}
        </div>` : '<div class="hint" style="margin-top:8px">لم يُسجَّل جرد فعلي بعد — اضغط "🧮 جرد القاصة" لمطابقة النقد الموجود.</div>'}
    </div>`;

  $('#cashDuesTable').innerHTML = `
    <tr><th>البند</th><th>المبلغ</th><th>التفاصيل</th></tr>
    <tr><td>📥 مستحق لك على الزبائن</td><td class="num" style="color:var(--green)">${money(c.dueFromCustomers)}</td>
      <td>${S.invoices.filter(v=>remainOf(v)>0 && inPeriod(v.date,from,to)).length} فاتورة غير مسددة بالكامل</td></tr>
    <tr><td>📤 مستحق عليك للموردين</td><td class="num" style="color:var(--red)">${money(c.dueToSuppliers)}</td>
      <td>${S.movements.filter(m=>m.type==='in'&&m.paid===false&&inPeriod(m.date,from,to)).length} توريد آجل</td></tr>
    <tr style="font-weight:900"><td>صافي الذمم</td>
      <td class="num" style="color:${c.dueFromCustomers-c.dueToSuppliers>=0?'var(--green)':'var(--red)'}">${money(c.dueFromCustomers - c.dueToSuppliers)}</td>
      <td class="hint">لو حصّلت ودفعت كل الذمم</td></tr>`;

  $('#cashCountsTable').innerHTML = `
    <tr><th>التاريخ</th><th>المعدود</th><th>المفروض</th><th>الفرق</th><th></th></tr>
    ${[...S.cash_counts].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id-a.id).slice(0,10).map(k => {
      const d = Number(k.counted) - Number(k.expected);
      return `<tr><td>${esc(k.date)}</td><td class="num">${money(k.counted)}</td><td class="num">${money(k.expected)}</td>
        <td class="num" style="color:${Math.abs(d)<0.01?'var(--green)':'var(--red)'}">${Math.abs(d)<0.01?'مطابق ✔':(d>0?'+':'')+money(d)}</td>
        <td>${canEdit('cash')?`<button class="btn sm danger" onclick="delCashCount(${k.id})">🗑️</button>`:''}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-row">لا يوجد جرد سابق</td></tr>'}`;
}
$('#cashApply').onclick = renderCash;

window.openingForm = function() {
  modal('⚙️ الرصيد الافتتاحي للقاصة', `
    <div class="form-row"><label>المبلغ الموجود في القاصة عند بدء استخدام النظام (${CUR})</label>
      <input id="f_open" type="number" step="any" value="${openingBalance()}"></div>
    <div class="hint">يُضاف هذا المبلغ إلى الداخل عند عرض "كل الفترات".</div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveOpening()">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveOpening = async function() {
  const val = String(Number($('#f_open').value) || 0);
  const row = S.app_settings.find(s => s.key === 'opening_balance');
  try {
    if (row) await DB.update('app_settings', row.id, { value: val });
    else await DB.insert('app_settings', { key: 'opening_balance', value: val });
    closeModal(); toast('تم حفظ الرصيد الافتتاحي ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.cashCountForm = async function() {
  const c = CASH || await cashSummary($('#cashFrom').value, $('#cashTo').value);
  modal('🧮 جرد القاصة', `
    <div class="calc-box">المفروض حسب النظام: <b>${money(c.expected)}</b></div>
    <div class="form-grid" style="margin-top:12px">
      <div class="form-row"><label>المبلغ المعدود فعلياً (${CUR}) *</label>
        <input id="f_counted" type="number" step="any" oninput="cashDiffPreview(${c.expected})"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${today()}"></div>
    </div>
    <div class="calc-box" id="cashDiffBox">أدخل المبلغ المعدود لمعرفة الفرق.</div>
    <div class="form-row" style="margin-top:12px"><label>ملاحظة</label><input id="f_note" placeholder="سبب الفرق إن وُجد"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveCashCount(${c.expected})">💾 حفظ الجرد</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.cashDiffPreview = function(expected) {
  const counted = Number($('#f_counted').value) || 0;
  const d = counted - expected;
  $('#cashDiffBox').innerHTML = Math.abs(d) < 0.01
    ? '<span style="color:var(--green);font-weight:900">✔ مطابق تماماً</span>'
    : `الفرق: <b style="color:var(--red)">${d>0?'زيادة':'عجز'} ${money(Math.abs(d))}</b>`;
};
window.saveCashCount = async function(expected) {
  const counted = Number($('#f_counted').value);
  if (isNaN(counted)) return toast('أدخل المبلغ المعدود', 'err');
  try {
    await DB.insert('cash_counts', { date: $('#f_date').value||today(), counted, expected,
      note: $('#f_note').value.trim() });
    closeModal(); toast('تم حفظ الجرد ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delCashCount = async function(id) {
  if (!confirm('حذف سجل الجرد هذا؟')) return;
  try { await DB.remove('cash_counts', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.printCash = async function() {
  const c = CASH || await cashSummary($('#cashFrom').value, $('#cashTo').value);
  $('#printArea').innerHTML = `
    <div class="inv-print">
      <div class="inv-head">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="assets/logo.png" alt="" style="width:85px;height:85px;object-fit:contain" onerror="this.remove()">
          <div><h1>شركة بوابة الخليج</h1><div>للكونكريت الجاهز — تقرير القاصة</div></div>
        </div>
        <div class="inv-meta"><b>الفترة:</b> ${esc(c.period)}<br><b>تاريخ الطباعة:</b> ${today()}</div>
      </div>
      <table>
        <tr><th colspan="2" style="background:#eee">الداخل إلى القاصة</th></tr>
        ${c.opening?`<tr><td>رصيد افتتاحي</td><td>${money(c.opening)}</td></tr>`:''}
        <tr><td>مقبوضات فواتير المبيعات</td><td>${money(c.collected)}</td></tr>
        <tr><td>إيرادات أخرى</td><td>${money(c.otherRev)}</td></tr>
        <tr style="font-weight:900"><td>إجمالي الداخل</td><td>${money(c.totalIn)}</td></tr>
        <tr><th colspan="2" style="background:#eee">الخارج من القاصة</th></tr>
        <tr><td>مشتريات مواد مسددة</td><td>${money(c.purchasesPaid)}</td></tr>
        <tr><td>مصروفات تشغيلية</td><td>${money(c.expenses)}</td></tr>
        <tr><td>رواتب مدفوعة</td><td>${money(c.salaries)}</td></tr>
        <tr><td>سحوبات الشركاء</td><td>${money(c.withdrawals)}</td></tr>
        <tr style="font-weight:900"><td>إجمالي الخارج</td><td>${money(c.totalOut)}</td></tr>
      </table>
      <div class="inv-total">المفروض في القاصة: ${money(c.expected)}</div>
      <table style="margin-top:14px">
        <tr><th>مستحق على الزبائن</th><th>مستحق للموردين</th></tr>
        <tr><td>${money(c.dueFromCustomers)}</td><td>${money(c.dueToSuppliers)}</td></tr>
      </table>
      <p style="margin-top:34px;font-size:13px">أمين الصندوق: ______________ &nbsp;&nbsp; الإدارة: ______________</p>
    </div>`;
  window.print();
};

/* =====================================================
   📊 لوحة التحكم
   ===================================================== */
function inRange(date, from, to) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function renderDashboard() {
  const from = $('#dashFrom').value, to = $('#dashTo').value;
  const invs = S.invoices.filter(v => (!from && !to) || inRange(v.date, from, to));
  const exps = S.expenses.filter(e => (!from && !to) || inRange(e.date, from, to));
  const mixes = S.mixtures.filter(m => m.status==='executed' && ((!from && !to) || inRange(m.date, from, to)));

  const sales = invs.reduce((s,v)=>s+Number(v.total),0);
  const otherRev = S.revenues.filter(r => (!from && !to) || inRange(r.date, from, to)).reduce((s,r)=>s+Number(r.amount),0);
  const cogs = invs.reduce((s,v)=>s+Number(v.cost),0);
  const sals = salariesTotal(from, to);
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0) + sals;
  const production = mixes.reduce((s,m)=>s+Number(m.output_qty),0);
  const stockValue = S.materials.reduce((s,m)=>s+qtyOf(m.id)*Number(m.unit_price),0);
  const activeCust = new Set(invs.map(v=>v.customer_id)).size;
  const unpaid = invs.reduce((s,v)=>s+remainOf(v),0);
  const profit = sales + otherRev - cogs - expTotal;

  $('#dashCards').innerHTML = `
    <div class="card blue"><div class="c-label">🏗️ إجمالي الإنتاج</div><div class="c-value">${fmt(production)}</div><div class="c-sub">${mixes.length} خلطة منفذة</div></div>
    <div class="card green"><div class="c-label">🧾 إجمالي المبيعات</div><div class="c-value">${money(sales)}</div><div class="c-sub">${invs.length} فاتورة${otherRev?` + إيرادات ${fmt(otherRev)}`:''}</div></div>
    <div class="card amber"><div class="c-label">📦 قيمة المخزون</div><div class="c-value">${money(stockValue)}</div><div class="c-sub">${S.materials.length} مادة</div></div>
    <div class="card blue"><div class="c-label">👥 الزبائن النشطون</div><div class="c-value">${activeCust}</div><div class="c-sub">من أصل ${S.customers.length}</div></div>
    <div class="card red"><div class="c-label">💸 المصاريف والرواتب</div><div class="c-value">${money(expTotal)}</div><div class="c-sub">${sals>0?`منها رواتب: ${money(sals)}`:''}</div></div>
    <div class="card ${profit>=0?'green':'red'}"><div class="c-label">💰 صافي الربح</div><div class="c-value">${money(profit)}</div><div class="c-sub">${unpaid>0?`منها آجلة: ${money(unpaid)}`:''}</div></div>`;

  // المواد المنخفضة
  const low = S.materials.filter(m => qtyOf(m.id) <= Number(m.min_qty));
  $('#dashLowStock').innerHTML = low.length
    ? `<table class="tbl"><tr><th>المادة</th><th>المتوفر</th><th>الحد الأدنى</th></tr>
       ${low.map(m=>`<tr><td>${esc(m.name)}</td><td class="num" style="color:var(--red)">${fmt(qtyOf(m.id))} ${esc(m.unit)}</td><td class="num">${fmt(m.min_qty)}</td></tr>`).join('')}</table>`
    : '<p class="muted">✔ كل المواد فوق الحد الأدنى</p>';

  // آخر الفواتير
  const recent = [...S.invoices].sort((a,b)=>b.id-a.id).slice(0,6);
  $('#dashRecentSales').innerHTML = recent.length
    ? `<table class="tbl"><tr><th>الفاتورة</th><th>الزبون</th><th>المبلغ</th></tr>
       ${recent.map(v=>{const c=custById(v.customer_id);return `<tr><td>${esc(v.invoice_no)}</td><td>${esc(c?c.name:'—')}</td><td class="num">${money(v.total)}</td></tr>`;}).join('')}</table>`
    : '<p class="muted">لا توجد مبيعات بعد</p>';

  // مخطط المبيعات الشهري (آخر 6 أشهر)
  const months = [];
  const d = new Date();
  for (let i=5;i>=0;i--) {
    const dt = new Date(d.getFullYear(), d.getMonth()-i, 1);
    months.push(dt.toISOString().slice(0,7));
  }
  const vals = months.map(mo => S.invoices.filter(v=>(v.date||'').startsWith(mo)).reduce((s,v)=>s+Number(v.total),0));
  const max = Math.max(...vals, 1);
  $('#dashChart').innerHTML = months.map((mo,i)=>`
    <div class="bar-col">
      <div class="bar-val">${vals[i]?fmt(vals[i]):''}</div>
      <div class="bar" style="height:${Math.max(vals[i]/max*100,1.5)}%"></div>
      <div class="bar-label">${mo}</div>
    </div>`).join('');
}
$('#dashApply').onclick = renderDashboard;
$('#dashClear').onclick = () => { $('#dashFrom').value=''; $('#dashTo').value=''; renderDashboard(); };

/* =====================================================
   📈 التقارير
   ===================================================== */
function renderReports() {
  const sel = $('#repCustomer');
  const cur = sel.value;
  sel.innerHTML = '<option value="">كل الزبائن</option>' + S.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  sel.value = cur;
  buildReport();
}
$('#repApply').onclick = buildReport;

function buildReport() {
  const from = $('#repFrom').value, to = $('#repTo').value;
  const custId = Number($('#repCustomer').value) || null;

  let invs = S.invoices.filter(v => (!from && !to) || inRange(v.date, from, to));
  if (custId) invs = invs.filter(v => v.customer_id === custId);
  const exps = custId ? [] : S.expenses.filter(e => (!from && !to) || inRange(e.date, from, to));
  const mixes = S.mixtures.filter(m => m.status==='executed' && ((!from && !to) || inRange(m.date, from, to)) && (!custId || m.customer_id === custId));

  const sales = invs.reduce((s,v)=>s+Number(v.total),0);
  const cogs = invs.reduce((s,v)=>s+Number(v.cost),0);
  const sals = custId ? 0 : salariesTotal(from, to);
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0) + sals;

  // استهلاك المواد ضمن الفترة (حركات الصرف)
  const outMovs = S.movements.filter(m => m.type==='out' && ((!from && !to) || inRange(m.date, from, to)));
  const consumption = {};
  outMovs.forEach(mv => {
    consumption[mv.material_id] = (consumption[mv.material_id]||0) + Number(mv.qty);
  });

  const expByCat = {};
  exps.forEach(e => expByCat[e.category] = (expByCat[e.category]||0) + Number(e.amount));
  if (sals > 0) expByCat['رواتب الموظفين'] = (expByCat['رواتب الموظفين']||0) + sals;

  $('#repBody').innerHTML = `
    <div class="cards">
      <div class="card green"><div class="c-label">الإيرادات</div><div class="c-value">${money(sales)}</div><div class="c-sub">${invs.length} فاتورة</div></div>
      <div class="card amber"><div class="c-label">كلفة المواد المباعة</div><div class="c-value">${money(cogs)}</div></div>
      <div class="card red"><div class="c-label">المصاريف التشغيلية</div><div class="c-value">${money(expTotal)}</div></div>
      <div class="card ${sales-cogs-expTotal>=0?'green':'red'}"><div class="c-label">صافي الربح</div><div class="c-value">${money(sales-cogs-expTotal)}</div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><h3>🧾 المبيعات ضمن الفترة</h3>
        <div class="tbl-wrap"><table class="tbl">
          <tr><th>الفاتورة</th><th>التاريخ</th><th>الزبون</th><th>المبلغ</th></tr>
          ${invs.map(v=>{const c=custById(v.customer_id);return `<tr><td>${esc(v.invoice_no)}</td><td>${esc(v.date)}</td><td>${esc(c?c.name:'—')}</td><td class="num">${money(v.total)}</td></tr>`;}).join('')
            || '<tr><td colspan="4" class="empty-row">لا توجد مبيعات</td></tr>'}
        </table></div></div>
      <div class="panel"><h3>💸 المصاريف حسب الفئة</h3>
        <div class="tbl-wrap"><table class="tbl">
          <tr><th>الفئة</th><th>المبلغ</th></tr>
          ${Object.entries(expByCat).map(([c,a])=>`<tr><td>${esc(c)}</td><td class="num">${money(a)}</td></tr>`).join('')
            || '<tr><td colspan="2" class="empty-row">لا توجد مصاريف</td></tr>'}
        </table></div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><h3>⚗️ الخلطات المنفذة (${mixes.length})</h3>
        <div class="tbl-wrap"><table class="tbl">
          <tr><th>الخلطة</th><th>التاريخ</th><th>الكمية</th><th>الكلفة</th></tr>
          ${mixes.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.date)}</td><td class="num">${fmt(m.output_qty)} ${esc(m.output_unit)}</td><td class="num">${money(m.cost)}</td></tr>`).join('')
            || '<tr><td colspan="4" class="empty-row">لا توجد خلطات</td></tr>'}
        </table></div></div>
      <div class="panel"><h3>🏪 المشتريات من الموردين</h3>
        <div class="tbl-wrap"><table class="tbl">
          <tr><th>المورد</th><th>عدد التوريدات</th><th>القيمة</th><th>غير المسدد</th></tr>
          ${(() => {
            const ins = S.movements.filter(m => m.type==='in' && ((!from && !to) || inRange(m.date, from, to)));
            const by = {};
            ins.forEach(m => {
              const k = m.supplier_id || 0;
              by[k] = by[k] || { n:0, total:0, unpaid:0 };
              by[k].n++; by[k].total += movValue(m);
              if (m.paid === false) by[k].unpaid += movValue(m);
            });
            return Object.entries(by).map(([k,v]) => {
              const s = Number(k) ? supById(Number(k)) : null;
              return `<tr><td>${s?esc(s.name):'<span class="hint">بدون مورد</span>'}</td>
                <td class="num">${v.n}</td><td class="num">${money(v.total)}</td>
                <td class="num" style="color:${v.unpaid>0?'var(--red)':'inherit'}">${money(v.unpaid)}</td></tr>`;
            }).join('') || '<tr><td colspan="4" class="empty-row">لا توريدات ضمن الفترة</td></tr>';
          })()}
        </table></div></div>
      <div class="panel"><h3>📦 استهلاك المواد ضمن الفترة</h3>
        <div class="tbl-wrap"><table class="tbl">
          <tr><th>المادة</th><th>الكمية المستهلكة</th></tr>
          ${Object.entries(consumption).map(([id,q])=>{const m=matById(Number(id));return `<tr><td>${esc(m?m.name:'—')}</td><td class="num">${fmt(q)} ${esc(m?m.unit:'')}</td></tr>`;}).join('')
            || '<tr><td colspan="2" class="empty-row">لا يوجد استهلاك</td></tr>'}
        </table></div></div>
    </div>`;
}

/* =====================================================
   ⚙️ الإعدادات
   ===================================================== */
function renderSettings() {
  const cfg = DB.getConfig();
  $('#sbUrl').value = cfg.url;
  $('#sbKey').value = cfg.key;
  $('#currencyInput').value = CUR;
  updateBadge();
}
function updateBadge() {
  $('#backendBadge').textContent = DB.backend === 'supabase' ? '☁️ متصل بـ Supabase' : '💾 تخزين محلي (هذا الجهاز)';
}

$('#btnSaveSb').onclick = async () => {
  const url = $('#sbUrl').value.trim(), key = $('#sbKey').value.trim();
  if (!url || !key) return toast('أدخل الرابط والمفتاح معاً', 'err');
  DB.setConfig(url, key);
  $('#sbStatus').textContent = '⏳ جارٍ اختبار الاتصال...'; $('#sbStatus').className = '';
  const ok = await DB.connect();
  if (ok) {
    $('#sbStatus').textContent = '✔ تم الاتصال بنجاح — النظام الآن يعمل على قاعدة البيانات السحابية';
    $('#sbStatus').className = 'ok';
    toast('☁️ متصل بـ Supabase', 'ok');
    await refresh(); updateBadge();
  } else {
    $('#sbStatus').textContent = '✖ فشل الاتصال — تأكد من الرابط والمفتاح ومن تنفيذ ملف schema.sql في مشروعك';
    $('#sbStatus').className = 'err';
  }
};
$('#btnClearSb').onclick = async () => {
  DB.setConfig('', '');
  await DB.connect();
  $('#sbStatus').textContent = 'تم الفصل — عدت للتخزين المحلي'; $('#sbStatus').className = '';
  await refresh(); updateBadge();
};

$('#btnExport').onclick = () => {
  const blob = new Blob([DB.exportData()], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `factory-backup-${today()}.json`;
  a.click();
};
$('#btnImport').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    DB.importData(await file.text());
    toast('تم الاستيراد ✔', 'ok');
    await refresh();
  } catch(err) { toast('ملف غير صالح: '+err.message, 'err'); }
  e.target.value = '';
};
$('#btnResetData').onclick = async () => {
  if (!confirm('⚠️ سيتم حذف كل البيانات نهائياً (مواد، خلطات، زبائن، فواتير، مصاريف، عربات، موظفين، رواتب، شركاء).\nهل أنت متأكد؟')) return;
  const word = prompt('للتأكيد النهائي اكتب: تصفير');
  if (word !== 'تصفير') return toast('تم الإلغاء — لم يُحذف شيء', '');
  try {
    await DB.clearAllData();
    toast('✔ تم تصفير كل البيانات', 'ok');
    await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

$('#btnSaveCurrency').onclick = () => {
  CUR = $('#currencyInput').value.trim() || 'د.ع';
  localStorage.setItem('currency', CUR);
  toast('تم حفظ العملة ✔', 'ok');
  renderPage(currentPage());
};

// ---------- أزرار الإضافة ----------
$('#btnAddMaterial').onclick = () => materialForm(0);
$('#btnAddSupplier').onclick = () => supplierForm(0);
$('#btnAddRecipe').onclick = () => recipeForm(0);
$('#btnAddMixture').onclick = () => mixtureForm(0);
$('#btnAddCustomer').onclick = () => customerForm(0);
$('#btnAddSale').onclick = () => saleForm();
$('#btnAddExpense').onclick = () => expenseForm();
$('#btnAddRevenue').onclick = () => revenueForm(0);
$('#btnOpening').onclick = () => openingForm();
$('#btnCashCount').onclick = () => cashCountForm();
$('#btnCashPrint').onclick = () => printCash();
$('#btnAddVehicle').onclick = () => vehicleForm(0);
$('#btnAddEmployee').onclick = () => employeeForm(0);
$('#btnAddPartner').onclick = () => partnerForm(0);
$('#btnAddUser').onclick = () => userForm();

/* =====================================================
   🔐 تسجيل الدخول وتطبيق الصلاحيات
   ===================================================== */
function applyPermissions() {
  // إخفاء صفحات القائمة غير المسموحة
  $$('.nav-btn').forEach(b => b.style.display = canView(b.dataset.page) ? '' : 'none');
  // إخفاء أزرار الإضافة حسب الدور
  const addBtns = { btnAddMaterial:'materials', btnAddSupplier:'suppliers', btnAddRecipe:'recipes',
    btnAddRevenue:'revenues', btnOpening:'cash', btnCashCount:'cash',
    btnAddMixture:'mixtures', btnAddCustomer:'customers',
    btnAddSale:'sales', btnAddExpense:'expenses', btnAddVehicle:'vehicles',
    btnAddEmployee:'employees', btnAddPartner:'partners', btnAddUser:'users' };
  Object.entries(addBtns).forEach(([btn, section]) => {
    const el = document.getElementById(btn);
    if (el) el.style.display = canEdit(section) ? '' : 'none';
  });
}

function showLogin(msg) {
  $('#loginScreen').style.display = 'flex';
  $('#loginError').textContent = msg || '';
}
function hideLogin() { $('#loginScreen').style.display = 'none'; }

async function enterApp(user) {
  USER = user;
  if (DB.backend === 'supabase' && user) {
    // جلب الملف الشخصي لتحديد الدور
    let profiles = [];
    try { profiles = await DB.list('profiles'); } catch(e) { profiles = []; }
    let me = profiles.find(p => p.id === user.id);
    if (!me) {
      if (profiles.length === 0) {
        // أول مستخدم يسجل الدخول = المالك تلقائياً
        try {
          me = await DB.insert('profiles', { id: user.id, name: window._firstName || (user.email||'').split('@')[0], role: 'owner', active: true });
          toast('👑 تم تعيينك مالكاً للنظام (أول مستخدم)', 'ok');
        } catch(e) {
          await DB.signOut();
          return showLogin('تعذر إنشاء الملف الشخصي — تأكد من تنفيذ schema2.sql: ' + e.message);
        }
      } else {
        await DB.signOut();
        return showLogin('حسابك غير مفعّل في النظام — راجع المالك');
      }
    }
    if (me.active === false) {
      await DB.signOut();
      return showLogin('⛔ هذا الحساب موقوف — راجع المالك');
    }
    ROLE = me.role;
    $('#userBox').classList.add('show');
    $('#userName').textContent = me.name;
    $('#userRole').textContent = ROLE_NAMES[ROLE] || ROLE;
  } else {
    // وضع محلي بدون حسابات: صلاحيات مالك
    ROLE = 'owner';
    $('#userBox').classList.remove('show');
  }
  hideLogin();
  applyPermissions();
  await loadAll();
  showPage('dashboard');
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  let email = $('#loginEmail').value.trim().toLowerCase();
  if (email && !email.includes('@')) email += '@factory.local';
  $('#loginError').textContent = '⏳ جارٍ تسجيل الدخول...';
  try {
    const user = await DB.signIn(email, $('#loginPass').value);
    $('#loginPass').value = '';
    await enterApp(user);
  } catch(err) {
    $('#loginError').textContent = /invalid/i.test(err.message)
      ? '✖ اسم المستخدم أو كلمة المرور غير صحيحة'
      : '✖ ' + err.message;
  }
});

$('#btnLogout').onclick = async () => {
  if (!confirm('تسجيل الخروج؟')) return;
  await DB.signOut();
  location.reload();
};

// ---------- إنشاء حساب المالك الأول (يعمل مرة واحدة فقط) ----------
function sbErrorAr(msg) {
  if (/rate limit/i.test(msg))
    return 'خيار Confirm email ما زال مفعّلاً في Supabase — أوقفه من: Authentication ← Sign In / Providers ← Email ثم أعد المحاولة';
  if (/not confirmed/i.test(msg))
    return 'هذا الحساب أُنشئ سابقاً بانتظار تفعيل البريد — احذفه من Supabase (Authentication ← Users) ثم أنشئه من جديد بعد إيقاف Confirm email';
  if (/confirmation email|error sending|smtp/i.test(msg))
    return 'يجب إيقاف خيار Confirm email في Supabase: Authentication ← Sign In / Providers ← Email';
  if (/does not exist|could not find|schema cache|404/i.test(msg))
    return 'يجب تنفيذ ملف supabase/setup-all.sql في SQL Editor أولاً';
  if (/at least 6|password should/i.test(msg))
    return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
  if (/invalid.*email|email.*invalid/i.test(msg))
    return 'اسم المستخدم غير مقبول — استخدم أحرفاً إنجليزية فقط (مثل murtadha)';
  if (/already registered|already exists/i.test(msg))
    return 'هذا الحساب موجود مسبقاً — جرّب تسجيل الدخول';
  return msg;
}

$('#btnFirstRun').onclick = async () => {
  $('#loginError').textContent = '⏳ جارٍ التحقق...';
  try {
    const count = await DB.rpc('profiles_count');
    if (Number(count) > 0) {
      $('#loginError').textContent = '⛔ يوجد حسابات في النظام مسبقاً — اطلب من المالك إنشاء حساب لك';
      return;
    }
    $('#loginError').textContent = '';
    $('#firstRunBox').style.display = 'block';
    $('#btnFirstRun').style.display = 'none';
  } catch(e) {
    $('#loginError').textContent = '✖ ' + sbErrorAr(e.message);
  }
};

$('#btnCreateOwner').onclick = async () => {
  const name = $('#fr_name').value.trim();
  let username = $('#fr_user').value.trim().toLowerCase();
  const pass = $('#fr_pass').value;
  if (!name || !username) return $('#loginError').textContent = '✖ أدخل الاسم واسم المستخدم';
  if (!username.includes('@') && !/^[a-z0-9._-]+$/.test(username))
    return $('#loginError').textContent = '✖ اسم المستخدم بأحرف إنجليزية فقط (مثل murtadha)';
  if (pass.length < 6) return $('#loginError').textContent = '✖ كلمة المرور 6 أحرف على الأقل';
  const email = username.includes('@') ? username : `${username}@factory.local`;
  $('#loginError').textContent = '⏳ جارٍ إنشاء الحساب...';
  try {
    const data = await DB.signUpOwner(email, pass);
    if (!data.session) {
      $('#loginError').textContent = '✖ ' + sbErrorAr('confirmation email');
      return;
    }
    window._firstName = name;
    $('#fr_pass').value = '';
    await enterApp(data.session.user);
  } catch(e) {
    $('#loginError').textContent = '✖ ' + sbErrorAr(e.message);
  }
};

// ---------- بدء التشغيل ----------
(async function init() {
  await DB.connect();
  updateBadge();
  if (DB.backend === 'supabase') {
    const user = await DB.getUser();
    if (user) await enterApp(user);
    else showLogin();
  } else {
    await enterApp(null);
  }
})();
