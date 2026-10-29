// Правила проп-фірм зі спарсених сторінок → src/dev/prop-rules/<id>.json
//   node scripts/prop-build.mjs the5ers            — одна фірма (structured + rulebook)
//   node scripts/prop-build.mjs all                — усі, в яких є prop-scraper/out/<id>
//   node scripts/prop-build.mjs ftmo rulebook      — лише одна частина
// Вхід: prop-scraper/out/<id>/*.txt (crawl_ftmo.py для FTMO, crawl_props.py для решти).
// Далі: node scripts/prop-rules-push.mjs — у базу з порівнянням з попередньою версією.
// Ключ GEMINI_API_KEY — з .env, на екран не друкується.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRUCT, BOOK } from '../netlify/functions/_propVersion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const KEY = env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY в .env немає'); process.exit(1); }
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

/* Назва для промпта і сторінка «сайт пропа» на картці. */
const FIRMS = {
  ftmo: { name: 'FTMO', source: 'https://ftmo.com/en/trading-objectives/' },
  fundingpips: { name: 'FundingPips', source: 'https://help.fundingpips.com/hc/en-us' },
  the5ers: { name: 'The5ers', source: 'https://the5ers.com/faqs/' },
  alphacapital: { name: 'Alpha Capital', source: 'https://help.alphacapitalgroup.uk/en/' },
  blueguardian: { name: 'Blue Guardian', source: 'https://help.blueguardian.com/en/' },
  cryptofundtrader: { name: 'CryptoFundTrader', source: 'https://cryptofundtrader.com/evaluation-rules/' },
};
/* Скільки тексту віддаємо в один запит (≈4 символи на токен). */
const CAP = 380_000;
/* Що підняти нагору, а що відкинути: старі моделі, акції, конкурси. */
const UP = /rule|objective|drawdown|loss|news|weekend|overnight|consisten|payout|reward|profit|target|phase|step|challenge|evaluation|instant|prohibit|forbidden|leverage|scal|ea|expert|copy|hedg|gambl|lot|inactiv|account-model|program|stake|growth|bootcamp|term/i;
const DOWN = /legacy|bnpl|buy-now|competition|tournament|promo|giveaway|discount|coupon|affiliate|refer|kyc|invoice|futures/i;

async function ask(prompt, max = 24000) {
  let last;
  for (let a = 0; a < 6; a += 1) {
    const model = MODELS[a % MODELS.length];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: max } }),
      signal: AbortSignal.timeout(170_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const b = await r.json().catch(() => ({}));
    if (r.ok) {
      const t = b.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      console.log(`  ${model}: ок, вхід ${b.usageMetadata?.promptTokenCount} ток.`);
      try { const j = JSON.parse(t.replace(/^```json\s*|\s*```$/g, '')); return Array.isArray(j) && j.length === 1 ? j[0] : j; } catch { last = `${model}: обрізаний JSON`; console.log('  повтор:', last); continue; }
    }
    last = `${model} ${r.status}`; console.log('  повтор:', last);
    await new Promise((s) => { setTimeout(s, 8000 * (a + 1)); });
  }
  throw new Error(last);
}

function corpus(id, re) {
  const dir = path.join(root, 'prop-scraper/out', id);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const head = raw.slice(0, 400);
    const key = `${f} ${(head.match(/^TITLE: (.*)$/m) || [])[1] || ''}`;
    const score = (UP.test(key) ? 2 : 0) + (re && re.test(key) ? 3 : 0) - (DOWN.test(key) ? 5 : 0);
    return { f, raw, score };
  }).filter((x) => x.score > -3).sort((a, b) => b.score - a.score || a.raw.length - b.raw.length);
  let out = ''; let used = 0;
  for (const x of files) {
    if (out.length + x.raw.length > CAP) continue;
    out += `##### ${x.f}\n${x.raw}\n\n`; used += 1;
  }
  console.log(`  сторінок ${used}/${files.length}, символів ${out.length}`);
  return out;
}

const [arg = 'all', part] = process.argv.slice(2);
const ids = arg === 'all' ? Object.keys(FIRMS).filter((id) => fs.existsSync(path.join(root, 'prop-scraper/out', id))) : [arg];
fs.mkdirSync(path.join(root, 'src/dev/prop-rules'), { recursive: true });
for (const id of ids) {
  const f = FIRMS[id];
  if (!f) { console.error('невідома фірма:', id); continue; }
  const outFile = path.join(root, 'src/dev/prop-rules', `${id}.json`);
  const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  const next = { ...prev, id, firm: f.name, source: f.source };
  console.log(`== ${f.name}`);
  try {
    if (part !== 'rulebook') { next.structured = await ask(STRUCT(f.name) + corpus(id, /rule|objective|news|drawdown|program|step|stake|growth|bootcamp|instant|update|change/i)); }
    if (part !== 'structured') { next.rulebook = await ask(BOOK(f.name) + corpus(id, /term|rule|prohibit|forbidden|payout|news|weekend/i)); }
  } catch (e) { console.error(`  ${f.name}: не вийшло — ${e.message}`); continue; }
  next.built_at = new Date().toISOString();
  fs.writeFileSync(outFile, JSON.stringify(next, null, 1));
  console.log(`  збережено: програм ${next.structured?.programs?.length ?? '—'}, тем ${next.rulebook?.topics?.length ?? '—'}`);
}
