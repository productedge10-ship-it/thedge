import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ListChecks, Check, Flame } from 'lucide-react';
import { T } from '../../lib/theme';
import { notify } from '../../utils/notify';
import useCloudState from '../../hooks/useCloudState';
import { DEFAULT_ITEMS, DEFAULT_GROUPS, KEYS, normalizeItems } from '../../lib/checklistData';
import { reasonLabel } from './utils';

/* ==================================================================
   Правило з помилки.

   Сенс усього журналу — не в тому, щоб зберігати помилки, а в тому,
   щоб вони перестали повторюватись. Між «записав» і «перестало
   повторюватись» лежить рівно один крок: правило, яке доведеться
   прочитати перед наступним входом. Цей крок тут і робиться.

   Текст підставляється з висновку розбору: людина вже сформулювала
   його своїми словами, і змушувати писати вдруге означає майже
   гарантовано не отримати правила взагалі.

   Пише в той самий чекліст, що й сторінка «Перед входом» — той
   самий ключ у сховищі, тому пункт зʼявляється там одразу.
================================================================== */

const Z = 2200;
const A = (a) => `rgba(${T.accRgb}, ${a})`;

/* З якої причини — в яку групу чеклиста. Здогадка, яку видно й можна
   перебити: помилка ризику майже завжди лікується пунктом про ризик,
   а не про контекст ринку. */
const GROUP_GUESS = [
  [/risk|обʼєм|обсяг|стоп|лот/i, 'risk'],
  [/fomo|revenge|tilt|страх|нудьг|терпін|впевнен/i, 'head'],
  [/setup|система|підтвердж|рівень|тф|timeframe/i, 'setup'],
];

