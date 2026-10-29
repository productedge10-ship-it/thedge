// Спільне для правил пропів, які бачить юзер (prop_rule_versions):
// промпти збірки, хеш змісту і різниця в числах між версіями.
// Користуються: scripts/prop-build.mjs, scripts/prop-rules-push.mjs і монітор
// (_propRules.mjs → publishVersion після кожної перезбірки фірми).
import crypto from 'node:crypto';

/* id фірми як у src/lib/brokers.js — за назвою з монітора («Funding Pips» → fundingpips). */
const IDS = { ftmo: 'ftmo', fundingpips: 'fundingpips', the5ers: 'the5ers', alphacapital: 'alphacapital', alphacapitalgroup: 'alphacapital', blueguardian: 'blueguardian', cryptofundtrader: 'cryptofundtrader' };
export const firmIdOf = (name) => IDS[String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')] || null;

export const STRUCT = (firm) => `Ти аналітик правил проп-фірми ${firm}. Нижче тексти її сайту й довідки. Витягни ВСІ актуальні правила в один JSON. Беремо лише програми, які зараз продаються (не legacy/архівні, не futures). Нічого не вигадуй: чого немає в тексті — null. Пояснення — українською, простою мовою, коротко.
{
 "programs":[{"program":"коротка назва програми, як на сайті","phases":[{"name":"","profit_target_pct":0,"min_trading_days":0,"time_limit_days":null}],"daily_loss_pct":0,"daily_loss_basis":"як рахується","daily_reset":"коли скидається","max_loss_pct":0,"max_loss_type":"static|trailing|eod_trailing","consistency_rule":"текст або null","funded_rules":"що змінюється на funded","leverage":"текст","notes":["…"]}],
 "restricted_news":{"window_min_before":null,"window_min_after":null,"applies_to":["які типи рахунків"],"exempt":["кого не стосується"],"what_is_restricted":"які дії","events":[{"announcement":"назва події","instruments":"які інструменти"}],"penalty":"наслідок"},
 "forbidden_practices":[{"name":"","explanation":"суть простими словами","penalty":""}],
 "weekend_holding":"правило","vpn_vps":"правило","ea_allowed":"правило","account_merge":"правило",
 "payouts":{"first_payout":"","frequency":"","split":"","scaling":"scaling plan"},
 "recent_changes":[{"date":"YYYY-MM-DD","change":"1 речення: що змінилось","details":"детально простою мовою, 3-6 речень: що саме було і що стало, з якої дати, кого стосується (які програми/рахунки), що трейдеру тепер робити інакше","affects":["програми або типи рахунків"],"source":"URL сторінки, де про це написано"}]  // лише зміни правил/умов за останні місяці, про які прямо написано в текстах; свіжі зверху
}
Якщо новинного обмеження немає — restricted_news.what_is_restricted = "немає обмежень", events = [].

ТЕКСТИ:
`;
export const BOOK = (firm) => `Зроби з офіційних текстів ${firm} «rulebook для трейдера»: правила по темах, ПРОСТОЮ українською, коротко і точно, нічого не вигадуй. Лише чинні програми (не legacy, не futures). Для кожної теми 3-8 пунктів. Поверни JSON:
{"topics":[{"id":"loss-limits","title":"Ліміти збитку","summary":"1 речення","points":["…"],"sources":["URL"]}]}
id тем: loss-limits, stages-and-goals, news, weekend-and-overnight, forbidden-practices, software-and-vpn, payouts-and-funded, scaling-plan, account-review-and-liquidation, fees-and-refunds, other. Тему без даних — пропусти.

ТЕКСТИ:
`;


/* Хеш лише від змісту правил: дата збірки не має робити «нову версію». */
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
export const hashRules = (d) => crypto.createHash('sha256').update(JSON.stringify(sortKeys({ s: d.structured, r: d.rulebook }))).digest('hex');

/* Що змінилось у числах програм — те, що юзер тримає в голові. */
const NUM = { daily_loss_pct: 'денний ліміт', max_loss_pct: 'макс. просадка', max_loss_type: 'тип просадки', daily_reset: 'скидання' };
export function versionDiff(oldD, newD) {
  const out = [];
  const byName = (d) => Object.fromEntries((d?.structured?.programs || []).map((p) => [p.program, p]));
  const a = byName(oldD); const b = byName(newD);
  for (const name of Object.keys(b)) {
    if (!a[name]) { out.push({ program: name, field: 'програма', old: null, new: 'нова' }); continue; }
    for (const [k, label] of Object.entries(NUM)) if (String(a[name][k] ?? '') !== String(b[name][k] ?? '')) out.push({ program: name, field: label, old: a[name][k] ?? null, new: b[name][k] ?? null });
    const ph = (p) => (p.phases || []).map((f) => `${f.profit_target_pct ?? '—'}%/${f.min_trading_days ?? 0}д`).join(' → ');
    if (ph(a[name]) !== ph(b[name])) out.push({ program: name, field: 'етапи (ціль/дні)', old: ph(a[name]), new: ph(b[name]) });
  }
  for (const name of Object.keys(a)) if (!b[name]) out.push({ program: name, field: 'програма', old: 'була', new: null });
  return out;
}

