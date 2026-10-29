import { useState } from 'react';
import {
  ShieldAlert, TrendingDown, Target, CalendarDays, Clock, Newspaper, Ban, ChevronDown, Flag, Coins,
  Layers, Cpu, Moon, Scale, Receipt, Info, Radar, ExternalLink,
} from 'lucide-react';
import { T } from '../../lib/theme';

/* ==================================================================
   Правила пропа — вигляд для трейдера.

   Зверху — головні числа обраної програми (денний ліміт, просадка,
   ціль), бо їх тримають у голові перед кожною угодою. Далі новини:
   вікно і які інструменти зачіпає кожна валюта. Потім заборони,
   повний звід по темах (розгортки) і останні зміни.

   Дані: { structured, rulebook, built_at } — той самий формат, що
   збирає scripts/ftmo-build.mjs. Без градієнтів: поверхні, лінії,
   один акцент, червоний лише для «не можна».
================================================================== */

const CARD = { background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 20 };
const TOPIC_ICON = {
  'loss-limits': TrendingDown, 'stages-and-goals': Flag, news: Newspaper, 'weekend-and-overnight': Moon,
  'forbidden-practices': Ban, 'software-and-vpn': Cpu, 'payouts-and-funded': Coins, 'scaling-plan': Layers,
  'account-review-and-liquidation': Scale, 'fees-and-refunds': Receipt,
};
const TYPE = { trailing: 'трейлінг', static: 'статична', eod_trailing: 'трейлінг за кінцем дня' };
const CUR = /^([A-Z]{3})\b/;

function Stat({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="min-w-0 rounded-2xl p-4" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>
        <Icon size={14} style={{ color: tone || T.acc }} />{label}
      </div>
      <div className="mt-2 text-[30px] font-bold leading-none tabular-nums" style={{ color: tone || T.text, fontFamily: T.display, letterSpacing: '-0.03em' }}>{value}</div>
      {sub && <div className="mt-1.5 text-[12.5px] leading-[1.45]" style={{ color: T.text3, fontFamily: T.sans }}>{sub}</div>}
    </div>
  );
}