export default function RuleFromErrorModal({ isOpen, onClose, entry, color }) {
  const [items, setItems] = useCloudState('checklist_items', DEFAULT_ITEMS, {
    legacyKey: KEYS.items,
    normalize: normalizeItems,
  });

  const reasons = entry?.reasons || [];
  const firstReason = reasons[0] ? reasonLabel(reasons[0]) : '';

  const guess = (() => {
    const hay = `${reasons.join(' ')} ${firstReason}`;
    const hit = GROUP_GUESS.find(([re]) => re.test(hay));
    return hit ? hit[1] : 'setup';
  })();

  /* Висновок часто написаний як «наступного разу: …» — саме цей
     хвіст і є правилом, тому підставляємо його, а не весь текст. */
  const seed = (() => {
    const desc = entry?.desc || '';
    const m = desc.match(/(?:наступного разу|next time|правило)\s*[:—-]\s*([\s\S]+)$/i);
    return (m ? m[1] : desc).trim().slice(0, 180);
  })();

  const [text, setText] = useState(seed);
  const [group, setGroup] = useState(guess);
  const [critical, setCritical] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);

  /* Перезаряджаємо форму на кожне відкриття: інакше правило з минулої
     помилки лишалось би в полі для наступної. */
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) { setText(seed); setGroup(guess); setCritical(false); }
  }

  const save = () => {
    const clean = text.trim();
    if (clean.length < 4) return;

    const id = Math.max(0, ...items.map((i) => Number(i.id) || 0)) + 1;
    setItems([...items, { id, text: clean, group, critical }]);

    notify.success('Правило створено', 'Зʼявиться в чеклісті перед входом.');
    onClose();
  };

  const body = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,8,0.8)', backdropFilter: 'blur(6px)', zIndex: Z }}
          />

          <div
            style={{
              position: 'fixed', inset: 0, zIndex: Z + 1, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 320 }}
              className="relative flex w-full flex-col overflow-hidden"
              style={{
                pointerEvents: 'auto',
                maxWidth: 520,
                borderRadius: 20,
                backgroundColor: 'var(--edge-sunken)',
                backgroundImage: 'linear-gradient(170deg,var(--edge-surface),var(--edge-sunken))',
                border: '1px solid var(--edge-line)',
                boxShadow: '0 40px 90px -34px #000',
              }}
            >
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg,transparent,${color || T.acc}cc 40%,transparent)` }}
              />

              <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--edge-line)' }}>
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl"
                    style={{ background: A(0.16), border: `1px solid ${A(0.4)}`, color: 'var(--edge-acc)' }}
                  >
                    <ListChecks size={16} strokeWidth={1.9} />
                  </span>
                  <div>
                    <div className="text-[14.5px] font-bold" style={{ fontFamily: T.display, color: 'var(--edge-text)', letterSpacing: '-0.3px' }}>
                      Правило з цієї помилки
                    </div>
                    {firstReason && (
                      <div className="mt-[3px] text-[12.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>
                        {firstReason}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded-[10px]"
                  style={{ background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)', color: 'var(--edge-text2)' }}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>

              <div className="px-5 py-5">
                <span
                  className="text-[10.5px] font-bold uppercase"
                  style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: 'var(--edge-text2)' }}
                >
                  Що робити наступного разу
                </span>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  placeholder="Обʼєм рахую до входу, а не після того, як побачив рух."
                  className="mt-2.5 w-full resize-none rounded-[13px] px-4 py-3 outline-none"
                  style={{
                    fontFamily: T.sans, fontSize: 14.5, lineHeight: 1.6, color: 'var(--edge-text)',
                    background: 'rgba(var(--edge-hair-rgb),0.02)', border: '1px solid var(--edge-line)',
                  }}
                />

                <div className="mt-4">
                  <span
                    className="text-[10.5px] font-bold uppercase"
                    style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: 'var(--edge-text2)' }}
                  >
                    Куди покласти
                  </span>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {DEFAULT_GROUPS.map((g) => {
                      const on = group === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => setGroup(g.id)}
                          className="rounded-[10px] px-3.5 py-2 text-[13px] font-semibold"
                          style={{
                            fontFamily: T.sans,
                            background: on ? A(0.2) : 'rgba(var(--edge-hair-rgb),0.03)',
                            border: `1px solid ${on ? A(0.55) : 'var(--edge-line)'}`,
                            color: on ? 'var(--edge-text)' : 'var(--edge-text2)',
                            transition: 'all .16s',
                          }}
                        >
                          {g.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Критичні пункти блокують зелений вердикт чеклиста —
                    тому це окремий свідомий вибір, а не галочка «до
                    купи». */}
                <button
                  onClick={() => setCritical((v) => !v)}
                  className="mt-4 flex w-full items-center gap-2.5 rounded-[12px] px-3.5 py-3 text-left"
                  style={{
                    background: critical ? 'rgba(var(--edge-bad-rgb),0.08)' : 'rgba(var(--edge-hair-rgb),0.02)',
                    border: `1px solid ${critical ? 'rgba(var(--edge-bad-rgb),0.30)' : 'var(--edge-line)'}`,
                    transition: 'all .16s',
                  }}
                >
                  <span
                    className="grid h-5 w-5 flex-none place-items-center rounded-md"
                    style={{
                      background: critical ? 'var(--edge-bad)' : 'transparent',
                      border: `1px solid ${critical ? 'var(--edge-bad)' : 'var(--edge-line-hi)'}`,
                      color: 'var(--edge-sunken)',
                    }}
                  >
                    {critical && <Check size={12} strokeWidth={3.2} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}>
                      <Flame size={13} strokeWidth={2} style={{ color: critical ? 'var(--edge-bad)' : 'var(--edge-text3)' }} />
                      Критичне
                    </span>
                    <span className="mt-1 block text-[12px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>
                      Без цього пункту чекліст не дасть зеленого вердикту
                    </span>
                  </span>
                </button>
              </div>

              <div
                className="flex items-center justify-between gap-4 px-5 py-3.5"
                style={{ borderTop: '1px solid var(--edge-line)', background: 'var(--edge-sunken)' }}
              >
                <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>
                  Зʼявиться в «Перед входом»
                </span>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={onClose}
                    className="flex h-10 items-center rounded-xl px-4 text-[13px] font-semibold"
                    style={{ fontFamily: T.sans, background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)', color: 'var(--edge-text)' }}
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={save}
                    className="flex h-10 items-center gap-2 rounded-xl px-4 text-[13.5px] font-bold"
                    style={{
                      fontFamily: T.sans,
                      background: 'linear-gradient(180deg,var(--edge-acc),var(--edge-acc))',
                      color: 'var(--edge-text)',
                      boxShadow: `0 12px 30px -12px ${A(0.7)}, inset 0 1px 0 rgba(var(--edge-text-rgb),0.2)`,
                      opacity: text.trim().length < 4 ? 0.6 : 1,
                    }}
                  >
                    <Check size={14} strokeWidth={2.6} />
                    Створити правило
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
