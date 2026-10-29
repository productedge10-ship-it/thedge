/* global process */
/* ==================================================================
   «Спитай про правила»: відповідь лише з правил обраного пропа.

   POST { firm, question } з токеном юзера (Authorization: Bearer).
   Правила беремо з бази (prop_rule_versions, поточна версія). Поки
   їх там нема (розробка) — з тіла запиту (rules), урізані.
   Відповідь — Gemini, температура 0, «не знаю», якщо в правилах
   цього нема. Лише для Pro; ліміт — 30 питань на добу на людину.
================================================================== */

const URL_ = (process.env.SUPABASE_PUBLIC_URL || 'https://hlqqzftlsrjxbtaqbsif.supabase.co').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_PUBLIC_KEY || 'sb_publishable_AwLC44Ia4JR7JHNzW3u6aQ_4NltmCDK';
const MODELS = String(process.env.GEMINI_MODELS || 'gemini-3.6-flash,gemini-3.5-flash-lite').split(',').map((m) => m.trim()).filter(Boolean);
const PER_DAY = 30;
const used = new Map(); // user → { day, n }

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'Відповіді тимчасово недоступні' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const me = token ? await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  if (!me?.id) return res.status(401).json({ error: 'Увійди, щоб питати' });

  /* Лише Pro: is_pro() у базі читає підписку того, чий токен. */
  const pro = await fetch(`${URL_}/rest/v1/rpc/is_pro`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' })
    .then((r) => (r.ok ? r.json() : false)).catch(() => false);
  if (pro !== true) return res.status(403).json({ error: 'Питання до правил — у Pro' });

  const day = new Date().toISOString().slice(0, 10);
  const u = used.get(me.id);
  const n = u?.day === day ? u.n : 0;
  if (n >= PER_DAY) return res.status(429).json({ error: `Ліміт ${PER_DAY} питань на добу. Завтра — знову.` });

  const body = await readBody(req);
  const firm = String(body.firm || '').slice(0, 40);
  const question = String(body.question || '').trim().slice(0, 500);
  if (!firm || question.length < 3) return res.status(400).json({ error: 'Напиши питання' });

  const rows = await fetch(`${URL_}/rest/v1/prop_rule_versions?select=firm,data&firm_id=eq.${encodeURIComponent(firm)}&is_current=eq.true`, { headers: { apikey: ANON } })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const data = rows?.[0]?.data || (body.rules && typeof body.rules === 'object' ? body.rules : null);
  if (!data) return res.status(404).json({ error: 'Правил цього пропа ще нема' });
  const name = rows?.[0]?.firm || body.name || firm;
  const ctx = JSON.stringify({ structured: data.structured, rulebook: data.rulebook }).slice(0, 90000);

  const prompt = `Ти помічник трейдера. Відповідай ЛИШЕ на основі правил проп-фірми ${name} нижче (JSON). Простою українською, 1-5 речень, конкретно (числа, програми). Якщо відповідь залежить від програми — скажи для яких. Якщо в правилах цього нема — так і скажи: "У правилах ${name}, які ми зібрали, цього нема — перевір на їхньому сайті". Нічого не вигадуй.

ПРАВИЛА:
${ctx}

ПИТАННЯ: ${question}`;

  let answer = null; let last = '';
  for (const model of [...MODELS, ...MODELS]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 800 } }),
      signal: AbortSignal.timeout(40_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const b = await r.json().catch(() => ({}));
    if (r.ok) { answer = b.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim(); if (answer) break; }
    last = `${model} ${r.status}`;
    if (![0, 429, 500, 502, 503, 504].includes(r.status)) break;
  }
  if (!answer) return res.status(502).json({ error: 'Не вдалось отримати відповідь, спробуй ще раз', detail: last });
  used.set(me.id, { day, n: n + 1 });
  return res.status(200).json({ answer, left: PER_DAY - n - 1 });
}
