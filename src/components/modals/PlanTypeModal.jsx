import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, CalendarRange, X } from 'lucide-react';
import { T, SPRING } from '../../lib/theme';

/* ==================================================================
   Вибір типу плану: денний чи тижневий.

   Автоматично зʼявляється в пн-вт — природні дні, коли варто спершу
   глянути на весь тиждень (одне питання на добу, прапорець у
   lib/weekPlan.js) — і завжди доступна через «New plan» у хедері,
   незалежно від дня. Закриття без вибору = денний: це вже дефолт
   сторінки, модалка лише додає явний шлях до тижневого поверх нього.
================================================================== */

const OPTIONS = [
  {
    id: 'daily',
    icon: CalendarDays,
    tone: T.acc,
    rgb: T.accRgb,
    title: 'Денний план',
    text: 'Один інструмент, розбір на сьогодні: top-down, вхід, звіт по сесії.',
  },
  {
    id: 'weekly',
    icon: CalendarRange,
    tone: T.info,
    rgb: T.infoRgb,
    title: 'Тижневий план',
    text: 'Кілька активів і теза на весь тиждень: свій top-down по кожному, звірка в кінці.',
  },
];

export default function PlanTypeModal({ isOpen, onClose, onChoose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={SPRING}
            className="relative z-10 w-full max-w-[460px] rounded-3xl overflow-hidden"
            style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 30px 90px rgba(0,0,0,0.5)' }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-20 grid h-8 w-8 place-items-center rounded-full transition-colors"
              style={{ color: T.text4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.surfaceHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={16} />
            </button>

            <div className="p-7 sm:p-8">
              <h3 className="text-[20px] font-bold mb-1.5" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                Який план на сьогодні?
              </h3>
              <p className="text-[13px] mb-6 pr-6 leading-[1.5]" style={{ color: T.text3, fontFamily: T.sans }}>
                На початку тижня зручно спершу глянути на весь тиждень. Якщо сьогодні окрема ідея — обери денний.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {OPTIONS.map((o) => {
                  const Icon = o.icon;
                  return (
                    <button
                      key={o.id}
                      onClick={() => onChoose(o.id)}
                      className="group flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98]"
                      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${o.rgb},0.5)`; e.currentTarget.style.background = `rgba(${o.rgb},0.06)`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.sunken; }}
                    >
                      <div
                        className="grid h-10 w-10 place-items-center rounded-xl"
                        style={{ background: `rgba(${o.rgb},0.12)`, border: `1px solid rgba(${o.rgb},0.28)`, color: o.tone }}
                      >
                        <Icon size={18} strokeWidth={2.2} />
                      </div>
                      <div>
                        <span className="block text-[15px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>{o.title}</span>
                        <span className="mt-1 block text-[12.5px] leading-[1.5]" style={{ color: T.text3, fontFamily: T.sans }}>{o.text}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
