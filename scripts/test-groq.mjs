// Одноразовий тест Groq: node scripts/test-groq.mjs [модель]
import fs from 'node:fs';

let key = process.env.QROQ_API_KEY || process.env.GROQ_API_KEY;
if (!key) {
  try {
    const envContent = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const match = envContent.match(/(?:QROQ_API_KEY|GROQ_API_KEY)\s*=\s*(['"]?)([^'"\s]+)\1/);
    if (match) key = match[2];
  } catch (e) {}
}

if (!key) { 
  console.error('Ключа QROQ_API_KEY або GROQ_API_KEY у .env не знайдено'); 
  process.exit(1); 
}

// Актуальна модель за замовчуванням
const model = process.argv[2] || 'openai/gpt-oss-20b';
const t0 = Date.now();

const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model, 
    temperature: 0, 
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [{ 
      role: 'user', 
      content: 'Текст: "Денний ліміт збитку 5% від початкового балансу, загальна просадка 10%, торгівля на новинах дозволена." Витягни правила. Відповідай ЛИШЕ JSON: {"daily_loss_pct":5,"max_loss_pct":10,"news_trading":"allowed"}' 
    }],
  }),
});

const body = await r.json().catch(() => ({}));
console.log('status', r.status, 'модель', model, 'мс', Date.now() - t0);
console.log(r.ok ? body.choices?.[0]?.message?.content : JSON.stringify(body, null, 2));
console.log('usage', JSON.stringify(body.usage || {}));
console.log('ліміти', ['x-ratelimit-limit-requests','x-ratelimit-limit-tokens','x-ratelimit-remaining-tokens'].map((h) => `${h}=${r.headers.get(h)}`).join(' '));