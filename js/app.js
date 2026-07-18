/* =====================================================
   نظام إدارة مصنع الصبّ - منطق التطبيق
   ===================================================== */

// ---------- الحالة العامة ----------
const S = { materials:[], movements:[], customers:[], mixtures:[], mixture_items:[], invoices:[], expenses:[] };
let CUR = localStorage.getItem('currency') || 'د.ع';

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
  const results = await Promise.all(tables.map(t => DB.list(t)));
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
  ({dashboard:renderDashboard, materials:renderMaterials, mixtures:renderMixtures,
    customers:renderCustomers, sales:renderSales, expenses:renderExpenses,
    reports:renderReports, settings:renderSettings}[page] || (()=>{}))();
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
        <td><div class="actions">
          <button class="btn sm primary" onclick="supplyForm(${m.id})">➕ توريد</button>
          <button class="btn sm" onclick="issueForm(${m.id})">➖ صرف</button>
          <button class="btn sm" onclick="materialForm(${m.id})">✏️</button>
          <button class="btn sm danger" onclick="delMaterial(${m.id})">🗑️</button>
        </div></td>
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
      </tr>`;
    }).join('');
  $('#movTable').innerHTML = `
    <tr><th>التاريخ</th><th>المادة</th><th>النوع</th><th>الكمية</th><th>سعر الوحدة</th><th>ملاحظة</th></tr>
    ${movs || '<tr><td colspan="6" class="empty-row">لا توجد حركات</td></tr>'}`;
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
        <td><div class="actions">
          ${m.status!=='executed' ? `<button class="btn sm primary" onclick="executeMixture(${m.id})">▶️ تنفيذ</button>
          <button class="btn sm" onclick="mixtureForm(${m.id})">✏️</button>` : ''}
          <button class="btn sm danger" onclick="delMixture(${m.id})">🗑️</button>
        </div></td>
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
  modal(m ? 'تعديل خلطة' : 'خلطة جديدة', `
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
    <div class="form-row"><label>المكونات (من المخزون)</label>
      <div id="ingList"></div>
      <button class="btn sm" onclick="addIngRow()">➕ إضافة مكوّن</button>
    </div>
    <div class="calc-box" id="mixCalc"></div>
    <div class="form-row" style="margin-top:12px"><label>ملاحظات</label><input id="f_notes" value="${esc(m?.notes||'')}"></div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveMixture(${id||0})">💾 حفظ الخلطة</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
  $('#ingList').innerHTML = '';
  ingCounter = 0;
  if (items.length) items.forEach(i => addIngRow(i.material_id, i.qty));
  else addIngRow();
  recalcMix();
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
  const ings = readIngredients();
  if (!ings.length) return toast('أضف مكوّناً واحداً على الأقل', 'err');
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
      // إعادة بناء المكونات
      for (const it of mixItems(id)) await DB.remove('mixture_items', it.id);
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
          <button class="btn sm" onclick="customerForm(${c.id})">✏️</button>
          <button class="btn sm danger" onclick="delCustomer(${c.id})">🗑️</button>
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
      return `<tr>
        <td><b>${esc(v.invoice_no)}</b></td>
        <td>${esc(v.date)}</td>
        <td>${esc(c?c.name:'—')}</td>
        <td>${m?esc(m.name):'—'}</td>
        <td class="num">${fmt(v.qty)}</td>
        <td class="num">${money(v.cost)}</td>
        <td class="num">${fmt(v.margin_pct)}%</td>
        <td class="num"><b>${money(v.total)}</b></td>
        <td><span class="badge ${v.paid?'ok':'low'}">${v.paid?'مدفوعة':'آجلة'}</span></td>
        <td><div class="actions">
          <button class="btn sm" onclick="printInvoice(${v.id})">🖨️ طباعة</button>
          <button class="btn sm" onclick="togglePaid(${v.id})">${v.paid?'↩️':'💵 تسديد'}</button>
          <button class="btn sm danger" onclick="delInvoice(${v.id})">🗑️</button>
        </div></td>
      </tr>`;
    }).join('');
  $('#saleTable').innerHTML = `
    <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الزبون</th><th>الخلطة</th><th>الكمية</th><th>الكلفة</th><th>هامش الربح</th><th>المبلغ النهائي</th><th>الدفع</th><th>إجراءات</th></tr>
    ${rows || '<tr><td colspan="10" class="empty-row">لا توجد فواتير بعد</td></tr>'}`;
}
$('#saleSearch').oninput = renderSales;

