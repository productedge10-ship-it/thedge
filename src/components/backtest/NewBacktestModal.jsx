import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ArrowRight, ArrowLeft, CandlestickChart, NotebookPen, Check } from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { ACT } from './accent';
import AssetPicker from './AssetPicker';
import HistoryDatePicker from './HistoryDatePicker';
import { t as tx } from '../../lib/lang';

/* ==================================================================
   Створення бектесту.

   Ліворуч чотири поля, праворуч — жива картка того, що вийде. Друга
   колонка існує не для краси: людина бачить, як виглядатиме бектест
   у списку, ще до того, як натисне «Створити», і не створює три
   однакові «Тест 1» через тиждень.

   Геометрія з макета редизайну, кольори — проєктні токени.
================================================================== */


const mono = (size, extra = {}) => ({ fontFamily: T.mono, fontSize: size, ...extra });

const money = (n) => `$${Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')}`;

/* ------------------------------------------------------------------
   Поле з підписом, що спливає.

   Підпис усередині поля, а не над ним: рядок «Назва» їде вгору й
   зменшується, щойно поле отримує фокус або текст. Заповнене поле
   лишається підписаним, а звичайний плейсхолдер зникає разом із
   підказкою.

   Підписи два, і вони перетікають один в одного.

   Спершу це був один елемент, який на льоту міняв кегль, шрифт,
   регістр і розрядку. Анімувати такий набір неможливо: браузер
   плавно веде тільки розмір, а гарнітура й UPPERCASE перемикаються
   миттєво — на кожному фокусі підпис смикався й перескакував.

   Тому нижній (великий, sans) і верхній (дрібний, моноширинний,
   капсом) існують окремо й лише міняються прозорістю та зсувом.
   Обидві властивості браузер анімує на композиторі, тому перехід
   рівний, а кожен підпис лишається рівно таким, як задумано.
------------------------------------------------------------------ */
/* Крива руху підпису.

   Була cubic-bezier(.22,1,.36,1) — це «швидко рвонув і довго
   доїжджає». На короткій відстані в сім пікселів уся швидкість
   припадає на перші два кадри, і замість плавного підняття видно
   ривок угору.

   Тут навпаки: рух починається мʼяко, розганяється в середині й
   гальмує в кінці. Плюс довша тривалість — на такій дистанції
   0.26s читається як клац, 0.38s як рух.

   Прозорість іде тією ж кривою й стільки ж: коли підпис зникав
   швидше, ніж доїжджав, він встигав розчинитись у повітрі. */
const FLOAT_EASE = 'cubic-bezier(.45,0,.15,1)';
const FLOAT_MS = 380;

