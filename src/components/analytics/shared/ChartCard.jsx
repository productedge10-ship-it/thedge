import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings2, X } from 'lucide-react';
import { CSS_SPRING, F, P, POP, en, hairline, lightLayer, trackLight } from '../overview/theme';

/* ==================================================================
   Картка з графіком і власними налаштуваннями.

   Та сама конструкція, що на дошці огляду, але без перетягування:
   у «Перформансі» порядок панелей осмислений — від загальної кривої
   до дрібних розрізів, — і давати його ламати немає сенсу. А ось
   вибір показника всередині кожної панелі потрібен: «сума R» і
   «середня угода» відповідають на різні питання, і нав'язувати одну
   з відповідей означає половину даних просто сховати.

   Шестерня зʼявляється під курсором. Тримати її на кожній із десяти
   панелей постійно — це десять однакових іконок на екрані, які
   змагаються з даними за увагу.
================================================================== */

export default function ChartCard({
  id, title, icon: Icon, tone = P.acc, span = 1, right, hint,
  options, value, onChange, children,
}) {
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    const t = setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const opts = value || {};
  const has = options && Object.keys(options).length > 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onMouseMove={trackLight}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-state={open ? 'open' : hover ? 'hover' : 'idle'}
      style={{
        position: 'relative', gridColumn: `span ${span}`,
        display: 'flex', flexDirection: 'column',
        background: P.card,
        border: `1px solid ${hover || open ? `${tone}4d` : P.line}`,
        borderRadius: 20, padding: 18,
        transition: CSS_SPRING,
      }}
    >
      <span aria-hidden style={lightLayer(tone, hover)} />
      <span style={hairline(hover)} />
      <span
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: 20, width: 36, height: 3,
          borderRadius: '0 0 4px 4px', background: tone,
          opacity: hover ? 1 : 0.55, transition: 'opacity .2s',
        }}
      />

      <header style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, minHeight: 24 }}>
        {Icon && <Icon size={13} color={hover ? tone : P.text5} style={{ flexShrink: 0, transition: 'color .2s' }} />}

        <span
          style={{
            fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '1.6px',
            textTransform: 'uppercase', color: hover ? P.text2 : P.text4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            transition: 'color .2s',
          }}
        >
          {title}
        </span>

        <span style={{ flex: 1 }} />

        {right && (
          <span style={{ fontFamily: F.sans, fontSize: 11.5, color: P.text5, whiteSpace: 'nowrap' }}>
            {right}
          </span>
        )}

        {has && (
          <button
            type="button"
            title="Налаштування панелі"
            aria-label="Налаштування панелі"
            onClick={() => setOpen((v) => !v)}
            style={{
              display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8,
              flexShrink: 0, cursor: 'pointer', border: 0,
              background: open ? `${tone}24` : 'transparent',
              color: open ? tone : P.text5,
              opacity: hover || open ? 1 : 0,
              transform: open ? 'rotate(45deg)' : 'none',
              transition: 'opacity .2s, transform .4s cubic-bezier(.22,1,.36,1), background .2s, color .2s',
            }}
          >
            <Settings2 size={13} />
          </button>
        )}
      </header>

      <div style={{ position: 'relative', flex: 1 }}>
        {children(opts)}
      </div>

      {hint && (
        <p
          style={{
            position: 'relative', margin: '12px 0 0', paddingTop: 11,
            borderTop: `1px solid ${P.lineSoft}`,
            fontFamily: F.sans, fontSize: 11.5, lineHeight: 1.55,
            color: hover ? P.text4 : P.text5, transition: 'color .25s',
          }}
        >
          {hint}
        </p>
      )}

      <AnimatePresence>
        {open && has && (
          <motion.div
            ref={boxRef}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14 } }}
            transition={POP}
            style={{
              position: 'absolute', top: 44, right: 12, zIndex: 60, width: 232,
              transformOrigin: 'top right',
              background: 'rgba(14,14,19,.92)',
              backdropFilter: 'blur(28px) saturate(140%)',
              WebkitBackdropFilter: 'blur(28px) saturate(140%)',
              border: '1px solid rgba(var(--edge-hair-rgb),0.08)', borderRadius: 16,
              padding: '15px 16px 17px', display: 'flex', flexDirection: 'column', gap: 16,
              boxShadow: '0 24px 60px -18px rgba(0,0,0,.85)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: tone }} />
              <span style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: 'var(--edge-text)' }}>
                {en(title)}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, border: 0, background: 'transparent', cursor: 'pointer', color: P.dim }}
              >
                <X size={13} />
              </button>
            </div>

            {Object.entries(options).map(([key, def], i) => (
              <Choice
                key={key}
                index={i}
                tone={tone}
                label={en(def.label)}
                choices={def.choices.map(([v, l]) => [v, en(l)])}
                value={opts[key] ?? def.def}
                onPick={(v) => onChange({ ...opts, [key]: v })}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/* Той самий мінімальний перемикач, що в налаштуваннях віджета:
   підпис, під ним варіанти текстом, під активним — риска, яка
   переїжджає. Рамок навколо кнопок немає навмисно. */
function Choice({ label, value, choices, tone, onPick, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.035, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
    >
      <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: P.dim }}>{label}</span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 15 }}>
        {choices.map(([v, l]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              data-state={on ? 'active' : 'idle'}
              onClick={() => onPick(v)}
              style={{
                position: 'relative', padding: '1px 0 5px', border: 0, background: 'transparent',
                cursor: 'pointer', fontFamily: F.sans, fontSize: 13, fontWeight: on ? 600 : 500,
                color: on ? 'var(--edge-text)' : P.text5, transition: 'color .18s',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = P.text2; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = P.text5; }}
            >
              {l}
              {on && (
                <motion.span
                  layoutId={`pc-${label}`}
                  transition={POP}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5,
                    borderRadius: 2, background: tone, boxShadow: `0 0 8px ${tone}99`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
