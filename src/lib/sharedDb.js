/* ==================================================================
   Клієнт бази для перегляду журналу за посиланням (/view/<токен>/*).

   Той самий прийом, що й у демо (lib/demoDb.js): сторінки не знають,
   що вони в режимі перегляду, — вони роблять звичайні запити, а
   відповідає на них цей клієнт. Тому гість бачить справжній журнал,
   справжню аналітику й справжні аналізи, а не окремо зверстану
   «публічну версію», яка розійшлася б із продуктом за тиждень.

   Дані приходять одним викликом shared_journal(token) і далі живуть у
   памʼяті. Будь-який запис відхиляється тут же, до мережі. Але це
   лише зручність: справжній замок стоїть у базі — анонім не має прав
   писати в чужі таблиці, а функція за токеном нічого, крім читання,
   не вміє.
================================================================== */

import { realSupabase } from './supabase';
import { shareToken } from './sandbox';

/* Підставний id власника. Справжній база не віддає — він гостю ні до
   чого, а сторінки фільтрують за user.id, тож їм потрібен хоч якийсь
   стабільний рядок. */
export const SHARED_USER_ID = 'shared-owner-0000-0000-000000000000';

export const READ_ONLY_MSG = 'Це журнал лише для перегляду';

const READ_ONLY = { message: READ_ONLY_MSG, code: 'READ_ONLY' };

/* Таблиці, які є в документі від бази. Усе, чого тут немає, для гостя
   просто порожнє: налаштування, нотатки, завдання власника гостю не
   показуємо. */
const SNAPSHOT_TABLES = ['trades', 'prop_accounts', 'trading_plans', 'user_state'];

/* Довідники, спільні для всіх, — їх читаємо зі справжньої бази. */
const PASS_THROUGH = ['instruments'];

let snapshotPromise = null;
let snapshotToken = null;

export function loadSnapshot() {
  const token = shareToken();
  if (!token) return Promise.resolve(null);
  if (snapshotPromise && snapshotToken === token) return snapshotPromise;

  snapshotToken = token;
  snapshotPromise = (async () => {
    const { data, error } = await realSupabase.rpc('shared_journal', { p_token: token });
    if (error || !data) return null;
    const stamp = (rows) => (rows || []).map((r) => ({ ...r, user_id: SHARED_USER_ID }));
    return {
      owner: data.owner || {},
      trades: stamp(data.trades),
      prop_accounts: stamp(data.prop_accounts),
      trading_plans: stamp(data.trading_plans),
      user_state: stamp(data.user_state),
    };
  })();
  return snapshotPromise;
}

const sessionFor = (snap) => (snap ? {
  user: {
    id: SHARED_USER_ID,
    email: '',
    email_confirmed_at: null,
    user_metadata: { name: snap.owner?.name || '', full_name: snap.owner?.name || '' },
  },
  access_token: 'shared',
} : null);