function FloatField({ label, value, onChange, onKeyDown, placeholder, autoFocus, prefix, mono: isMono, list }) {
  const [focus, setFocus] = useState(false);
  const up = focus || !!String(value ?? '').length;

  return (
    <div
      style={{
        position: 'relative',
        height: 64,
        borderRadius: 14,
        background: T.sunken,
        border: `1px solid ${focus ? ACT.to : T.line}`,
        boxShadow: focus ? `0 0 0 4px rgba(${ACT.rgb},0.13)` : 'none',
        transition: 'border-color .18s, box-shadow .18s',
      }}
      onMouseEnter={(e) => { if (!focus) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (!focus) e.currentTarget.style.borderColor = T.line; }}
    >
      {/* спокій — великий підпис по центру */}
      <span
        className="pointer-events-none absolute"
        style={{
          left: 16,
          top: '50%',
          fontFamily: T.sans,
          fontSize: 15,
          color: T.text3,
          opacity: up ? 0 : 1,
          transform: `translateY(-50%) translateY(${up ? -9 : 0}px)`,
          transition: `opacity ${FLOAT_MS}ms ${FLOAT_EASE}, transform ${FLOAT_MS}ms ${FLOAT_EASE}`,
        }}
      >
        {label}
      </span>

      {/* фокус або текст — дрібний підпис угорі */}
      <span
        className="pointer-events-none absolute uppercase"
        style={{
          left: 16,
          top: 11,
          ...mono(9.5, { letterSpacing: '1.8px', fontWeight: 600 }),
          color: focus ? 'var(--edge-acc)' : T.text3,
          opacity: up ? 1 : 0,
          transform: `translateY(${up ? 0 : 9}px)`,
          transition: `opacity ${FLOAT_MS}ms ${FLOAT_EASE}, transform ${FLOAT_MS}ms ${FLOAT_EASE}, color .2s ease`,
        }}
      >
        {label}
      </span>

      <div className="flex h-full items-end" style={{ padding: '0 16px 8px' }}>
        {prefix && (
          <span
            style={{
              ...mono(15, { color: T.text3, paddingBottom: 1 }),
              opacity: up ? 1 : 0,
              /* Ширину зводимо в нуль разом із прозорістю, інакше
                 невидимий «$» усе одно тримає місце й текст стоїть
                 із відступом на порожньому полі. */
              width: up ? 'auto' : 0,
              overflow: 'hidden',
              transition: `opacity ${FLOAT_MS}ms ${FLOAT_EASE}`,
            }}
          >
            {prefix}
          </span>
        )}
        <input
          list={list}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          /* Плейсхолдер лише коли підпис уже вгорі, інакше два сірі
             рядки стоять один на одному. */
          placeholder={up ? placeholder : ''}
          /* edge-field-input знімає внутрішнє кільце фокуса: рамка
             поля вже сама світлішає (див. style контейнера вище),
             друге кільце поверх неї виглядало як подвійний бордер. */
          className="edge-field-input min-w-0 flex-1 bg-transparent outline-none"
          style={{
            paddingLeft: prefix && up ? 8 : 0,
            transition: `padding-left ${FLOAT_MS}ms ${FLOAT_EASE}`,
            paddingBottom: 0,
            color: T.text,
            ...(isMono
              ? mono(17, { fontWeight: 600, letterSpacing: '0.4px' })
              : { fontFamily: T.sans, fontSize: 15.5, fontWeight: 500 }),
          }}
        />
      </div>
    </div>
  );
}


/* ================================================================== */

const PRESETS = ['1 000', '10 000', '50 000', '100 000'];

