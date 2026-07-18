/* =====================================================
   طبقة البيانات: تعمل بالتخزين المحلي افتراضياً،
   وتتحول تلقائياً إلى Supabase عند إدخال بيانات الربط.
   ===================================================== */
const DB = (() => {
  const TABLES = ['materials','movements','customers','mixtures','mixture_items','invoices','expenses'];
  const LS_KEY = 'casting_factory_data';
  let sb = null;            // عميل Supabase
  let backend = 'local';

  /* ---------- التخزين المحلي ---------- */
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
  }
  function emptyStore() {
    const s = { seq: {} };
    TABLES.forEach(t => { s[t] = []; s.seq[t] = 1; });
    return s;
  }
  let store = loadLocal() || emptyStore();
  TABLES.forEach(t => { if (!store[t]) { store[t] = []; store.seq[t] = store.seq[t] || 1; } });
  function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(store)); }

  /* ---------- إعداد Supabase ---------- */
  // بيانات الاتصال الافتراضية (المفتاح العام آمن للنشر - الصلاحيات تحكمها سياسات RLS)
  const DEFAULT_URL = 'https://mwozysiprckekukebiwa.supabase.co';
  const DEFAULT_KEY = 'sb_publishable_K_gTh4DMb9eg-d5_Y3LS5Q_BIdws6FQ';

  function getConfig() {
    if (localStorage.getItem('sb_off') === '1') return { url: '', key: '' };
    return {
      url: localStorage.getItem('sb_url') || DEFAULT_URL,
      key: localStorage.getItem('sb_key') || DEFAULT_KEY
    };
  }
  function setConfig(url, key) {
    if (url && key) {
      localStorage.removeItem('sb_off');
      localStorage.setItem('sb_url', url); localStorage.setItem('sb_key', key);
    } else {
      localStorage.removeItem('sb_url'); localStorage.removeItem('sb_key');
      localStorage.setItem('sb_off', '1');
    }
  }
  async function connect() {
    const { url, key } = getConfig();
    if (url && key && window.supabase) {
      try {
        sb = window.supabase.createClient(url, key);
        const { error } = await sb.from('materials').select('id').limit(1);
        if (error) throw error;
        backend = 'supabase';
        return true;
      } catch (e) {
        console.warn('فشل الاتصال بـ Supabase:', e.message || e);
        sb = null; backend = 'local';
        return false;
      }
    }
    sb = null; backend = 'local';
    return false;
  }

  /* ---------- العمليات الأساسية ---------- */
  async function list(table) {
    if (backend === 'supabase') {
      const { data, error } = await sb.from(table).select('*').order('id', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    }
    return [...store[table]];
  }

  async function insert(table, obj) {
    if (backend === 'supabase') {
      const { data, error } = await sb.from(table).insert(obj).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
    const row = { ...obj, id: store.seq[table]++, created_at: new Date().toISOString() };
    store[table].push(row);
    saveLocal();
    return row;
  }

  async function update(table, id, patch) {
    if (backend === 'supabase') {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data;
    }
    const row = store[table].find(r => r.id === id);
    if (row) { Object.assign(row, patch); saveLocal(); }
    return row;
  }

  async function remove(table, id) {
    if (backend === 'supabase') {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
      // حذف تسلسلي للجداول التابعة تتكفل به قيود قاعدة البيانات
      return;
    }
    store[table] = store[table].filter(r => r.id !== id);
    // محاكاة الحذف التسلسلي محلياً
    if (table === 'materials') {
      store.movements = store.movements.filter(m => m.material_id !== id);
      store.mixture_items = store.mixture_items.filter(m => m.material_id !== id);
    }
    if (table === 'mixtures') {
      store.mixture_items = store.mixture_items.filter(m => m.mixture_id !== id);
    }
    saveLocal();
  }

  /* ---------- تصدير / استيراد (محلي) ---------- */
  function exportData() { return JSON.stringify(store, null, 2); }
  function importData(json) {
    const parsed = JSON.parse(json);
    if (!parsed.seq || !parsed.materials) throw new Error('ملف غير صالح');
    store = parsed; saveLocal();
  }

  return {
    connect, list, insert, update, remove,
    getConfig, setConfig, exportData, importData,
    get backend() { return backend; }
  };
})();
