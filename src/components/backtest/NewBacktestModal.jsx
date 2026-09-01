import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Search, Plus, ChevronDown, ArrowRight } from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import AssetIcon from '../ui/AssetIcon';
import { ACT } from './accent';

/* ==================================================================
   Створення бектесту.

   Ліворуч чотири поля, праворуч — жива картка того, що вийде. Друга
   колонка існує не для краси: людина бачить, як виглядатиме бектест
   у списку, ще до того, як натисне «Створити», і не створює три
   однакові «Тест 1» через тиждень.

   Геометрія з макета редизайну, кольори — проєктні токени.
================================================================== */

const DEFAULT_PAIRS = ['GER40', 'EURUSD', 'NQ100', 'S&P500', 'GOLD', 'NZD/USD', 'BTC', 'ETH', 'SOL'];

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

function FloatField({ label, value, onChange, onKeyDown, placeholder, autoFocus, prefix, mono: isMono }) {
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
          color: focus ? '#9b8dff' : T.text3,
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
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          /* Плейсхолдер лише коли підпис уже вгорі, інакше два сірі
             рядки стоять один на одному. */
          placeholder={up ? placeholder : ''}
          className="min-w-0 flex-1 bg-transparent outline-none"
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

/* ------------------------------------------------------------------
   Вибір активу.

   Той самий, що в Log Trade: іконки прапорів і монет, пошук і свій
   тікер, який одразу летить у user_assets — наступного разу він у
   списку з будь-якого пристрою. Різні випадашки для одного й того
   самого вибору змушували б щоразу згадувати, як воно тут працює.
------------------------------------------------------------------ */
function AssetPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [userPairs, setUserPairs] = useState([]);
  const [adding, setAdding] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    let alive = true;
    supabase.from('user_assets').select('name').order('name')
      .then(({ data }) => { if (alive && data) setUserPairs(data.map((d) => d.name)); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const all = [...new Set([...DEFAULT_PAIRS, ...userPairs])];
  const q = search.trim().toLowerCase();
  const filtered = all.filter((p) => p.toLowerCase().includes(q));
  const showAdd = q && !all.some((p) => p.toLowerCase() === q);

  const add = async () => {
    const name = search.trim().toUpperCase();
    setAdding(true);
    try {
      const { error } = await supabase.from('user_assets').insert([{ name }]);
      if (!error) setUserPairs((s) => [...s, name]);
      onChange(name);
      setSearch('');
      setOpen(false);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setSearch(''); }}
        className="flex w-full items-center justify-between"
        style={{
          gap: 14, padding: '11px 16px', borderRadius: 14,
          background: T.sunken,
          border: `1px solid ${open ? ACT.to : T.line}`,
          boxShadow: open ? `0 0 0 4px rgba(${ACT.rgb},0.13)` : 'none',
          transition: 'border-color .18s, box-shadow .18s',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
      >
        <span className="min-w-0 text-left">
          <span
            className="block uppercase"
            style={mono(9.5, { letterSpacing: '1.8px', fontWeight: 600, color: T.text3 })}
          >
            Актив
          </span>
          <span className="mt-[7px] flex items-center" style={{ gap: 9 }}>
            <AssetIcon symbol={value} />
            <span style={mono(15.5, { fontWeight: 700, letterSpacing: '0.8px', color: T.text })}>
              {value}
            </span>
          </span>
        </span>

        <ChevronDown
          size={18}
          strokeWidth={2}
          className="shrink-0"
          style={{ color: '#9b8dff', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 right-0 z-20 overflow-hidden"
            style={{
              top: 'calc(100% + 8px)',
              borderRadius: 16,
              background: T.surfaceHi,
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 28px 60px -20px rgba(0,0,0,0.9)',
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: 10, padding: '12px 14px', borderBottom: `1px solid ${T.line}` }}
            >
              <Search size={15} strokeWidth={1.9} className="shrink-0" style={{ color: T.text3 }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук або свій тікер"
                className="min-w-0 flex-1 bg-transparent outline-none"
                style={{ fontFamily: T.sans, fontSize: 14, color: T.text }}
              />
            </div>

            <div className="custom-scrollbar" style={{ maxHeight: 236, overflowY: 'auto', padding: 6 }}>
              {filtered.map((p) => {
                const on = p === value;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { onChange(p); setOpen(false); setSearch(''); }}
                    className="flex w-full items-center text-left"
                    style={{
                      gap: 10, padding: '11px 12px', borderRadius: 11,
                      background: on ? `rgba(${ACT.rgb},0.18)` : 'transparent',
                      transition: 'background .15s',
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <AssetIcon symbol={p} />
                    <span style={mono(13.5, { fontWeight: 700, letterSpacing: '0.7px', color: T.text })}>
                      {p}
                    </span>
                  </button>
                );
              })}

              {showAdd && (
                <button
                  type="button"
                  onClick={add}
                  disabled={adding}
                  className="flex w-full items-center"
                  style={{ gap: 10, padding: '11px 12px', borderRadius: 11, transition: 'background .15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${ACT.rgb},0.13)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {adding
                    ? <Loader2 size={15} className="animate-spin" style={{ color: '#9b8dff' }} />
                    : <Plus size={15} strokeWidth={2.4} style={{ color: '#9b8dff' }} />}
                  <span style={{ fontFamily: T.sans, fontSize: 13.5, color: T.text2 }}>
                    Додати{' '}
                    <span style={mono(13.5, { fontWeight: 700, color: T.text })}>
                      {search.trim().toUpperCase()}
                    </span>
                  </span>
                </button>
              )}

              {filtered.length === 0 && !showAdd && (
                <div
                  style={{ fontFamily: T.sans, padding: '20px 12px', textAlign: 'center', fontSize: 13, color: T.text3 }}
                >
                  Нічого не знайшлось
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== */

const PRESETS = ['1 000', '10 000', '50 000', '100 000'];

export default function NewBacktestModal({ saving, onClose, onCreate }) {
  const [f, setF] = useState({
    name: '',
    pair: 'EURUSD',
    strategy_name: '',
    initial_balance: '10000',
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
  const canSave = f.name.trim() && dep > 0;
  const submit = () => { if (canSave && !saving) onCreate({ ...f, initial_balance: dep }); };

  const rows = [
    { k: 'Ризик на угоду', v: '1%', acc: true },
    { k: '1R у грошах', v: money(dep / 100), acc: true },
    { k: 'Депозит', v: money(dep) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="relative my-auto w-full"
        style={{
          maxWidth: 820,
          borderRadius: 26,
          background: T.surface,
          border: `1px solid ${T.lineHi}`,
          boxShadow: '0 44px 100px -34px #000',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            borderRadius: '26px 26px 0 0',
            background: `linear-gradient(90deg, transparent, rgba(${ACT.rgb},0.8), transparent)`,
          }}
        />

        <div className="flex items-center justify-between" style={{ gap: 20, padding: '22px 26px' }}>
          <div className="min-w-0">
            <div
              style={{ fontFamily: T.display, fontSize: 20, fontWeight: 600, letterSpacing: '-0.4px', color: T.text }}
            >
              Новий бектест
            </div>
            <div style={{ fontFamily: T.sans, marginTop: 5, fontSize: 13, color: T.text2 }}>
              Крок 1 з 1 · далі одразу додаєш угоди
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Закрити"
            className="grid shrink-0 place-items-center"
            style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.03)', color: T.text2, transition: 'background .18s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_282px]" style={{ borderTop: `1px solid ${T.line}` }}>

          <div
            className="flex flex-col lg:border-r"
            style={{ padding: 26, gap: 14, borderColor: T.line }}
          >
            <FloatField
              label="Назва бектесту"
              value={f.name}
              onChange={(v) => set({ name: v })}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Silver Bullet · London · Q3"
              autoFocus
            />

            <AssetPicker value={f.pair} onChange={(v) => set({ pair: v })} />

            <FloatField
              label="Стратегія · не обовʼязково"
              value={f.strategy_name}
              onChange={(v) => set({ strategy_name: v })}
              placeholder="SFP, ORB, Silver Bullet…"
            />

            <div>
              <FloatField
                label="Стартовий депозит"
                value={f.initial_balance}
                onChange={(v) => set({ initial_balance: v.replace(/[^\d]/g, '') })}
                prefix="$"
                mono
              />

              <div className="flex" style={{ gap: 7, marginTop: 9 }}>
                {PRESETS.map((p) => {
                  const val = p.replace(/\s/g, '');
                  const on = String(f.initial_balance).replace(/[^\d]/g, '') === val;
                  return (
                    <button
                      key={p}
                      onClick={() => set({ initial_balance: val })}
                      className="flex flex-1 items-center justify-center"
                      style={{
                        height: 32, borderRadius: 9,
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
          </div>

          {/* ---------- підсумок ---------- */}
          <div
            className="flex flex-col"
            style={{ padding: '26px 24px', gap: 18, background: T.bg, borderRadius: '0 0 26px 0' }}
          >
            <div
              className="uppercase"
              style={mono(9.5, { letterSpacing: '1.9px', fontWeight: 600, color: T.text3 })}
            >
              Підсумок
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
                    color: '#c2b8ff',
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
                {f.name.trim() || 'Без назви'}
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
                  <span style={mono(14, { fontWeight: 600, color: r.acc ? '#c2b8ff' : T.text })}>{r.v}</span>
                </div>
              ))}
            </div>

            <p style={{ fontFamily: T.sans, marginTop: 'auto', fontSize: 12.5, lineHeight: 1.5, color: T.text3 }}>
              Ризик фіксований, тому кожна угода рахується в R — результати різних депозитів можна порівнювати.
            </p>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center justify-between"
          style={{ gap: 16, padding: '18px 26px 22px', borderTop: `1px solid ${T.line}` }}
        >
          <span style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text3 }}>
            Назву й актив можна змінити пізніше
          </span>

          <div className="flex items-center" style={{ gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                fontFamily: T.sans, height: 44, padding: '0 22px', borderRadius: 12,
                fontSize: 14.5, fontWeight: 600, color: T.text2, transition: 'all .18s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
            >
              Скасувати
            </button>

            <button
              onClick={submit}
              disabled={!canSave || saving}
              className="flex items-center"
              style={{
                fontFamily: T.sans, gap: 9, height: 44, padding: '0 24px', borderRadius: 12,
                background: `linear-gradient(180deg, ${ACT.from}, ${ACT.to})`,
                fontSize: 14.5, fontWeight: 600, color: '#fff',
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 12px 30px -12px rgba(${ACT.rgb},0.9)`,
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
              Створити
              {!saving && <ArrowRight size={15} strokeWidth={2.2} />}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
