import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getCat, hexA, reasonLabel, MAIN_REASONS } from './utils';

/* ==================================================================
   Перегляд помилки.

   Два режими одного вмісту: шухляда справа і повний екран.

   Шухляда добра для «глянув і закрив» — вона не забирає сторінку, і
   список помилок лишається на видноті збоку. Але коли починається
   власне розбір — читаєш опис, дивишся графік, згадуєш той день —
   580 пікселів стають вузькими, і текст перетворюється на колонку
   з шести слів.

   Тому перемикач, а не заміна: швидкий погляд і вдумливе читання —
   це різні дії, і жодна не має витісняти іншу.
================================================================== */

const SANS = "'Roboto', system-ui, -apple-system, sans-serif";

const C = {
  text:  'var(--edge-text, #FAFAFA)',
  text2: 'var(--edge-text2, #B4B4BD)',
  text3: 'var(--edge-text3, #7A7A85)',
  text4: 'var(--edge-text4, #4A4A52)',
  line:  'var(--edge-line, #232328)',
  lineHi:'var(--edge-line-hi, #33333A)',
  panel: 'var(--edge-surface, #131316)',
  sunken:'var(--edge-sunken, #0D0D10)',
  acc:   'var(--edge-acc, #8b7bff)',
  ok:    '#34d399',
  bad:   '#f87171',
};

