import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, History, ShieldAlert, Newspaper, ChevronDown, Search } from 'lucide-react';
import { T } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import PropRulesSoon from '../components/accounts/PropRulesSoon';
import FtmoDevPreview from '../components/accounts/FtmoDevPreview';
import { loadPropContext, programsFor, rulesForAccount, ruleText, sameFirm, openPropChange } from '../lib/propRules';

/* ==================================================================
   «Правила мого пропа».

   Коротка сводка чинних правил для кожного активного проп-рахунку:
   те, що треба тримати в голові перед угодою, — ліміти, новини,
   вихідні. Дані — з prop_rules (монітор + схвалення адміном), тож
   вони оновлюються самі, коли проп щось міняє.

   Програму (2-Step, Stellar 1-Step…) людина обирає тут один раз: у
   однієї фірми правила різних програм відрізняються в рази.
================================================================== */

const CARD = { background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 18 };

const ROWS = [
  ['daily_loss_pct', 'Денний ліміт', (v) => (v == null ? '—' : `${v}%`)],
  ['daily_loss_basis', 'Рахується'],
  ['daily_reset', 'Скидання'],
  ['max_loss_pct', 'Загальна просадка', (v) => (v == null ? '—' : `${v}%`)],
  ['max_loss_type', 'Тип просадки'],
  ['funded_daily_loss_pct', 'Денний на funded', (v) => (v == null ? null : `${v}%`)],
  ['funded_max_loss_pct', 'Загальна на funded', (v) => (v == null ? null : `${v}%`)],
  ['phases', 'Етапи'],
  ['news_trading', 'Новини'],
  ['news_window_min', 'Вікно навколо новин', (v) => (v == null ? null : `${v} хв до і після`)],
  ['weekend_holding', 'Через вихідні'],
  ['ea_allowed', 'Радники (EA)'],
  ['consistency_rule', 'Консистентність'],
  ['max_leverage_fx', 'Плече FX'],
  ['profit_split_pct', 'Ділення прибутку', (v) => (v == null ? null : `${v}%`)],
  ['inactivity_days', 'Неактивність', (v) => (v == null ? null : `закриття після ${v} днів`)],
];