window.saleForm = function() {
  if (!S.customers.length) return toast('أضف زبوناً أولاً', 'err');
  const executed = S.mixtures.filter(m => m.status === 'executed');
  modal('فاتورة جديدة', `
    <div class="form-grid">
      <div class="form-row"><label>رقم الفاتورة</label><input id="f_no" value="${nextInvoiceNo()}" dir="ltr"></div>
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${today()}"></div>
    </div>
    <div class="form-row"><label>الزبون *</label>
      <select id="f_cust">${S.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div class="form-row"><label>الخلطة (المنفذة فقط)</label>
      <select id="f_mix" onchange="saleRecalc()">
        <option value="">— بيع بدون خلطة —</option>
        ${executed.map(m=>`<option value="${m.id}">${esc(m.name)} (#${m.id}) — ${fmt(m.output_qty)} ${esc(m.output_unit)}</option>`).join('')}
      </select></div>
    <div class="form-grid">
      <div class="form-row"><label>الكمية المباعة</label><input id="f_qty" type="number" min="0" step="any" oninput="saleRecalc()"></div>
      <div class="form-row"><label>الكلفة (${CUR})</label><input id="f_cost" type="number" min="0" step="any" oninput="saleRecalc(true)"></div>
      <div class="form-row"><label>هامش الربح %</label><input id="f_margin" type="number" step="any" value="20" oninput="saleRecalc(true)"></div>
      <div class="form-row"><label>المبلغ النهائي (${CUR})</label><input id="f_total" type="number" min="0" step="any"></div>
    </div>
    <div class="calc-box" id="saleCalc">اختر خلطة لحساب الكلفة تلقائياً من المواد الخام.</div>
    <div class="form-grid" style="margin-top:12px">
      <div class="form-row"><label>حالة الدفع</label>
        <select id="f_paid"><option value="1">مدفوعة</option><option value="0">آجلة</option></select></div>
      <div class="form-row"><label>ملاحظات</label><input id="f_notes"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveSale()">💾 إنشاء الفاتورة</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
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
  const total = cost * (1 + margin/100);
  $('#f_total').value = total.toFixed(2);
  $('#saleCalc').innerHTML = `الكلفة: <b>${money(cost)}</b> + هامش <b>${fmt(margin)}%</b> = المبلغ النهائي: <b>${money(total)}</b>`;
};

window.saveSale = async function() {
  const custId = Number($('#f_cust').value);
  const total = Number($('#f_total').value)||0;
  if (!custId) return toast('اختر الزبون', 'err');
  if (total <= 0) return toast('أدخل مبلغ الفاتورة', 'err');
  try {
    await DB.insert('invoices', {
      invoice_no: $('#f_no').value.trim() || nextInvoiceNo(),
      date: $('#f_date').value || today(),
      customer_id: custId,
      mixture_id: Number($('#f_mix').value) || null,
      qty: Number($('#f_qty').value)||0,
      cost: Number($('#f_cost').value)||0,
      margin_pct: Number($('#f_margin').value)||0,
      total,
      paid: $('#f_paid').value === '1',
      notes: $('#f_notes').value.trim()
    });
    closeModal(); toast('تم إنشاء الفاتورة ✔', 'ok'); await refresh();
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
      </div>
      <table>
        <tr><th>البيان</th><th>الكمية</th><th>الكلفة</th><th>هامش الربح</th><th>المبلغ</th></tr>
        <tr>
          <td>${m?esc(m.name):'بيع مباشر'}</td>
          <td>${fmt(v.qty)} ${m?esc(m.output_unit):''}</td>
          <td>${money(v.cost)}</td>
          <td>${fmt(v.margin_pct)}%</td>
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
      <td><div class="actions"><button class="btn sm danger" onclick="delExpense(${e.id})">🗑️</button></div></td>
    </tr>`).join('');
  $('#expTable').innerHTML = `
    <tr><th>التاريخ</th><th>الفئة</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr>
    ${rows || '<tr><td colspan="5" class="empty-row">لا توجد مصاريف مسجلة</td></tr>'}`;
}

window.expenseForm = function() {
  modal('مصروف جديد', `
    <div class="form-grid">
      <div class="form-row"><label>التاريخ</label><input id="f_date" type="date" value="${today()}"></div>
      <div class="form-row"><label>الفئة</label>
        <select id="f_cat">${EXP_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="form-row"><label>المبلغ (${CUR}) *</label><input id="f_amount" type="number" min="0" step="any"></div>
      <div class="form-row"><label>ملاحظة</label><input id="f_note"></div>
    </div>
    <div class="form-actions">
      <button class="btn primary" onclick="saveExpense()">💾 حفظ</button>
      <button class="btn ghost" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveExpense = async function() {
  const amount = Number($('#f_amount').value);
  if (!amount || amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  try {
    await DB.insert('expenses', { date: $('#f_date').value||today(), category: $('#f_cat').value, amount, note: $('#f_note').value.trim() });
    closeModal(); toast('تم الحفظ ✔', 'ok'); await refresh();
  } catch(e) { toast('خطأ: '+e.message, 'err'); }
};
window.delExpense = async function(id) {
  if (!confirm('حذف هذا المصروف؟')) return;
  try { await DB.remove('expenses', id); await refresh(); }
  catch(e) { toast('خطأ: '+e.message, 'err'); }
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
  const cogs = invs.reduce((s,v)=>s+Number(v.cost),0);
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0);
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
    <div class="card red"><div class="c-label">💸 المصاريف</div><div class="c-value">${money(expTotal)}</div></div>
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
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0);

  // استهلاك المواد ضمن الفترة (حركات الصرف)
  const outMovs = S.movements.filter(m => m.type==='out' && ((!from && !to) || inRange(m.date, from, to)));
  const consumption = {};
  outMovs.forEach(mv => {
    consumption[mv.material_id] = (consumption[mv.material_id]||0) + Number(mv.qty);
  });

  const expByCat = {};
  exps.forEach(e => expByCat[e.category] = (expByCat[e.category]||0) + Number(e.amount));

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

// ---------- بدء التشغيل ----------
(async function init() {
  await DB.connect();
  updateBadge();
  await loadAll();
  renderDashboard();
})();