function Cap({ children }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function IconBtn({ onClick, title, children }) {
  return (
    <button
      className="error-btn-action"
      onClick={onClick}
      title={title}
      style={{
        width: 38, height: 38, borderRadius: 10, background: 'transparent',
        border: `1px solid ${C.line}`, color: C.text3, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .2s', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

const IconExpand = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconCollapse = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M9 4v4a1 1 0 0 1-1 1H4M15 4v4a1 1 0 0 0 1 1h4M9 20v-4a1 1 0 0 0-1-1H4M15 20v-4a1 1 0 0 1 1-1h4"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ErrorDetailDrawer({ selected, numMap, onClose, onDelete, onResolve }) {
  const [full, setFull] = useState(false);

  /* Нова помилка відкривається шухлядою — режим не липне до
     наступного запису, бо «розгорнув один раз» не означає «хочу
     завжди».

     Скидаємо під час рендера, а не ефектом: ефект зробив би зайвий
     прохід, у якому нова помилка встигла б промалюватись у старому
     режимі. */
  const [lastId, setLastId] = useState(null);
  if (selected && selected.id !== lastId) {
    setLastId(selected.id);
    if (full) setFull(false);
  }

  useEffect(() => {
    if (!selected) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      /* Esc знімає верхній шар: спершу згортає, потім закриває */
      if (full) setFull(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [selected, full, onClose]);

  const content = () => {
    if (!selected) return null;

    const num = '№ ' + String(numMap[selected.id] || 0).padStart(3, '0');
    const reasons = selected.reasons || [];

    const badge = (label, color) => (
      <span
        key={label}
        style={{
          display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 8,
          background: hexA(color, 0.1), border: `1px solid ${hexA(color, 0.32)}`, color,
          fontFamily: SANS, fontSize: 13, fontWeight: 700,
        }}
      >
        {label}
      </span>
    );

    return (
      <>
        {/* ---------- шапка ---------- */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: C.text3, marginBottom: 8 }}>
              {num} · {selected.date}
            </div>
            <div style={{ fontFamily: SANS, fontSize: full ? 40 : 32, fontWeight: 700, letterSpacing: '-0.02em', color: C.text, lineHeight: 1.1 }}>
              {selected.pair}
            </div>
          </div>

          <IconBtn onClick={() => setFull((f) => !f)} title={full ? 'Згорнути' : 'На весь екран'}>
            {full ? <IconCollapse /> : <IconExpand />}
          </IconBtn>

          <IconBtn onClick={() => onDelete(selected.id)} title="Видалити запис">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-13M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </IconBtn>

          <IconBtn onClick={onClose} title="Закрити">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </IconBtn>
        </div>

        {/* ---------- мітки ---------- */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {selected.cats.map((id) => {
            const c = getCat(id);
            return badge(c.label, c.color);
          })}
          {(selected.source === 'trade' || selected.source === 'plan') && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 8,
                background: C.sunken, border: `1px solid ${C.line}`, color: C.text3,
                fontFamily: SANS, fontSize: 13, fontWeight: 600,
              }}
            >
              {selected.source === 'trade' ? 'з угоди' : 'з плану дня'}
            </span>
          )}
        </div>

        {/* Головна дія. Журнал помилок існує не для того, щоб помилки
            в ньому лежали, а щоб їх перебирали — тому «розібрано»
            стоїть вище за опис, а не в кінці сторінки. */}
        {onResolve && (
          <button
            onClick={() => onResolve(selected)}
            className="error-btn-action"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              width: '100%', height: 48, marginBottom: 28, borderRadius: 12, cursor: 'pointer',
              fontFamily: SANS, fontSize: 14.5, fontWeight: 700,
              background: selected.resolved ? 'transparent' : 'rgba(52,211,153,.09)',
              border: `1px solid ${selected.resolved ? C.line : 'rgba(52,211,153,.34)'}`,
              color: selected.resolved ? C.text3 : C.ok,
            }}
          >
            {selected.resolved ? 'Розібрано — повернути в роботу' : 'Позначити розібраною'}
          </button>
        )}

        {/* На весь екран текст і графік стають поруч: читати опис
            стовпчиком у 40 символів на широкому екрані — це та сама
            шухляда, тільки без її переваг. */}
        <div style={full ? { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 36, alignItems: 'start' } : undefined}>
          <div>
            {reasons.length > 0 && (
              <>
                <Cap>Причина</Cap>
                {/* Головні окремим кольором: вони важать більше за
                    решту, і в списку це має бути видно до читання. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                  {reasons.map((id) => {
                    const main = MAIN_REASONS.some((m) => m.id === id);
                    const col = main ? '#f87171' : '#8b7bff';
                    return (
                      <span
                        key={id}
                        style={{
                          padding: '9px 13px', borderRadius: 9,
                          background: hexA(col, 0.1), border: `1px solid ${hexA(col, 0.32)}`, color: col,
                          fontFamily: SANS, fontSize: 14, fontWeight: 700,
                        }}
                      >
                        {reasonLabel(id)}
                      </span>
                    );
                  })}
                </div>
              </>
            )}

            <Cap>Розбір</Cap>
            <div style={{ fontFamily: SANS, fontSize: full ? 16.5 : 15.5, lineHeight: 1.75, color: '#E4E4E9', marginBottom: 32, whiteSpace: 'pre-wrap' }}>
              {selected.desc}
            </div>
          </div>

          <div>
            {/* Блок «Виконання» прибрано: він показував ті самі
                чотири головні, що тепер стоять серед причин, тільки
                у вигляді «так/ні». Одні дані у двох виглядах на
                одному екрані — це не повнота, а сумнів, куди
                дивитись. */

            }
            {/* Графік показуємо, тільки якщо він є. Раніше тут завжди
                малювались вигадані свічки з підписом «приклад
                графіка» — прикраса, яку легко прийняти за свій
                скріншот, поки не придивишся. */}
            {selected.tvLink && (
              <>
                <Cap>Графік</Cap>
                {/^https?:\/\//i.test(selected.tvLink) ? (
                  <a href={selected.tvLink} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                    <img
                      src={selected.tvLink}
                      alt="Графік помилки"
                      style={{ width: '100%', borderRadius: 12, border: `1px solid ${C.line}`, display: 'block' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </a>
                ) : null}
                <a
                  href={selected.tvLink}
                  target="_blank"
                  rel="noreferrer"
                  className="error-tv-link"
                  style={{
                    display: 'block', marginTop: 10, fontFamily: SANS, fontSize: 13, wordBreak: 'break-all',
                    padding: '12px 16px', background: hexA('#8b7bff', 0.06),
                    border: `1px solid ${hexA('#8b7bff', 0.25)}`, borderRadius: 12,
                    color: C.acc, textDecoration: 'none',
                  }}
                >
                  {selected.tvLink}
                </a>
              </>
            )}
          </div>
        </div>
      </>
    );
  };

  const body = (
    <AnimatePresence>
      {selected && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={full ? undefined : onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(7px)', zIndex: 1500 }}
          />

          {full ? (
            /* Повний екран — окрема картка по центру, а не розтягнута
               шухляда: у неї свої поля й свій ритм, і виглядати вона
               має як документ, а не як панель, що поїхала. */
            <div style={{ position: 'fixed', inset: 0, zIndex: 1501, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}>
              <motion.div
                key="full"
                initial={{ opacity: 0, y: 24, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.985 }}
                transition={{ type: 'spring', damping: 26, stiffness: 260 }}
                className="custom-scrollbar"
                style={{
                  pointerEvents: 'auto', width: 'min(1180px, 96vw)', maxHeight: '92vh', overflowY: 'auto',
                  background: C.panel, border: `1px solid ${C.lineHi}`, borderRadius: 22,
                  padding: '40px 48px 48px', boxShadow: '0 60px 140px -40px rgba(0,0,0,.9)',
                }}
              >
                {content()}
              </motion.div>
            </div>
          ) : (
            <motion.div
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="custom-scrollbar"
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(600px,94vw)',
                background: C.panel, borderLeft: `1px solid ${C.line}`, zIndex: 1501,
                overflowY: 'auto', padding: '38px 42px 48px', boxShadow: '-40px 0 90px rgba(0,0,0,.5)',
              }}
            >
              {content()}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
