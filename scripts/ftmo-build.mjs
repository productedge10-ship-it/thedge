// Збирає зі спарсених сторінок FTMO структуровані правила + rulebook:
//   node scripts/ftmo-build.mjs [structured|rulebook]
// Вхід: prop-scraper/out/ftmo/*.txt (python prop-scraper/crawl_ftmo.py)
// Вихід: src/dev/prop-rules/ftmo.json (показується на /prop-rules лише в dev-режимі)
// Ключ GEMINI_API_KEY — з .env, на екран не друкується.
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const KEY = env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY в .env немає'); process.exit(1); }
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const dir = path.join(root, 'prop-scraper/out/ftmo');
const outFile = path.join(root, 'src/dev/prop-rules/ftmo.json');
const all = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const pick = (re, limit = 99) => all.filter((f) => re.test(f)).slice(0, limit).map((f) => `##### ${f}\n${read(f)}`).join('\n\n');

async function ask(prompt, max = 24000) {
  let last;
  for (let a = 0; a < 6; a += 1) {
    const model = MODELS[a % MODELS.length];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: max } }),
      signal: AbortSignal.timeout(150_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }) }));
    const b = await r.json().catch(() => ({}));
    if (r.ok) {
      const t = b.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      console.log(`  ${model}: ок, вхід ${b.usageMetadata?.promptTokenCount} ток.`);
      return JSON.parse(t.replace(/^```json\s*|\s*```$/g, ''));
    }
    last = `${model} ${r.status}`; console.log('  повтор:', last);
    await new Promise((s) => { setTimeout(s, 4000); });
  }
  throw new Error(last);
}

const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const mode = process.argv[2] || 'structured';

if (mode === 'structured') {
  const text = [
    pick(/^page__(trading-objectives|challenge|1-step|2-step|instant|forbidden|reward|how-it-works|comparison)/),
    pick(/^faq__faq-(can-i|how-does-your-consistency|what-is-the-difference|what-are-the-trading|what-is-the-swing|how-do-the-different|how-do-i-withdraw|what-is-the-discipline|what-are-the-account|which-instruments)/),
    pick(/^update__blog-trading-updates-trading-update-(\d+-(oct|sep|aug)-2026)/, 10),
  ].join('\n\n');
  console.log('structured: символів', text.length);
  const out = await ask(`Ти аналітик правил проп-фірми FTMO (CFD). Нижче повні тексти її сторінок. Витягни ВСІ правила в один JSON. Нічого не вигадуй, чого немає в тексті — null. Усі пояснення — українською, простою мовою.
{
 "programs":[{"program":"1-Step|2-Step|Instant Account|…","phases":[{"name":"","profit_target_pct":0,"min_trading_days":0,"time_limit_days":null}],"daily_loss_pct":0,"daily_loss_basis":"текст","daily_reset":"","max_loss_pct":0,"max_loss_type":"static|trailing|…","consistency_rule":"текст","funded_rules":"що змінюється на funded","leverage":"текст","notes":["…"]}],
 "restricted_news":{"window_min_before":2,"window_min_after":2,"applies_to":["які типи рахунків"],"exempt":["які типи рахунків не стосується"],"what_is_restricted":"які дії (ордери, SL/TP…)","events":[{"announcement":"назва події","instruments":"які інструменти зачеплені"}],"penalty":"наслідок"},
 "forbidden_practices":[{"name":"","explanation":"суть простими словами","penalty":""}],
 "weekend_holding":"правило","vpn_vps":"правило","ea_allowed":"правило","account_merge":"правило",
 "payouts":{"first_payout":"","frequency":"","split":"","scaling":"текст про scaling plan"},
 "recent_changes":[{"date":"YYYY-MM-DD","change":"що змінилось у правилах/умовах за останні тижні, лише про правила"}]
}

ТЕКСТИ:
${text}`);
  fs.writeFileSync(outFile, JSON.stringify({ ...prev, built_at: new Date().toISOString(), structured: out }, null, 1));
  console.log('збережено structured, програм:', out.programs?.length, 'подій новин:', out.restricted_news?.events?.length, 'заборон:', out.forbidden_practices?.length);
}

if (mode === 'rulebook') {
  const text = [pick(/^page__terms-and-conditions/), pick(/^page__(forbidden|trading-objectives)/), pick(/^faq__faq-(can-i|how-does-your|what-is-the-swing|is-the-entry|what-fees|why-is-there)/)].join('\n\n');
  console.log('rulebook: символів', text.length);
  const out = await ask(`Зроби з офіційних умов FTMO «rulebook для трейдера»: повні правила, розкладені по темах, ПРОСТОЮ українською, коротко і точно, нічого не вигадуй (чого немає в тексті — не пиши). Для кожної теми 3-8 пунктів-тверджень. Поверни JSON:
{"topics":[{"id":"loss-limits","title":"Ліміти збитку","icon":"shield","summary":"1 речення","points":["пункт","…"],"sources":["URL або назва розділу"]}]}
Теми: Ліміти збитку, Етапи й цілі, Новини, Вихідні й овернайт, Заборонені практики, Радники/ПЗ/VPN, Виплати й funded, Scaling plan, Перевірка й ліквідація рахунку, Комісії й повернення внеску, Інші важливі умови.

ТЕКСТИ:
${text}`);
  fs.writeFileSync(outFile, JSON.stringify({ ...prev, built_at: new Date().toISOString(), rulebook: out }, null, 1));
  console.log('збережено rulebook, тем:', out.topics?.length);
}