function RulesCard({ acc, ctx, onProgram }) {
  const programs = programsFor(ctx, acc.firm_name);
  const r = rulesForAccount(ctx, acc);
  const rules = r?.rules;
  const changes = ctx.changes.filter((c) => sameFirm(acc.firm_name, c.firm) && (!r || c.program === r.program));

  return (
    <div style={CARD} className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text }}>{acc.firm_name}</span>
        {acc.initial_balance ? <span className="text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>${Number(acc.initial_balance).toLocaleString('uk-UA')}</span> : null}
        {programs.length > 0 && (
          <select
            value={acc.rules_program || (programs.length === 1 ? programs[0] : '')}
            onChange={(e) => onProgram(acc, e.target.value)}
            className="ml-auto h-9 rounded-lg px-3 text-[13px] outline-none"
            style={{ background: 'var(--edge-sunken)', color: T.text, border: '1px solid var(--edge-line)', fontFamily: T.sans }}
          >
            {!acc.rules_program && programs.length > 1 && <option value="">Обери програму…</option>}
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {!programs.length && (
        <p className="text-[14px]" style={{ color: T.text3, fontFamily: T.sans }}>
          Правил цієї фірми в нас ще немає. Ми стежимо за FTMO, FundedNext і Funding Pips; інші додаємо поступово. Ліміти рахунку можна вписати вручну в <Link to="/accounts" className="underline">Рахунках</Link>.
        </p>
      )}
      {programs.length > 0 && !rules && (
        <p className="text-[14px]" style={{ color: T.text3, fontFamily: T.sans }}>Обери програму свого рахунку, щоб побачити правила.</p>
      )}

      {rules && (
        <>
          {rules.discontinued && (
            <div className="mb-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: 'rgba(var(--edge-warn-rgb),0.08)', border: '1px solid rgba(var(--edge-warn-rgb),0.3)', color: T.warn, fontFamily: T.sans }}>
              Цієї програми більше немає на сайті фірми. Для вже куплених рахунків правила зазвичай лишаються старими.
            </div>
          )}
          <div className="grid gap-x-6 sm:grid-cols-2">
            {ROWS.map(([f, label, fmt]) => {
              const raw = rules[f];
              const essential = ['daily_loss_pct', 'max_loss_pct', 'news_trading', 'weekend_holding'].includes(f);
              if ((raw == null || raw === '') && !essential) return null;
              const v = raw == null || raw === '' ? '—' : (fmt ? fmt(raw) : ruleText(f, raw));
              return (
                <div key={f} className="flex items-baseline justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid var(--edge-line)' }}>
                  <span className="text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>{label}</span>
                  <span className="text-right text-[14px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>{v}</span>
                </div>
              );
            })}
          </div>
          {Array.isArray(rules.notes) && rules.notes.length > 0 && (
            <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px]" style={{ color: T.text2, fontFamily: T.sans }}>
              {rules.notes.slice(0, 8).map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          <p className="mt-4 text-[12px]" style={{ color: T.text4, fontFamily: T.sans }}>
            Звірено з сайтом {r.firm} {new Date(r.approved_at).toLocaleDateString('uk-UA')}. Остаточне джерело — кабінет пропа: старі рахунки можуть мати попередні правила.
          </p>
        </>
      )}

      {changes.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: T.text4, fontFamily: T.sans }}>
            <History size={14} /> Останні зміни
          </div>
          <div className="flex flex-col gap-1.5">
            {changes.slice(0, 5).map((c) => (
              <button key={c.id} type="button" onClick={() => openPropChange(c)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px]"
                style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)', fontFamily: T.sans }}>
                {c.severity === 'major' && <ShieldAlert size={15} style={{ color: T.warn }} />}
                <span style={{ color: T.text3 }}>{new Date(c.decided_at || c.created_at).toLocaleDateString('uk-UA')}</span>
                <span className="min-w-0 flex-1 truncate" style={{ color: T.text }}>{c.program}: {(c.diff || []).map((d) => d.label).join(', ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* Питання-відповіді по фірмі: Gemini збирає їх з усіх сторінок правил і
   довідки пропа (prop_faq), монітор оновлює, коли щось змінюється. */
function FirmFaq({ firm, items, status }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const topics = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k ? items.filter((i) => `${i.question} ${i.answer}`.toLowerCase().includes(k)) : items;
    const m = new Map();
    list.forEach((i) => { if (!m.has(i.topic)) m.set(i.topic, []); m.get(i.topic).push(i); });
    return [...m.entries()];
  }, [items, q]);
  if (!items.length) return null;
  return (
    <div style={CARD} className="mt-4 p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <span className="text-[17px] font-bold" style={{ fontFamily: T.display, color: T.text }}>{firm}: питання й відповіді</span>
      </div>
      <p className="mb-4 mt-0 text-[12.5px]" style={{ color: T.text4, fontFamily: T.sans }}>
        Зібрано з {status?.pages_relevant || 'усіх'} сторінок правил і довідки {firm}
        {status?.checked_at ? ` · перевірено ${new Date(status.checked_at).toLocaleDateString('uk-UA')}` : ''}
        {status?.last_change_at ? ` · остання зміна правил ${new Date(status.last_change_at).toLocaleDateString('uk-UA')}` : ''}
      </p>
      <label className="mb-4 flex h-10 items-center gap-2 rounded-xl px-3" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
        <Search size={15} style={{ color: T.text4 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук: новини, вихідні, EA, виплати…"
          className="h-full w-full bg-transparent text-[14px] outline-none" style={{ color: T.text, fontFamily: T.sans }} />
      </label>
      <div className="flex flex-col gap-5">
        {topics.map(([topic, list]) => (
          <div key={topic}>
            <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wider" style={{ color: T.text4, fontFamily: T.sans }}>{topic}</div>
            <div className="flex flex-col gap-1.5">
              {list.map((i) => {
                const on = open === i.id;
                return (
                  <div key={i.id} className="overflow-hidden rounded-xl" style={{ background: 'var(--edge-sunken)', border: `1px solid ${on ? 'var(--edge-line-hi)' : 'var(--edge-line)'}` }}>
                    <button type="button" onClick={() => setOpen(on ? null : i.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                      <span className="min-w-0 flex-1 text-[14px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>{i.question}</span>
                      <ChevronDown size={16} style={{ color: T.text3, transform: on ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                    </button>
                    {on && (
                      <div className="px-4 pb-3.5">
                        <p className="m-0 text-[14px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>{i.answer}</p>
                        {(i.programs?.length > 0 || i.source_urls?.length > 0) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ fontFamily: T.sans }}>
                            {i.programs?.length > 0 && <span style={{ color: T.text4 }}>{i.programs.join(', ')}</span>}
                            {i.source_urls?.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="underline" style={{ color: T.text3 }}>джерело</a>)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!topics.length && <p className="m-0 text-[13.5px]" style={{ color: T.text3 }}>Нічого не знайдено.</p>}
      </div>
    </div>
  );
}


/* Звід усіх правил фірми «по поличках» (prop_rulebook): розділи →
   правила → значення по програмах. Розділи згорнуті, крім першого. */
function FirmBook({ firm, book }) {
  const [open, setOpen] = useState(0);
  const sections = book?.content?.sections || [];
  if (!sections.length) return null;
  return (
    <div style={CARD} className="mt-4 p-5 sm:p-6">
      <div className="mb-1 text-[17px] font-bold" style={{ fontFamily: T.display, color: T.text }}>{firm}: усі правила</div>
      <p className="mb-4 mt-0 text-[12.5px]" style={{ color: T.text4, fontFamily: T.sans }}>
        {sections.reduce((n, s) => n + s.items.length, 0)} правил з сайту й довідки {firm} · оновлено {new Date(book.updated_at).toLocaleDateString('uk-UA')}
      </p>
      <div className="flex flex-col gap-2">
        {sections.map((s, si) => {
          const on = open === si;
          return (
            <div key={s.topic} className="overflow-hidden rounded-xl" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
              <button type="button" onClick={() => setOpen(on ? -1 : si)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="text-[14.5px] font-bold" style={{ color: T.text, fontFamily: T.sans }}>{s.topic}</span>
                <span className="text-[12px]" style={{ color: T.text4 }}>{s.items.length}</span>
                <ChevronDown size={16} className="ml-auto" style={{ color: T.text3, transform: on ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </button>
              {on && (
                <div className="flex flex-col gap-3 px-4 pb-4">
                  {s.items.map((it, ii) => (
                    <div key={ii} style={{ borderTop: ii ? '1px solid var(--edge-line)' : 'none', paddingTop: ii ? 12 : 0 }}>
                      <div className="text-[14px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>{it.title}</div>
                      {it.text && <p className="mb-0 mt-1 text-[13.5px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>{it.text}</p>}
                      {Object.keys(it.values || {}).length > 0 && (
                        <div className="mt-2 grid gap-1 sm:grid-cols-2">
                          {Object.entries(it.values).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-3 rounded-lg px-3 py-1.5 text-[13px]" style={{ background: 'var(--edge-surface)', fontFamily: T.sans }}>
                              <span style={{ color: T.text3 }}>{k}</span><span className="text-right font-semibold" style={{ color: T.text }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(it.programs?.length > 0 || it.sources?.length > 0) && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[12px]" style={{ fontFamily: T.sans }}>
                          {it.programs?.length > 0 && <span style={{ color: T.text4 }}>{it.programs.join(', ')}</span>}
                          {it.sources?.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="underline" style={{ color: T.text3 }}>джерело</a>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Поки монітор не наповнений — «Coming Soon». Увімкнути: VITE_PROP_RULES_LIVE=1;
   подивитись справжню сторінку до релізу — додати ?live=1 в адресу.
   У dev-режимі (localhost) завжди справжня сторінка + блок «що спарсено з FTMO». */
const LIVE = import.meta.env.DEV || import.meta.env.VITE_PROP_RULES_LIVE === '1';

export default function PropRulesPage() {
  const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('live') === '1';
  if (!LIVE && !preview) return <PropRulesSoon />;
  return <PropRulesLive />;
}

function PropRulesLive() {
  const { user } = useAuth();
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    let alive = true;
    loadPropContext(user?.id).then((d) => { if (alive) setCtx(d); });
    return () => { alive = false; };
  }, [user?.id]);

  const onProgram = async (acc, program) => {
    await supabase.from('prop_accounts').update({ rules_program: program || null }).eq('id', acc.id).eq('user_id', user.id);
    setCtx(await loadPropContext(user.id, true));
  };

  const upcoming = (ctx?.news || []).filter((n) => n.day >= new Date().toISOString().slice(0, 10)).slice(0, 10);

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        kicker="Рахунки"
        title="Правила мого пропа"
        subtitle="Ми щодня звіряємо правила з сайтами пропів. Коли щось змінюється, ти дізнаєшся першим."
      />

      {import.meta.env.DEV && <FtmoDevPreview />}

      {!ctx && <div className="py-16 text-center text-[14px]" style={{ color: T.text3 }}>Завантажую…</div>}

      {ctx && !ctx.accounts.length && (
        <div style={CARD} className="flex flex-col items-start gap-3 p-6">
          <FileCheck2 size={22} style={{ color: T.acc }} />
          <p className="m-0 text-[15px]" style={{ color: T.text2, fontFamily: T.sans }}>Немає активних проп-рахунків. Додай рахунок і обери фірму — тут з'являться її правила.</p>
          <Link to="/accounts" className="rounded-xl px-4 py-2.5 text-[14px] font-bold" style={{ background: T.acc, color: '#0A0A0C' }}>До рахунків</Link>
        </div>
      )}

      {ctx && ctx.accounts.length > 0 && (
        <div className={`grid gap-4 ${ctx.accounts.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {ctx.accounts.map((a) => <RulesCard key={a.id} acc={a} ctx={ctx} onProgram={onProgram} />)}
        </div>
      )}

      {ctx && (ctx.books || []).map((b) => <FirmBook key={b.firm} firm={b.firm} book={b} />)}

      {ctx && [...new Set(ctx.faq.map((f) => f.firm))].map((firm) => (
        <FirmFaq key={firm} firm={firm} items={ctx.faq.filter((f) => f.firm === firm)} status={ctx.status.find((x) => x.firm === firm)} />
      ))}

      {upcoming.length > 0 && (
        <div style={CARD} className="mt-4 p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2 text-[15px] font-bold" style={{ color: T.text, fontFamily: T.display }}>
            <Newspaper size={17} style={{ color: T.bad }} /> Заборонені новини найближчим часом
          </div>
          <div className="flex flex-col gap-1.5">
            {upcoming.map((n) => (
              <div key={`${n.firm}${n.day}${n.currency}${n.title}`} className="flex flex-wrap items-center gap-3 text-[13.5px]" style={{ fontFamily: T.sans }}>
                <span className="w-[86px]" style={{ color: T.text3 }}>{new Date(`${n.day}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="w-[42px] font-bold" style={{ color: T.text2, fontFamily: T.mono }}>{n.currency}</span>
                <span className="min-w-0 flex-1" style={{ color: T.text }}>{n.title}</span>
                <span className="text-[12px]" style={{ color: T.bad }}>{n.firm}</span>
              </div>
            ))}
          </div>
          <p className="mb-0 mt-3 text-[12px]" style={{ color: T.text4, fontFamily: T.sans }}>Точний час — у <Link to="/news" className="underline">Календарі новин</Link>, такі події там позначені.</p>
        </div>
      )}
    </div>
  );
}