/* ---------- будівник запитів ----------

   Та сама підмножина API Supabase, що в демо, плюс `count` і
   `head`: сторінки ними рахують загальну кількість для пагінації. */
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.rangeV = null;
    this.write = false;
    this.one = false;
    this.maybe = false;
    this.wantCount = false;
    this.head = false;
    this.ids = null; /* для свічок: які external_id просили */
  }

  select(_cols, opts = {}) {
    if (opts.count) this.wantCount = true;
    if (opts.head) this.head = true;
    return this;
  }

  insert() { this.write = true; return this; }
  update() { this.write = true; return this; }
  upsert() { this.write = true; return this; }
  delete() { this.write = true; return this; }

  /* user_id ігноруємо: у документі й так лише рядки власника, а
     сторінки просять їх під підставним id. */
  eq(col, val) {
    if (col === 'external_id') this.ids = [String(val)];
    if (col !== 'user_id') this.filters.push((r) => r[col] === val);
    return this;
  }

  in(col, list) {
    if (col === 'external_id') this.ids = (list || []).map(String);
    this.filters.push((r) => (list || []).includes(r[col]));
    return this;
  }

  neq(col, val) { this.filters.push((r) => r[col] !== val); return this; }
  is(col, val) { this.filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return this; }
  gte(col, val) { this.filters.push((r) => r[col] >= val); return this; }
  lte(col, val) { this.filters.push((r) => r[col] <= val); return this; }
  gt(col, val) { this.filters.push((r) => r[col] > val); return this; }
  lt(col, val) { this.filters.push((r) => r[col] < val); return this; }

  ilike(col, pat) {
    const src = String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
    const re = new RegExp(`^${src}$`, 'i');
    this.filters.push((r) => re.test(String(r[col] ?? '')));
    return this;
  }

  not(col, op, val) {
    if (op === 'is' && val === null) this.filters.push((r) => r[col] != null);
    else if (op === 'eq') this.filters.push((r) => r[col] !== val);
    else if (op === 'in') {
      const list = Array.isArray(val) ? val : String(val).replace(/[()]/g, '').split(',');
      this.filters.push((r) => !list.includes(r[col]));
    }
    return this;
  }

  /* "a.eq.1,b.ilike.%x%" — розбираємо рівність, is, neq та ilike. */
  or(expr) {
    const parts = String(expr).split(',').map((x) => x.trim()).filter(Boolean);
    const tests = parts.map((p) => {
      const [col, op, ...rest] = p.split('.');
      const raw = rest.join('.');
      const val = raw === 'null' ? null : raw;
      if (op === 'is') return (r) => (val === null ? r[col] == null : String(r[col]) === val);
      if (op === 'neq') return (r) => String(r[col]) !== val;
      if (op === 'ilike') {
        const re = new RegExp(`^${String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
        return (r) => re.test(String(r[col] ?? ''));
      }
      return (r) => String(r[col]) === val;
    });
    if (tests.length) this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }

  contains(col, val) {
    const want = Array.isArray(val) ? val : [val];
    this.filters.push((r) => Array.isArray(r[col]) && want.every((v) => r[col].includes(v)));
    return this;
  }

  match(obj) {
    Object.entries(obj || {}).forEach(([k, v]) => { if (k !== 'user_id') this.filters.push((r) => r[k] === v); });
    return this;
  }

  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n) { this.limitN = n; return this; }
  range(a, b) { this.rangeV = [a, b]; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; this.maybe = true; return this; }
  abortSignal() { return this; }

  async rows() {
    if (PASS_THROUGH.includes(this.table)) return null;

    if (this.table === 'trade_candles') {
      const ids = this.ids || [];
      if (!ids.length) return [];
      const { data, error } = await realSupabase.rpc('shared_candles', {
        p_token: shareToken(), p_ids: ids,
      });
      return error ? [] : (data || []);
    }

    /* Профіль «підтверджений»: інакше Layout показав би гостю вікно
       «підтвердь пошту» від чужого імені. */
    if (this.table === 'profiles') {
      return [{ id: SHARED_USER_ID, email_verified: true, verified_at: null }];
    }

    if (!SNAPSHOT_TABLES.includes(this.table)) return [];
    const snap = await loadSnapshot();
    return snap ? snap[this.table] || [] : [];
  }

  async run() {
    if (this.write) return { data: null, error: READ_ONLY, count: null };

    /* Довідник — прямо зі справжньої бази, з тими самими фільтрами
       не заморочуємось: сторінки читають його цілим. */
    if (PASS_THROUGH.includes(this.table)) {
      return realSupabase.from(this.table).select('*');
    }

    let out = (await this.rows()).filter((r) => this.filters.every((f) => f(r)));
    const count = out.length;

    this.orders.forEach(({ col, asc }) => {
      out = [...out].sort((a, b) => {
        const x = a[col]; const y = b[col];
        if (x === y) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x > y ? 1 : -1) * (asc ? 1 : -1);
      });
    });

    if (this.rangeV) out = out.slice(this.rangeV[0], this.rangeV[1] + 1);
    if (this.limitN != null) out = out.slice(0, this.limitN);

    const extra = this.wantCount ? { count } : {};
    if (this.head) return { data: null, error: null, ...extra };

    if (this.one) {
      const row = out[0] ?? null;
      if (!row && !this.maybe) return { data: null, error: { message: 'Рядок не знайдено', code: 'PGRST116' }, ...extra };
      return { data: row, error: null, ...extra };
    }

    return { data: out, error: null, ...extra };
  }

  then(resolve, reject) {
    return this.run().catch((e) => ({ data: null, error: e })).then(resolve, reject);
  }
}

/* Незнайомий метод не валить сторінку — повертає той самий запит. */
const forgiving = (q) => new Proxy(q, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === 'string' && !prop.startsWith('_')) return () => forgiving(target);
    return undefined;
  },
});

export const sharedClient = {
  from: (table) => forgiving(new Query(table)),

  rpc: async (fn) => {
    /* Pro-перевірки в режимі перегляду ні на що не впливають: гість
       нічого не створює. «Ні» — найбезпечніша відповідь. */
    if (fn === 'is_pro') return { data: false, error: null };
    return { data: null, error: READ_ONLY };
  },

  auth: {
    getSession: async () => ({ data: { session: sessionFor(await loadSnapshot()) }, error: null }),
    getUser: async () => ({ data: { user: sessionFor(await loadSnapshot())?.user || null }, error: null }),
    onAuthStateChange: (cb) => {
      loadSnapshot().then((snap) => cb(snap ? 'SIGNED_IN' : 'SIGNED_OUT', sessionFor(snap)));
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    /* «Вийти» з чужого журналу — це просто піти з нього. */
    signOut: async () => {
      if (typeof window !== 'undefined') window.location.href = '/';
      return { error: null };
    },
    updateUser: async () => ({ data: null, error: READ_ONLY }),
    signInWithPassword: async () => ({ data: null, error: READ_ONLY }),
    signUp: async () => ({ data: null, error: READ_ONLY }),
    signInWithOtp: async () => ({ data: null, error: READ_ONLY }),
    resetPasswordForEmail: async () => ({ data: null, error: READ_ONLY }),
    resend: async () => ({ data: null, error: READ_ONLY }),
  },

  /* Картинки в журналі лежать публічними адресами — їх показуємо як є.
     Завантажити чи видалити щось гість не може. */
  storage: {
    from: (bucket) => ({
      upload: async () => ({ data: null, error: READ_ONLY }),
      remove: async () => ({ data: null, error: READ_ONLY }),
      getPublicUrl: (p) => realSupabase.storage.from(bucket).getPublicUrl(p),
    }),
  },

  functions: {
    invoke: async () => ({ data: null, error: READ_ONLY }),
  },

  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
    return ch;
  },
  removeChannel: () => {},
};
