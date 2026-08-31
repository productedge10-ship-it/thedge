import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { REASON_GROUPS, REASONS, MAIN_REASONS, reasonLabel, hexA } from './utils';
import AssetPickerModal from '../modals/AssetPickerModal';

/* ==================================================================
   Композер помилки.

   Відкривається з чотирьох місць: сторінки помилок, форми запису
   угоди, картки угоди і пост-сесійної діагностики. Виглядати всюди
   має однаково — це та сама дія, а не чотири схожі. Тому вміст іде
   в портал на body: position fixed рахується від вікна тільки доти,
   доки жоден предок не має transform, а всі перелічені місця — це
   анімовані модалки, тобто transform там є завжди.

   Типографіка переписана. Було: моноширинний шрифт, uppercase і
   letter-spacing 2px на всьому — від заголовків до кнопок. Такий
   набір читається як термінальний лог, і саме тому текст «не
   виділявся»: коли все набрано однаково дрібно й розріджено, око не
   має за що зачепитись і не бачить, що тут головне. Тепер підписи
   лишились дрібними, а те, що людина читає й вибирає, набрано
   нормальним кеглем і вагою.
================================================================== */

const Z = 2000;

const SANS = "'Roboto', system-ui, -apple-system, sans-serif";

const C = {
  text:  'var(--edge-text, #FAFAFA)',
  text2: 'var(--edge-text2, #B4B4BD)',
  text3: 'var(--edge-text3, #7A7A85)',
  text4: 'var(--edge-text4, #4A4A52)',
  line:  'var(--edge-line, #232328)',
  lineHi:'var(--edge-line-hi, #33333A)',
  panel: 'var(--edge-panel, #131316)',
  sunken:'var(--edge-sunken, #0D0D10)',
  acc:   'var(--edge-acc, #8b7bff)',
  bad:   '#f87171',
  ok:    '#34d399',
};

/* Підпис над полем. Дрібний і розріджений — але саме він, а не
   вміст під ним: підпис має підказувати, а не змагатися з даними. */