/* Ряд кнопок-варіантів з підписом (ризик, таймфрейм). */
function Choice({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col" style={{ gap: 7 }}>
      <span className="uppercase" style={mono(9.5, { letterSpacing: '1.8px', fontWeight: 600, color: T.text3 })}>{label}</span>
      <div className="flex flex-wrap" style={{ gap: 7 }}>
        {options.map(([val, text]) => {
          const on = value === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onChange(val)}
              style={{
                height: 36, minWidth: 52, padding: '0 12px', borderRadius: 9,
                ...mono(11.5, { fontWeight: 600 }),
                color: on ? T.text : T.text2,
                background: on ? `rgba(${ACT.rgb},0.18)` : 'rgba(255,255,255,0.03)',
                boxShadow: `inset 0 0 0 1px ${on ? `rgba(${ACT.rgb},0.47)` : T.line}`,
                transition: 'all .16s',
              }}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Два способи вести бектест — перший крок форми. */
const MODES = [
  {
    id: 'chart',
    icon: CandlestickChart,
    title: () => tx('На реальному графіку', 'On a real chart'),
    desc: () => tx('Реплей справжніх свічок свічка за свічкою. Угоди, скріншоти й знімки входу пишуться самі.', 'Replay real candles bar by bar. Trades, screenshots and entry snapshots are saved for you.'),
    points: () => [tx('Хвилинні свічки за роки історії', 'Years of 1-minute candles'), tx('Без підглядання в майбутнє', 'No peeking into the future'), tx('Продовжуєш з того місця, де зупинився', 'Resume where you stopped')],
    badge: () => tx('Рекомендовано', 'Recommended'),
  },
  {
    id: 'manual',
    icon: NotebookPen,
    title: () => tx('Ручний журнал', 'Manual log'),
    desc: () => tx('Торгуєш у TradingView чи MT5, а угоди записуєш сюди. Статистика рахується так само.', 'Trade in TradingView or MT5 and log trades here. Stats are computed the same way.'),
    points: () => [tx('Швидкий запис угоди в один рядок', 'One-line quick trade entry'), tx('Скріни з буфера чи посилання TV', 'Screenshots from clipboard or a TV link'), tx('Будь-який актив', 'Any asset')],
  },
];

const TF_CHOICES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const RISKS = ['0.5', '1', '2'];

export default function NewBacktestModal({ saving, onClose, onCreate, initialMode = null, strategies = [] }) {
  const [mode, setMode] = useState(initialMode);
  const [f, setF] = useState({
    name: '',
    pair: initialMode === 'chart' ? 'XAUUSD' : 'EURUSD',
    strategy_name: '',
    initial_balance: '10000',
    riskPct: '1',
    tf: 'M15',
    start: '',
  });
  const set = (p) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const dep = Number(String(f.initial_balance).replace(/[^\d.]/g, '')) || 0;
  const risk = Number(f.riskPct) > 0 ? Number(f.riskPct) : 1;
  const canSave = !!mode && f.name.trim() && dep > 0;
  const submit = () => {
    if (!canSave || saving) return;
    const settings = mode === 'chart'
      ? { riskPct: risk, tf: f.tf, ...(f.start ? { start: f.start } : {}) }
      : { riskPct: risk };
    onCreate({ name: f.name, pair: f.pair, strategy_name: f.strategy_name.trim(), initial_balance: dep, mode, settings });
  };
  const pickMode = (m) => { setMode(m); if (m === 'chart' && f.pair === 'EURUSD' && !f.name) set({ pair: 'XAUUSD' }); };

  const rows = [
    { k: tx('Ризик на угоду', 'Risk per trade'), v: `${risk}%`, acc: true },
    { k: tx('1R у грошах', '1R in cash'), v: money((dep * risk) / 100), acc: true },
    { k: tx('Депозит', 'Deposit'), v: money(dep) },
    ...(mode === 'chart' ? [
      { k: tx('Таймфрейм', 'Timeframe'), v: f.tf },
      { k: tx('Старт реплею', 'Replay start'), v: f.start ? f.start.split('-').reverse().join('.') : tx('обереш на графіку', 'pick on chart') },
    ] : []),
  ];

  /* Портал у body, а не рендер на місці: <main> сторінки має свій
     stacking context (position: relative; z-index: 0), і будь-який
     z-index усередині нього порівнюється з мобільною шапкою
     застосунку (z-60) вже програно — модалка опинялась намальованою
     ПІД нею, а не поверх. Портал виносить її з цієї пастки зовсім,
     так само як в TradeModal і TradeDetailsModal. */
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center sm:overflow-y-auto sm:p-6"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        /* На телефоні — аркуш знизу: виїжджає з-під пальця, займає
           всю ширину й прокручується всередині, а кнопки лишаються
           внизу під рукою. З sm — звична модалка по центру. */
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.3, ease: EASE }}
        /* max-h у dvh рахується від справжнього вʼюпорту, а не від
           контейнера, у якому фактично лежить цей fixed-шар (мобільна
           шапка застосунку зменшує його висоту). При довгій формі
           аркуш через це виростав вище своєї коробки, і назва
           «Новий бектест» ховалась під шапкою. calc(100% - …) рахує
           від реального контейнера, тому так не станеться. */
        className="relative flex max-h-[calc(100%-16px)] w-full flex-col rounded-t-[22px] sm:my-auto sm:max-h-none sm:rounded-[26px]"
        style={{
          maxWidth: 820,
          background: T.surface,
          border: `1px solid ${T.lineHi}`,
          boxShadow: '0 44px 100px -34px #000',
        }}
      >
        {/* ручка аркуша — лише на телефоні */}
        <span aria-hidden className="mx-auto mt-2.5 block h-1 w-10 shrink-0 rounded-full sm:hidden" style={{ background: T.lineHi }} />

        <div className="flex shrink-0 items-center justify-between gap-4 px-4 pb-3.5 pt-3 sm:gap-5 sm:px-[26px] sm:py-[22px]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              {mode && !initialMode && (
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  aria-label={tx('Назад до вибору', 'Back')}
                  className="grid h-8 w-8 place-items-center rounded-[10px] transition-colors hover:bg-white/10"
                  style={{ color: T.text2 }}
                >
                  <ArrowLeft size={16} strokeWidth={2.2} />
                </button>
              )}
              <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 600, letterSpacing: '-0.4px', color: T.text }}>
                {tx('Новий бектест', 'New backtest')}
              </div>
              {mode && (
                <span style={{ ...mono(10, { letterSpacing: '1.2px', fontWeight: 700 }), padding: '4px 8px', borderRadius: 7, color: 'var(--edge-acc)', background: `rgba(${ACT.rgb},0.16)`, border: `1px solid rgba(${ACT.rgb},0.35)`, textTransform: 'uppercase' }}>
                  {mode === 'chart' ? tx('графік', 'chart') : tx('журнал', 'log')}
                </span>
              )}
            </div>
            {!mode && (
              <div style={{ fontFamily: T.sans, fontSize: 13, color: T.text3, marginTop: 4 }}>
                {tx('Як будеш бектестити?', 'How will you backtest?')}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label={tx('Закрити', 'Close')}
            className="grid shrink-0 place-items-center"
            style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.03)', color: T.text2, transition: 'background .18s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        {!mode && (
          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:gap-4 sm:p-[26px]" style={{ borderTop: `1px solid ${T.line}` }}>
            {MODES.map((m) => {
              const Icon = m.icon;
              const hero = m.id === 'chart';
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickMode(m.id)}
                  className="group relative flex flex-col items-start overflow-hidden text-left transition-all duration-200 active:scale-[0.99]"
                  style={{
                    padding: 22, borderRadius: 20, gap: 12,
                    background: hero ? `linear-gradient(160deg, rgba(${ACT.rgb},0.16), ${T.surface} 60%)` : T.sunken,
                    border: `1px solid ${hero ? `rgba(${ACT.rgb},0.45)` : T.line}`,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = `rgba(${ACT.rgb},0.75)`; e.currentTarget.style.boxShadow = `0 24px 50px -28px #000, 0 0 0 4px rgba(${ACT.rgb},0.08)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = hero ? `rgba(${ACT.rgb},0.45)` : T.line; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="grid place-items-center" style={{ width: 46, height: 46, borderRadius: 14, color: hero ? '#fff' : T.text, background: hero ? `linear-gradient(180deg, ${ACT.from}, ${ACT.to})` : 'rgba(255,255,255,0.05)', border: hero ? 'none' : `1px solid ${T.lineHi}` }}>
                      <Icon size={22} strokeWidth={2} />
                    </span>
                    {m.badge && (
                      <span style={{ ...mono(9.5, { letterSpacing: '1.4px', fontWeight: 700 }), textTransform: 'uppercase', padding: '5px 8px', borderRadius: 7, color: 'var(--edge-acc)', background: `rgba(${ACT.rgb},0.16)` }}>
                        {m.badge()}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', color: T.text, marginTop: 4 }}>{m.title()}</div>
                  <div style={{ fontFamily: T.sans, fontSize: 13.5, lineHeight: 1.5, color: T.text2 }}>{m.desc()}</div>
                  <ul className="flex flex-col" style={{ gap: 7, marginTop: 2 }}>
                    {m.points().map((p) => (
                      <li key={p} className="flex items-center" style={{ gap: 8, fontFamily: T.sans, fontSize: 12.5, color: T.text3 }}>
                        <Check size={13} strokeWidth={2.6} style={{ color: hero ? 'var(--edge-acc)' : T.text3 }} /> {p}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto flex items-center pt-2" style={{ gap: 6, fontFamily: T.sans, fontSize: 13.5, fontWeight: 600, color: hero ? 'var(--edge-acc)' : T.text }}>
                    {tx('Обрати', 'Choose')} <ArrowRight size={15} strokeWidth={2.2} className="transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {mode && (
        <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain sm:overflow-visible lg:grid-cols-[1fr_282px]" style={{ borderTop: `1px solid ${T.line}` }}>

          <div
            className="flex flex-col gap-3 p-4 sm:gap-3.5 sm:p-[26px] lg:border-r"
            style={{ borderColor: T.line }}
          >
            <FloatField
              label={tx('Назва бектесту', 'Backtest name')}
              value={f.name}
              onChange={(v) => set({ name: v })}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Silver Bullet · London · Q3"
              autoFocus
            />

            {/* Той самий вибір активу, що й у записі угоди: один
                список і одні власні тікери, тому обраний тут актив
                далі стоїть у формі за замовчуванням без сюрпризів. */}
            <AssetPicker value={f.pair} onChange={(v) => set({ pair: v })} height={56} />

            <FloatField
              label={tx('Торгова система · не обовʼязково', 'Trading system · optional')}
              value={f.strategy_name}
              onChange={(v) => set({ strategy_name: v })}
              placeholder="SFP, ORB, Silver Bullet…"
              list="edge-bt-strategies"
            />
            <datalist id="edge-bt-strategies">
              {[...new Set([...strategies, 'Silver Bullet', 'SFP', 'ORB', 'ICT 2022', 'Turtle Soup'])].map((x) => <option key={x} value={x} />)}
            </datalist>

            <div>
              <FloatField
                label={tx('Стартовий депозит', 'Starting deposit')}
                value={f.initial_balance}
                onChange={(v) => set({ initial_balance: v.replace(/[^\d]/g, '') })}
                prefix="$"
                mono
              />

              {/* На вузькому екрані чотири суми в ряд не влазять —
                  стають сіткою 2×2 замість обрізаних «$100 0…». */}
              <div className="grid grid-cols-2 min-[400px]:grid-cols-4" style={{ gap: 7, marginTop: 9 }}>
                {PRESETS.map((p) => {
                  const val = p.replace(/\s/g, '');
                  const on = String(f.initial_balance).replace(/[^\d]/g, '') === val;
                  return (
                    <button
                      key={p}
                      onClick={() => set({ initial_balance: val })}
                      className="flex items-center justify-center"
                      style={{
                        height: 36, borderRadius: 9,
                        ...mono(11.5, { fontWeight: 600 }),
                        color: on ? T.text : T.text2,
                        background: on ? `rgba(${ACT.rgb},0.18)` : 'rgba(255,255,255,0.03)',
                        boxShadow: `inset 0 0 0 1px ${on ? `rgba(${ACT.rgb},0.47)` : T.line}`,
                        transition: 'all .16s',
                      }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    >
                      ${p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ризик на угоду — від нього рахується $ у кожній угоді. */}
            <Choice
              label={tx('Ризик на угоду', 'Risk per trade')}
              options={RISKS.map((r) => [r, `${r}%`])}
              value={f.riskPct}
              onChange={(v) => set({ riskPct: v })}
            />

            {mode === 'chart' && (
              <>
                <Choice
                  label={tx('Таймфрейм на старті', 'Starting timeframe')}
                  options={TF_CHOICES.map((x) => [x, x])}
                  value={f.tf}
                  onChange={(v) => set({ tf: v })}
                />
                <HistoryDatePicker pair={f.pair} value={f.start} onChange={(v) => set({ start: v })} />
              </>
            )}
          </div>

          {/* ---------- підсумок ---------- */}
          <div
            className="flex flex-col gap-4 p-4 sm:gap-[18px] sm:px-6 sm:py-[26px] lg:rounded-br-[26px]"
            style={{ background: T.bg }}
          >
            <div
              className="uppercase"
              style={mono(9.5, { letterSpacing: '1.9px', fontWeight: 600, color: T.text3 })}
            >
              {tx('Підсумок', 'Summary')}
            </div>

            <div
              style={{
                borderRadius: 16,
                background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
                border: `1px solid ${T.lineHi}`,
                padding: 16,
                overflow: 'hidden',
              }}
            >
              <div className="flex items-center" style={{ gap: 7 }}>
                <span
                  style={{
                    ...mono(10.5, { letterSpacing: '1.1px', fontWeight: 700 }),
                    padding: '5px 9px', borderRadius: 7,
                    color: 'var(--edge-acc)',
                    background: `rgba(${ACT.rgb},0.18)`,
                    border: `1px solid rgba(${ACT.rgb},0.40)`,
                  }}
                >
                  {f.pair}
                </span>
                {f.strategy_name.trim() && (
                  <span
                    className="truncate"
                    style={{
                      ...mono(10.5, { letterSpacing: '1.1px', fontWeight: 600 }),
                      padding: '5px 9px', borderRadius: 7, maxWidth: 110,
                      color: T.text2,
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${T.lineHi}`,
                    }}
                  >
                    {f.strategy_name.trim()}
                  </span>
                )}
              </div>

              <div
                className="truncate"
                style={{
                  fontFamily: T.display, marginTop: 12, fontSize: 16, fontWeight: 600,
                  letterSpacing: '-0.3px',
                  color: f.name.trim() ? T.text : T.text4,
                }}
              >
                {f.name.trim() || tx('Без назви', 'Untitled')}
              </div>

              <div className="flex items-end justify-between" style={{ gap: 10, marginTop: 14 }}>
                <div>
                  <div
                    className="uppercase"
                    style={mono(9, { letterSpacing: '1.6px', fontWeight: 600, color: T.text3 })}
                  >
                    Net R
                  </div>
                  <div style={mono(24, { marginTop: 5, fontWeight: 600, letterSpacing: '-0.8px', lineHeight: 1, color: T.text4 })}>
                    0.00R
                  </div>
                </div>
                {/* Пунктир замість кривої: угод ще немає, і малювати
                    вигадану лінію означало б обіцяти результат. */}
                <svg width="76" height="30" viewBox="0 0 76 30" fill="none" aria-hidden>
                  <path d="M2 26h72" stroke={T.lineHi} strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col" style={{ gap: 12 }}>
              {rows.map((r) => (
                <div key={r.k} className="flex items-center justify-between" style={{ gap: 10 }}>
                  <span style={{ fontFamily: T.sans, fontSize: 13, color: T.text2 }}>{r.k}</span>
                  <span style={mono(14, { fontWeight: 600, color: r.acc ? 'var(--edge-acc)' : T.text })}>{r.v}</span>
                </div>
              ))}
            </div>

            <p className="hidden sm:block" style={{ fontFamily: T.sans, marginTop: 'auto', fontSize: 12.5, lineHeight: 1.5, color: T.text3 }}>
              {tx('Ризик фіксований, тому кожна угода рахується в R — результати різних депозитів можна порівнювати.', 'Risk is fixed, so every trade counts in R — results across different deposits stay comparable.')}
            </p>
          </div>
        </div>
        )}

        {mode && (
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-4 pb-[var(--sb)] pt-3 sm:px-[26px] sm:pb-[22px] sm:pt-[18px]"
          style={{ borderTop: `1px solid ${T.line}`, '--sb': 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <span className="hidden sm:inline" style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text3 }}>
            {tx('Назву й актив можна змінити пізніше', 'You can change the name and asset later')}
          </span>

          {/* На телефоні дві кнопки на всю ширину, «Створити» ширша —
              головна дія має бути найбільшою ціллю під пальцем. */}
          <div className="flex w-full items-center sm:w-auto" style={{ gap: 10 }}>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none"
              style={{
                fontFamily: T.sans, height: 46, padding: '0 18px', borderRadius: 12,
                fontSize: 14.5, fontWeight: 600, color: T.text2, transition: 'all .18s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
            >
              {tx('Скасувати', 'Cancel')}
            </button>

            <button
              onClick={submit}
              disabled={!canSave || saving}
              className="flex flex-[1.6] items-center justify-center sm:flex-none"
              style={{
                fontFamily: T.sans, gap: 9, height: 46, padding: '0 22px', borderRadius: 12,
                background: `linear-gradient(180deg, ${ACT.from}, ${ACT.to})`,
                fontSize: 14.5, fontWeight: 600, color: '#fff',
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25)`,
                opacity: canSave && !saving ? 1 : 0.45,
                cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                transition: 'all .18s',
              }}
              onMouseEnter={(e) => {
                if (!canSave || saving) return;
                e.currentTarget.style.background = `linear-gradient(180deg, ${ACT.hoverFrom}, ${ACT.hoverTo})`;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `linear-gradient(180deg, ${ACT.from}, ${ACT.to})`;
                e.currentTarget.style.transform = 'none';
              }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {mode === 'chart' ? tx('Створити й відкрити графік', 'Create & open chart') : tx('Створити', 'Create')}
              {!saving && <ArrowRight size={15} strokeWidth={2.2} />}
            </button>
          </div>
        </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