function Section({ icon: Icon, title, hint, children, tone }) {
  return (
    <section style={CARD} className="p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: tone ? `rgba(${T.badRgb},0.12)` : `rgba(${T.accRgb},0.12)` }}>
          <Icon size={18} style={{ color: tone || T.acc }} />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-[17px] font-bold" style={{ color: T.text, fontFamily: T.display }}>{title}</h3>
          {hint && <p className="m-0 mt-0.5 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Line({ k, v }) {
  if (!v) return null;
  return (
    <div className="grid gap-1 border-t py-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4" style={{ borderColor: 'var(--edge-line)' }}>
      <div className="text-[12.5px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>{k}</div>
      <div className="text-[14px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>{v}</div>
    </div>
  );
}

function Topic({ t, open, onToggle }) {
  const Icon = TOPIC_ICON[t.id] || Info;
  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: 'var(--edge-sunken)', border: `1px solid ${open ? `rgba(${T.accRgb},0.35)` : 'var(--edge-line)'}` }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <Icon size={18} className="shrink-0" style={{ color: open ? T.acc : T.text3 }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>{t.title}</span>
          {!open && <span className="block truncate text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>{t.summary}</span>}
        </span>
        <span className="text-[12px] tabular-nums" style={{ color: T.text4 || T.text3, fontFamily: T.mono }}>{(t.points || []).length}</span>
        <ChevronDown size={16} className="shrink-0" style={{ color: T.text3, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {t.summary && <p className="m-0 mb-3 text-[13.5px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>{t.summary}</p>}
          <ul className="m-0 grid list-none gap-2 p-0">
            {(t.points || []).map((x, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-[1.6]" style={{ color: T.text, fontFamily: T.sans }}>
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: T.acc }} />{x}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PropRulesView({ firm = 'FTMO', data, source = 'https://ftmo.com/en/trading-objectives/' }) {
  const s = data?.structured || {};
  const programs = s.programs || [];
  const [pi, setPi] = useState(0);
  const [openTopic, setOpenTopic] = useState(null);
  const p = programs[pi] || programs[0];
  const news = s.restricted_news;
  const topics = data?.rulebook?.topics || [];
  const phases = p?.phases || [];
  const target = phases.filter((f) => f.profit_target_pct).map((f) => `${f.profit_target_pct}%`).join(' → ');

  return (
    <div className="grid gap-4">
      {/* Шапка фірми */}
      <section style={CARD} className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl text-[15px] font-extrabold" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)', color: T.text, fontFamily: T.display }}>{firm.slice(0, 2)}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-bold" style={{ color: T.text, fontFamily: T.display, letterSpacing: '-0.02em' }}>{firm}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>
              <span className="inline-flex items-center gap-1.5"><Radar size={13} style={{ color: T.ok }} />Стежимо за правилами щодня</span>
              {data?.built_at && <span>оновлено {new Date(data.built_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}</span>}
              <a href={source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">сайт пропа <ExternalLink size={11} /></a>
            </div>
          </div>
          {programs.length > 1 && (
            <div className="inline-flex rounded-xl p-1" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
              {programs.map((x, i) => (
                <button key={x.program} type="button" onClick={() => setPi(i)} className="h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors" style={{ fontFamily: T.sans, color: i === pi ? T.text : T.text3, background: i === pi ? 'var(--edge-surface)' : 'transparent', boxShadow: i === pi ? '0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.25)' : 'none' }}>
                  {x.program}
                </button>
              ))}
            </div>
          )}
        </div>

        {p && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={TrendingDown} label="Денний ліміт" value={p.daily_loss_pct != null ? `${p.daily_loss_pct}%` : '—'} sub={p.daily_reset ? `скидання ${p.daily_reset.replace(/^Щодня\s*/i, '')}` : null} />
              <Stat icon={ShieldAlert} label="Макс. просадка" value={p.max_loss_pct != null ? `${p.max_loss_pct}%` : '—'} sub={TYPE[p.max_loss_type] || p.max_loss_type} />
              <Stat icon={Target} label="Ціль прибутку" value={target || '—'} sub={phases.length > 1 ? phases.map((f) => f.name).join(' → ') : null} />
              <Stat icon={CalendarDays} label="Мін. днів торгівлі" value={phases.some((f) => f.min_trading_days) ? phases.map((f) => f.min_trading_days ?? 0).join(' / ') : 'немає'} sub="на кожному етапі" />
            </div>

            {phases.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {phases.map((f, i) => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)', color: T.text2, fontFamily: T.sans }}>
                      {i + 1}. {f.name}{f.profit_target_pct ? ` · ${f.profit_target_pct}%` : ''}
                    </span>
                    <span style={{ color: T.text4 || T.text3 }}>→</span>
                  </div>
                ))}
                <span className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold" style={{ background: `rgba(${T.okRgb},0.1)`, border: `1px solid rgba(${T.okRgb},0.3)`, color: T.ok, fontFamily: T.sans }}>Funded</span>
              </div>
            )}

            <div className="mt-4">
              <Line k="Як рахується денний" v={p.daily_loss_basis} />
              <Line k="Консистентність" v={p.consistency_rule} />
              <Line k="На funded-рахунку" v={p.funded_rules} />
              <Line k="Плече" v={p.leverage} />
              {(p.notes || []).map((n, i) => <Line key={i} k={i ? '' : 'Важливо'} v={n} />)}
            </div>
          </>
        )}
      </section>

      {/* Новини */}
      {news && (
        <Section icon={Newspaper} title="Червоні новини" hint="Коли торгувати не можна і що саме зачіпає кожна подія" tone={T.bad}>
          <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="rounded-2xl p-4 text-center" style={{ background: `rgba(${T.badRgb},0.08)`, border: `1px solid rgba(${T.badRgb},0.3)` }}>
              <Clock size={20} style={{ color: T.bad }} className="mx-auto" />
              <div className="mt-2 text-[26px] font-bold tabular-nums" style={{ color: T.text, fontFamily: T.display }}>−{news.window_min_before} · +{news.window_min_after} хв</div>
              <div className="mt-1 text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>до і після події</div>
            </div>
            <div className="grid content-start gap-2 text-[13.5px] leading-[1.55]" style={{ fontFamily: T.sans }}>
              {news.what_is_restricted && <p className="m-0" style={{ color: T.text }}>{news.what_is_restricted}</p>}
              {(news.applies_to || []).length > 0 && <p className="m-0" style={{ color: T.text2 }}><b style={{ color: T.bad }}>Діє для:</b> {news.applies_to.join('; ')}</p>}
              {(news.exempt || []).length > 0 && <p className="m-0" style={{ color: T.text2 }}><b style={{ color: T.ok }}>Не діє для:</b> {news.exempt.join('; ')}</p>}
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(news.events || []).map((e, i) => {
              const cur = (e.announcement.match(CUR) || [])[1];
              return (
                <div key={i} className="flex gap-3 rounded-xl p-3" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
                  <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg text-[12.5px] font-bold" style={{ fontFamily: T.mono, color: T.text, background: 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>{cur || '•'}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] leading-[1.45]" style={{ color: T.text, fontFamily: T.sans }}>{e.announcement.replace(CUR, '').replace(/^\s*(події|podії)\s*/i, '').replace(/^\(|\)$/g, '')}</div>
                    <div className="mt-1 text-[12px]" style={{ color: T.text3, fontFamily: T.sans }}>Зачіпає: {e.instruments}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {news.penalty && <p className="m-0 mt-3 text-[12.5px]" style={{ color: T.bad, fontFamily: T.sans }}>{news.penalty}</p>}
        </Section>
      )}

      {/* Заборони */}
      {(s.forbidden_practices || []).length > 0 && (
        <Section icon={Ban} title="Що заборонено" hint="За це закривають рахунок або не платять винагороду" tone={T.bad}>
          <div className="grid gap-2.5 md:grid-cols-2">
            {s.forbidden_practices.map((b) => (
              <div key={b.name} className="rounded-xl p-3.5" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
                <div className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>
                  <Ban size={14} style={{ color: T.bad }} className="shrink-0" />{b.name}
                </div>
                <p className="m-0 mt-1.5 text-[13px] leading-[1.55]" style={{ color: T.text2, fontFamily: T.sans }}>{b.explanation}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Загальні правила */}
      <Section icon={Info} title="Вихідні, ПЗ і виплати">
        <Line k="Вихідні й перерви" v={s.weekend_holding} />
        <Line k="Радники (EA)" v={s.ea_allowed} />
        <Line k="VPN / VPS" v={s.vpn_vps} />
        <Line k="Обʼєднання рахунків" v={s.account_merge} />
        <Line k="Перша виплата" v={s.payouts?.first_payout} />
        <Line k="Як часто" v={s.payouts?.frequency} />
        <Line k="Ділення прибутку" v={s.payouts?.split} />
        <Line k="Scaling plan" v={s.payouts?.scaling} />
      </Section>

      {/* Повний звід */}
      {topics.length > 0 && (
        <Section icon={Layers} title="Усі правила по темах" hint="З офіційних умов і довідки пропа, простою мовою">
          <div className="grid gap-2">
            {topics.map((t) => (
              <Topic key={t.id || t.title} t={t} open={openTopic === (t.id || t.title)} onToggle={() => setOpenTopic(openTopic === (t.id || t.title) ? null : (t.id || t.title))} />
            ))}
          </div>
        </Section>
      )}

      {/* Зміни */}
      {(s.recent_changes || []).length > 0 && (
        <Section icon={Clock} title="Останні зміни" hint="Що проп міняв у правилах">
          <div className="relative grid gap-4 pl-5">
            <span className="absolute bottom-1 left-[5px] top-1 w-px" style={{ background: 'var(--edge-line)' }} />
            {s.recent_changes.map((c, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-5 top-1.5 h-[11px] w-[11px] rounded-full" style={{ background: i ? 'var(--edge-surface)' : T.acc, border: `2px solid ${i ? 'var(--edge-line)' : T.acc}` }} />
                <div className="text-[12px] font-semibold tabular-nums" style={{ color: T.text3, fontFamily: T.mono }}>{new Date(`${c.date}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div className="mt-0.5 text-[14px] leading-[1.55]" style={{ color: T.text, fontFamily: T.sans }}>{c.change}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