function Cap({ children, hint }) {
  return (
    <div style={{ marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: C.text3 }}>
        {children}
      </span>
      {hint && (
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.text4 }}>{hint}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Вибір причини.

   Окремим списком, а не чіпами: причин майже тридцять, і плиткою
   вони перетворили б вікно на стіну. Пошук зверху й групи всередині
   роблять довгий список швидшим за короткий — потрібне знаходиться
   набором двох літер.
------------------------------------------------------------------ */
function ReasonPicker({ value = [], onChange, invalid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  const input = useRef(null);
  const panel = useRef(null);

  /* ---------- де малювати список ----------

     Панель була absolute всередині модалки, а модалка має власну
     прокрутку — тож усе, що не влізло в її межі, просто зрізалось
     по верхньому краю. Збільшення висоти цього не лікує: скільки не
     додай, обрізатиме на тому самому місці.

     Тому список іде в портал на body і рахує своє місце в
     координатах вікна. Тепер його межа — екран, а не картка, у якій
     він лежить. */
  const [pos, setPos] = useState(null);

  const place = () => {
    const el = box.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;
    const pad = 16;

    /* Над полем чи під ним — де більше місця. Поле причини стоїть
       унизу форми, тому майже завжди виграє верх. */
    const above = r.top - gap - pad;
    const below = vh - r.bottom - gap - pad;
    const up = above >= below;

    setPos({
      left: Math.max(pad, r.left),
      width: Math.min(Math.max(r.width, 560), vw - pad * 2),
      top: up ? undefined : r.bottom + gap,
      bottom: up ? vh - r.top + gap : undefined,
      maxH: Math.max(260, Math.min(760, up ? above : below)),
      up,
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    place();
    const t = setTimeout(() => input.current?.focus(), 40);
    const away = (e) => {
      if (box.current?.contains(e.target)) return;
      if (panel.current?.contains(e.target)) return;
      setOpen(false);
    };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const query = q.trim().toLowerCase();

  const groups = useMemo(() => {
    if (!query) return REASON_GROUPS;
    return REASON_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((r) => r.label.toLowerCase().includes(query)) }))
      .filter((g) => g.items.length);
  }, [query]);

  const exact = query && REASONS.some((r) => r.label.toLowerCase() === query);
  const isMain = (id) => MAIN_REASONS.some((m) => m.id === id);

  /* Мультивибір: клік перемикає, вікно лишається відкритим. Причин
     майже завжди більше однієї — «не було плану» і «відігравав
     мінус» приходять разом, — і закривати список після кожної
     означало б відкривати його чотири рази поспіль. */
  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    setQ('');
    input.current?.focus();
  };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(true)}
        style={{
          minHeight: 54, padding: value.length ? '10px 12px' : '15px 16px', borderRadius: 12,
          background: C.sunken,
          border: `1px solid ${invalid ? C.bad : open ? C.acc : (value.length ? hexA('#8b7bff', 0.32) : C.line)}`,
          boxShadow: invalid ? `0 0 0 3px ${hexA('#f87171', 0.12)}` : 'none',
          cursor: 'pointer', transition: 'border-color .2s',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}
      >
        {value.length === 0 && (
          <span style={{ fontFamily: SANS, fontSize: 15, color: invalid ? C.bad : C.text4, flex: 1 }}>
            No reason selected
          </span>
        )}

        {value.map((id) => {
          const main = isMain(id);
          const col = main ? '#f87171' : '#8b7bff';
          return (
            <span
              key={id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9,
                background: hexA(col, 0.12), border: `1px solid ${hexA(col, 0.4)}`, color: col,
                fontFamily: SANS, fontSize: 13.5, fontWeight: 700,
              }}
            >
              {reasonLabel(id)}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== id)); }}
                style={{ display: 'flex', background: 'transparent', border: 'none', color: col, cursor: 'pointer', padding: 0, opacity: 0.7 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
              </button>
            </span>
          );
        })}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          style={{
            marginLeft: 'auto', flexShrink: 0, padding: '9px 16px', borderRadius: 9, cursor: 'pointer',
            background: open ? hexA('#8b7bff', 0.14) : 'transparent',
            border: `1px solid ${open ? C.acc : C.lineHi}`,
            color: open ? C.acc : C.text2,
            fontFamily: SANS, fontSize: 13.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 7, transition: 'all .18s',
          }}
        >
          {value.length ? 'More' : 'Choose'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Широка панель у колонки: усі групи видно одночасно, і вибір
          стає впізнаванням, а не гортанням. */}
      {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={panel}
            initial={{ opacity: 0, y: pos?.up ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: pos?.up ? 6 : -6 }}
            transition={{ duration: 0.16 }}
            style={{
              position: 'fixed',
              left: pos?.left, width: pos?.width,
              top: pos?.top, bottom: pos?.bottom,
              zIndex: Z + 3,
              /* Суцільний колір, а не змінна теми: --edge-panel у
                 темній темі напівпрозора, і крізь панель читався
                 текст форми під нею — саме через це список виглядав
                 брудним. */
              background: '#15151A',
              border: `1px solid ${C.lineHi}`, borderRadius: 16,
              boxShadow: '0 -30px 80px -20px rgba(0,0,0,.95), 0 0 0 1px rgba(0,0,0,.4)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column', /* Висота під увесь список: гортати тридцять причин, щоб
                 знайти одну, — це та сама вада, від якої мали
                 позбавити групи. */
              /* Вище, а не ширше. Ширина тут не допомагала: колонки
                 ставали вужчими, назви ламались на два рядки, і
                 виграні пікселі поверталися висотою. Вертикаль
                 працює прямо — більше пунктів видно одразу. */
              maxHeight: pos?.maxH,
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const first = groups[0]?.items?.[0];
                  if (first) toggle(first.id);
                  else if (q.trim()) toggle(q.trim());
                }}
                placeholder="Search or write your own reason…"
                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: SANS, fontSize: 14.5, color: C.text }}
              />
            </div>

            <div
              className="custom-scrollbar"
              style={{ overflowY: 'auto', padding: 16, flex: 1, minHeight: 0 }}
            >
              {groups.map((g) => (
                <div
                  key={g.group}
                  style={g.main ? {
                    /* Головні відділені рамкою, а не просто заголовком:
                       вони важать більше за решту, і це має бути видно
                       до читання. */
                    marginBottom: 18, padding: '12px 14px 14px', borderRadius: 12,
                    background: hexA('#f87171', 0.05), border: `1px solid ${hexA('#f87171', 0.2)}`,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 4,
                  } : { display: 'contents' }}
                >
                  {g.main ? (
                    <>
                      <div style={{ gridColumn: '1/-1', padding: '2px 4px 6px', fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: C.bad }}>
                        {g.group}
                      </div>
                      {g.items.map((r) => {
                        const on = value.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => toggle(r.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                              padding: '10px 11px', borderRadius: 9, cursor: 'pointer',
                              background: on ? hexA('#f87171', 0.14) : 'transparent',
                              border: `1px solid ${on ? hexA('#f87171', 0.4) : 'transparent'}`,
                              color: on ? C.bad : C.text2,
                              fontFamily: SANS, fontSize: 14, fontWeight: on ? 700 : 600, lineHeight: 1.3,
                              transition: 'all .15s',
                            }}
                            onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.05)'; }}
                            onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Box on={on} col="#f87171" />
                            {r.label}
                          </button>
                        );
                      })}
                    </>
                  ) : null}
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '18px 24px', alignContent: 'start' }}>
                {groups.filter((g) => !g.main).map((g) => (
                  <div key={g.group}>
                    <div style={{ padding: '0 8px 8px', marginBottom: 2, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: C.text4, borderBottom: `1px solid ${C.line}` }}>
                      {g.group}
                    </div>
                    {g.items.map((r) => {
                      const on = value.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggle(r.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                            padding: '7px 9px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: on ? hexA('#8b7bff', 0.14) : 'transparent',
                            color: on ? C.acc : C.text2,
                            fontFamily: SANS, fontSize: 13.5, fontWeight: on ? 700 : 500,
                            lineHeight: 1.35, transition: 'background .15s',
                          }}
                          onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.05)'; }}
                          onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <Box on={on} col="#8b7bff" />
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {q.trim() && !exact && (
              <button
                type="button"
                onClick={() => toggle(q.trim())}
                style={{
                  flexShrink: 0, textAlign: 'left', padding: '14px 16px',
                  borderTop: `1px solid ${C.line}`, background: C.sunken, border: 'none',
                  cursor: 'pointer', fontFamily: SANS, fontSize: 14, fontWeight: 700, color: C.acc,
                }}
              >
                + Своя причина: «{q.trim()}»
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
}

/* Квадратик відмітки. Без нього мультивибір читається як список
   посилань: незрозуміло, що пунктів можна взяти кілька. */
function Box({ on, col }) {
  return (
    <span
      style={{
        width: 16, height: 16, borderRadius: 5, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: on ? hexA(col, 0.2) : 'transparent',
        border: `1px solid ${on ? col : 'rgba(255,255,255,.16)'}`,
        transition: 'all .15s',
      }}
    >
      {on && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
          <path d="m5 13 4.5 4.5L19 7" stroke={col} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/* ================================================================== */

export default function ErrorComposerModal({ isOpen, onClose, form, setForm, recentPairs, onSave }) {
  const [isAssetPickerOpen, setAssetPickerOpen] = useState(false);

  /* Своїх категорій тут більше немає: окреме поле «що це було»
     прибрано, а свою причину людина вписує прямо в списку причин —
     там же, де вибирає готові. Одне місце замість двох. */

  /* ---------- що справді обовʼязкове ----------

     Актив і посилання на графік — ні. Помилка «торгував без плану»
     не належить активу, а скріншот через тиждень уже нічого не
     додає. Вимагати їх означало б не пускати в журнал саме ті
     записи, які найважче зробити й найкорисніше мати.

     Причина й опис — так. Без них картка не піддається розбору:
     через місяць з неї нічого не виводиться, а місце в стрічці вона
     займає нарівні з рештою.

     Кнопка при цьому лишається живою. Заблокована кнопка не каже,
     чого їй бракує — людина клікає в порожнечу й іде. Краще дати
     натиснути і показати, що саме не заповнено. */
  const [touched, setTouched] = useState(false);

  /* Скидаємо під час рендера, а не ефектом: інакше вікно встигає
     промалюватись із червоними полями від минулого разу. */
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && touched) setTouched(false);
  }

  const missReason = !(form.reasons || []).length;
  const missDesc = form.desc.trim().length < 4;
  const invalid = missReason || missDesc;

  const submit = () => {
    if (invalid) { setTouched(true); return; }
    onSave();
  };

  const bad = (miss) => touched && miss;

  const body = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(8px)', zIndex: Z }}
          />

          <div style={{ position: 'fixed', inset: 0, zIndex: Z + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="custom-scrollbar"
              style={{
                pointerEvents: 'auto', width: 'min(680px,94vw)', maxHeight: '92vh', overflowY: 'auto',
                background: C.panel, border: `1px solid ${C.lineHi}`, borderRadius: 20,
                padding: '32px 36px 28px', boxShadow: '0 50px 120px rgba(0,0,0,.6)',
              }}
            >
              {/* ---------- шапка ---------- */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 30 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: hexA('#f87171', 0.09), border: `1px solid ${hexA('#f87171', 0.32)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={C.bad} strokeWidth="1.9" /><path d="M12 7.5v5" stroke={C.bad} strokeWidth="1.9" strokeLinecap="round" /><circle cx="12" cy="16" r="1" fill={C.bad} /></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.15 }}>
                    Mistake Review
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 13.5, color: C.text3, marginTop: 4 }}>
                    What happened, why, and what to do about it
                  </div>
                </div>
                <button
                  className="error-btn-action"
                  onClick={onClose}
                  style={{ width: 38, height: 38, borderRadius: 10, background: 'transparent', border: `1px solid ${C.line}`, color: C.text3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s', flexShrink: 0 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                </button>
              </div>

              {/* ---------- актив ---------- */}
              <Cap hint="optional">Trading pair</Cap>
              <div
                className="error-input"
                onClick={() => setAssetPickerOpen(true)}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12, background: C.sunken,
                  border: `1px solid ${C.line}`, color: form.pair ? C.text : C.text4,
                  fontFamily: SANS, fontSize: 15, fontWeight: form.pair ? 700 : 400,
                  letterSpacing: form.pair ? '0.04em' : 0,
                  cursor: 'pointer', transition: 'border-color .2s', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>{form.pair || 'Choose asset'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>

              {recentPairs.length > 0 && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 26 }}>
                  {recentPairs.map((p) => (
                    <button
                      key={p}
                      className="error-chip"
                      onClick={() => setForm({ ...form, pair: p })}
                      style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,.03)', border: `1px solid ${C.line}`, color: C.text2, fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {/* Окремого «що це було» більше немає: воно питало те
                  саме, що й причина, тільки грубіше — і людина
                  описувала один промах двічі. Категорія тепер
                  виводиться з причин, тому колір картки в стрічці й
                  статистика працюють як раніше, без зайвого поля. */}

              {/* ---------- опис ---------- */}
              <Cap hint={bad(missDesc) ? '⚠ no description means this entry can\'t be reviewed' : undefined}>
                What happened and what did you learn
              </Cap>
              <textarea
                className="error-input"
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
                rows="4"
                placeholder="Describe in your own words: what you did, what went wrong, what you'll do differently next time."
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12, background: C.sunken,
                  border: `1px solid ${bad(missDesc) ? C.bad : C.line}`, color: C.text, fontFamily: SANS,
                  boxShadow: bad(missDesc) ? `0 0 0 3px ${hexA('#f87171', 0.12)}` : 'none',
                  fontSize: 14.5, lineHeight: 1.65, outline: 'none',
                  /* none, а не vertical: куточок для розтягування —
                     єдина світла пляма в темному вікні, і око чіплялось
                     саме за нього. Висоти в чотири рядки вистачає, а
                     довгий текст поле прокрутить. */
                  resize: 'none',
                  transition: 'border-color .2s', marginBottom: 26, display: 'block',
                }}
              />

              {/* ---------- скрін ---------- */}
              <Cap hint="optional">Chart screenshot</Cap>
              <input
                className="error-input-dashed"
                value={form.tvLink}
                onChange={(e) => setForm({ ...form, tvLink: e.target.value })}
                placeholder="Chart link — Ctrl+V"
                style={{
                  width: '100%', padding: '15px 16px', borderRadius: 12, background: 'transparent',
                  border: `1px dashed ${C.lineHi}`, color: C.acc, fontFamily: SANS,
                  fontSize: 13.5, textAlign: 'center', outline: 'none',
                  transition: 'border-color .2s', marginBottom: 26,
                }}
              />

              {/* ---------- причина ----------

                  Остання, і це навмисно: щоб відповісти «чому», треба
                  спершу згадати «що». Тут людина вже написала опис —
                  і формулювання приходить саме.

                  Чотири головні лежать усередині списку, а не окремим
                  блоком питань згори. Різниця не косметична: блок
                  питань змушував відповідати на всі чотири щоразу,
                  навіть коли помилка була в одному. У списку людина
                  позначає те, що справді сталось, і мовчання про
                  решту лишається мовчанням. */}
              <Cap hint={bad(missReason) ? '⚠ pick at least one' : 'multiple allowed · this drives the rule'}>
                Reason
              </Cap>
              <div style={{ marginBottom: 28 }}>
                <ReasonPicker
                  value={form.reasons}
                  invalid={bad(missReason)}
                  onChange={(v) => setForm({ ...form, reasons: v })}
                />
              </div>

              {/* ---------- дії ---------- */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, borderTop: `1px solid ${C.line}`, paddingTop: 22, flexWrap: 'wrap' }}>
                <AnimatePresence>
                  {touched && invalid && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      style={{ marginRight: 'auto', fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: C.bad }}
                    >
                      {missReason && missDesc
                        ? 'Fill in the reason and description'
                        : missReason ? 'Pick a reason' : 'Describe what happened'}
                    </motion.span>
                  )}
                </AnimatePresence>
                <button
                  className="error-btn-action"
                  onClick={onClose}
                  style={{ padding: '13px 20px', borderRadius: 10, background: 'transparent', border: `1px solid ${C.line}`, color: C.text2, fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}
                >
                  Cancel
                </button>
                <button
                  className="error-btn-save"
                  onClick={submit}
                  style={{
                    padding: '13px 24px', borderRadius: 10,
                    background: 'linear-gradient(180deg,#ff5563,#d92c3f)',
                    border: '1px solid rgba(255,120,132,.6)',
                    color: '#fff',
                    fontFamily: SANS, fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', transition: 'all .2s ease',
                    opacity: touched && invalid ? 0.75 : 1,
                    boxShadow: '0 6px 24px rgba(217,44,63,.22)',
                  }}
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>

          {/* Вибір активу — вище за композер, інакше ховався б під ним */}
          <div style={{ position: 'relative', zIndex: Z + 2 }}>
            <AssetPickerModal
              isOpen={isAssetPickerOpen}
              onClose={() => setAssetPickerOpen(false)}
              selectedAsset={form.pair}
              onSelect={(symbol) => setForm({ ...form, pair: symbol })}
            />
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
