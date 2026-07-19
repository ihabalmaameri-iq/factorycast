/* =====================================================
   نظام إدارة مصنع الصبّ - منطق التطبيق
   ===================================================== */

// ---------- الحالة العامة ----------
const S = { materials:[], movements:[], customers:[], mixtures:[], mixture_items:[], invoices:[], expenses:[],
            vehicles:[], partners:[], partner_withdrawals:[], employees:[], salaries:[], profiles:[] };
let CUR = localStorage.getItem('currency') || 'د.ع';

// ---------- الصلاحيات ----------
let ROLE = 'owner';           // الدور الحالي
let USER = null;              // مستخدم Supabase الحالي
const ROLE_NAMES = { owner:'👑 المالك', manager:'📋 المدير', accountant:'🧮 المحاسب' };
// الصفحات المتاحة لكل دور
const ROLE_PAGES = {
  owner:      ['dashboard','materials','mixtures','customers','sales','vehicles','expenses','employees','partners','reports','audit','users','settings'],
  manager:    ['dashboard','materials','mixtures','customers','sales','vehicles','expenses','employees','reports'],
  accountant: ['dashboard','materials','mixtures','customers','sales','vehicles','expenses','employees','reports']
};
// أقسام يحق للدور تعديلها (المالك يعدل كل شيء، المدير عرض فقط)
const ROLE_EDIT = {
  owner:      ['materials','mixtures','customers','sales','vehicles','expenses','employees','partners','users'],
  manager:    [],
  accountant: ['customers','sales','vehicles','expenses','employees']
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
$$('.nav-btn').forEach(btn => btn.onclick = () => showPage(btn.dataset.page));
function showPage(page) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-'+page));
  renderPage(page);
}
function renderPage(page) {
  if (!canView(page)) return;
  ({dashboard:renderDashboard, materials:renderMaterials, mixtures:renderMixtures,
    customers:renderCustomers, sales:renderSales, expenses:renderExpenses,
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
      return `<tr>
        <td>${esc(mv.date)}</td>
        <td>${esc(m?m.name:'—')}</td>
        <td><span class="badge ${mv.type}">${mv.type==='in'?'⬇️ توريد':'⬆️ صرف'}</span></td>
        <td class="num">${fmt(mv.qty)} ${esc(m?m.unit:'')}</td>
        <td class="num">${mv.type==='in'&&mv.price?money(mv.price):'—'}</td>
        <td>${esc(mv.note||'')}</td>
        <td>${canEdit('materials') ? `<div class="actions">
          <button class="btn sm" onclick="movementForm(${mv.id})">✏️</button>
          <button class="btn sm danger" onclick="delMovement(${mv.id})">🗑️</button></div>` : ''}</td>
      </tr>`;
    }).join('');
  $('#movTable').innerHTML = `
    <tr><th>التاريخ</th><th>المادة</th><th>النوع</th><th>الكمية</th><th>سعر الوحدة</th><th>ملاحظة</th><th></th></tr>
    ${movs || '<tr><td colspan="7" class="empty-row">لا توجد حركات</td></tr>'}`;
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
  modal(`توريد دفعة: ${esc(m.name)}`, `
    <div class="form-grid">
      <div class="form-row"><label>الكمية *</label><input id="f_qty" type="number" min="0" step="any"></div>
      <div class="form-row"><label>سعر الوحدة الجديد (${CUR})</label><input id="f_price" type="number" min="0" step="any" value="${m.unit_price}"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${today()}"></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note" placeholder="اسم المورّد مثلاً"></div>
    </div>
    <div class="hint">الكمية الحالية: ${fmt(qtyOf(matId))} ${esc(m.unit)} — سيتم تحديث الإجمالي تلقائياً.</div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveSupply(${matId})">💾 إضافة التوريد</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveSupply = async function(matId) {
  const qty = Number($('#f_qty').value);
  if (!qty || qty <= 0) return toast('أدخل كمية صحيحة', 'err');
  const price = Number($('#f_price').value)||0;
  try {
    await DB.insert('movements', { material_id: matId, type:'in', qty, price, note: $('#f_note').value.trim(), date: $('#f_date').value || today() });
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
      <div class="form-row"><label>الكمية *</label><input id="f_qty" type="number" min="0" step="any" value="${mv.qty}"></div>
      ${mv.type==='in'?`<div class="form-row"><label>سعر الوحدة (${CUR})</label><input id="f_price" type="number" min="0" step="any" value="${mv.price||0}"></div>`:''}
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${esc(mv.date)}"></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note" value="${esc(mv.note||'')}"></div>
    </div>
    <div class="hint">⚠️ تعديل الحركة يغيّر الكمية الحالية للمادة تلقائياً.</div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveMovement(${id})">💾 حفظ التعديل</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveMovement = async function(id) {
  const mv = S.movements.find(x=>x.id===id);
  const qty = Number($('#f_qty').value);
  if (!qty || qty <= 0) return toast('أدخل كمية صحيحة', 'err');
  const patch = { qty, date: $('#f_date').value || mv.date, note: $('#f_note').value.trim() };
  if (mv.type === 'in') patch.price = Number($('#f_price').value)||0;
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
      return `<tr>
        <td class="num">#${c.id}</td>
        <td><b>${esc(c.name)}</b></td>
        <td dir="ltr" style="text-align:right">${esc(c.phone||'—')}</td>
        <td>${esc(c.address||'—')}</td>
        <td class="num">${mixCount}</td>
        <td class="num">${invs.length}</td>
        <td class="num">${money(total)}</td>
        <td><div class="actions">
          <button class="btn sm" onclick="showCustomer(${c.id})">👁️ التفاصيل</button>
          ${canEdit('customers') ? `<button class="btn sm" onclick="customerForm(${c.id})">✏️</button>
          <button class="btn sm danger" onclick="delCustomer(${c.id})">🗑️</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  $('#custTable').innerHTML = `
    <tr><th>المعرف</th><th>اسم الزبون</th><th>الهاتف</th><th>العنوان</th><th>الخلطات</th><th>الفواتير</th><th>إجمالي المشتريات</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="8" class="empty-row">لا يوجد زبائن بعد</td></tr>'}`;
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

window.showCustomer = function(id) {
  const c = custById(id);
  const mixes = S.mixtures.filter(m => m.customer_id === id);
  const invs = S.invoices.filter(v => v.customer_id === id);
  $('#custDetailPanel').style.display = 'block';
  $('#custDetailTitle').textContent = `👤 ${c.name}`;
  $('#custDetail').innerHTML = `
    <p class="muted">📞 ${esc(c.phone||'—')} &nbsp;|&nbsp; 📍 ${esc(c.address||'—')} ${c.notes?`&nbsp;|&nbsp; 📝 ${esc(c.notes)}`:''}</p>
    <h3>⚗️ الخلطات المزوّدة (${mixes.length})</h3>
    <div class="tbl-wrap"><table class="tbl">
      <tr><th>ID</th><th>الخلطة</th><th>التاريخ</th><th>الكمية</th><th>الحالة</th></tr>
      ${mixes.map(m=>`<tr><td>#${m.id}</td><td>${esc(m.name)}</td><td>${esc(m.date)}</td><td>${fmt(m.output_qty)} ${esc(m.output_unit)}</td>
        <td><span class="badge ${m.status==='executed'?'done':'draft'}">${m.status==='executed'?'منفذة':'مسودة'}</span></td></tr>`).join('')
        || '<tr><td colspan="5" class="empty-row">لا توجد خلطات</td></tr>'}
    </table></div>
    <h3 style="margin-top:14px">🧾 الفواتير (${invs.length})</h3>
    <div class="tbl-wrap"><table class="tbl">
      <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr>
      ${invs.map(v=>`<tr><td>${esc(v.invoice_no)}</td><td>${esc(v.date)}</td><td class="num">${money(v.total)}</td>
        <td><span class="badge ${v.paid?'ok':'low'}">${v.paid?'مدفوعة':'غير مدفوعة'}</span></td></tr>`).join('')
        || '<tr><td colspan="4" class="empty-row">لا توجد فواتير</td></tr>'}
    </table></div>`;
  $('#custDetailPanel').scrollIntoView({behavior:'smooth'});
};

window.delCustomer = async function(id) {
  const c = custById(id);
  if (S.invoices.some(v => v.customer_id === id)) return toast('لا يمكن حذف زبون لديه فواتير', 'err');
  if (!confirm(`حذف الزبون "${c.name}"؟`)) return;
  try { await DB.remove('customers', id); $('#custDetailPanel').style.display='none'; toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
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
        <td><span class="badge ${v.paid?'ok':'low'}">${v.paid?'مدفوعة':'آجلة'}</span></td>
        <td><div class="actions">
          <button class="btn sm" onclick="printInvoice(${v.id})">🖨️ طباعة</button>
          ${canEdit('sales') ? `<button class="btn sm" onclick="saleForm(${v.id})">✏️</button>
          <button class="btn sm" onclick="togglePaid(${v.id})">${v.paid?'↩️':'💵 تسديد'}</button>
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
      <div class="form-row"><label>حالة الدفع</label>
        <select id="f_paid"><option value="1">مدفوعة</option><option value="0" ${v && !v.paid?'selected':''}>آجلة</option></select></div>
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
    paid: $('#f_paid').value === '1',
    notes: $('#f_notes').value.trim()
  };
  try {
    if (id) await DB.update('invoices', id, data);
    else await DB.insert('invoices', data);
    closeModal(); toast(id ? 'تم تعديل الفاتورة ✔' : 'تم إنشاء الفاتورة ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.togglePaid = async function(id) {
  const v = S.invoices.find(x=>x.id===id);
  try { await DB.update('invoices', id, { paid: !v.paid }); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.delInvoice = async function(id) {
  const v = S.invoices.find(x=>x.id===id);
  if (!confirm(`حذف الفاتورة ${v.invoice_no}؟`)) return;
  try { await DB.remove('invoices', id); toast('تم الحذف', 'ok'); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
};

window.printInvoice = function(id) {
  const v = S.invoices.find(x=>x.id===id);
  const c = custById(v.customer_id);
  const m = v.mixture_id ? mixById(v.mixture_id) : null;
  const veh = v.vehicle_id ? S.vehicles.find(x=>x.id===v.vehicle_id) : null;
  $('#printArea').innerHTML = `
    <div class="inv-print">
      <div class="inv-head">
        <div><h1>🏭 مصنع الصبّ</h1><div>فاتورة مبيعات</div></div>
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
      <div class="inv-total">المبلغ النهائي: ${money(v.total)} — ${v.paid?'مدفوعة':'آجلة'}</div>
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
  return { sales, cogs, exps, sals, dfees, profit: sales - cogs - exps - sals };
}

function renderPartners() {
  const from = $('#parFrom').value, to = $('#parTo').value;
  const np = netProfit(from, to);
  const totalPct = S.partners.reduce((s,p)=>s+Number(p.share_pct),0);
  const totalWd = S.partner_withdrawals.reduce((s,w)=>s+Number(w.amount),0);

  $('#parCards').innerHTML = `
    <div class="card ${np.profit>=0?'green':'red'}"><div class="c-label">💰 صافي الربح ${from||to?'(للفترة)':'الكلي'}</div><div class="c-value">${money(np.profit)}</div>
      <div class="c-sub">مبيعات ${fmt(np.sales)} − مواد ${fmt(np.cogs)} − مصاريف ${fmt(np.exps)} − رواتب ${fmt(np.sals)}</div></div>
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
      <tr><td>👑 المالك</td><td>كل شيء: الحسابات، الشركاء والأرباح، وكل الأقسام</td></tr>
      <tr><td>📋 المدير</td><td>متابعة لوحة التحكم والتقارير وكل الأقسام <b>عرضاً فقط</b> دون تعديل</td></tr>
      <tr><td>🧮 المحاسب</td><td>تعديل: المبيعات، الزبائن، المصاريف، الرواتب، النقل — وعرض المواد والخلطات. لا يرى الشركاء ولا الحسابات</td></tr>
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
  partner_withdrawals:'سحوبات الشركاء', employees:'الموظفون', salaries:'الرواتب', profiles:'حسابات الدخول'
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
  material_id:'المادة', mixture_id:'الخلطة', employee_id:'الموظف', partner_id:'الشريك'
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
  const cogs = invs.reduce((s,v)=>s+Number(v.cost),0);
  const sals = salariesTotal(from, to);
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0) + sals;
  const production = mixes.reduce((s,m)=>s+Number(m.output_qty),0);
  const stockValue = S.materials.reduce((s,m)=>s+qtyOf(m.id)*Number(m.unit_price),0);
  const activeCust = new Set(invs.map(v=>v.customer_id)).size;
  const unpaid = invs.filter(v=>!v.paid).reduce((s,v)=>s+Number(v.total),0);
  const profit = sales - cogs - expTotal;

  $('#dashCards').innerHTML = `
    <div class="card blue"><div class="c-label">🏗️ إجمالي الإنتاج</div><div class="c-value">${fmt(production)}</div><div class="c-sub">${mixes.length} خلطة منفذة</div></div>
    <div class="card green"><div class="c-label">🧾 إجمالي المبيعات</div><div class="c-value">${money(sales)}</div><div class="c-sub">${invs.length} فاتورة</div></div>
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
$('#btnAddMixture').onclick = () => mixtureForm(0);
$('#btnAddCustomer').onclick = () => customerForm(0);
$('#btnAddSale').onclick = () => saleForm();
$('#btnAddExpense').onclick = () => expenseForm();
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
  const addBtns = { btnAddMaterial:'materials', btnAddMixture:'mixtures', btnAddCustomer:'customers',
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
