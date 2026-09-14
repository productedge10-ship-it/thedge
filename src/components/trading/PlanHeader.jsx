import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { CalendarDays, CalendarRange, Plus, Share2, ClipboardCheck, Briefcase, Send, Check, Loader2, ChevronDown, Layers } from 'lucide-react';
import AssetIcon from '../ui/AssetIcon';
import { T, SPRING, EASE } from './planTheme';

/* ==================================================================
   Хедер плану. Раніше 6 різнокольорових кнопок кричали однаково
   голосно. Тепер одна первинна дія (New plan), решта — тихі іконки,
   підписи з'являються на hover.
================================================================== */

function IconBtn({ icon: Icon, label, onClick, tone }) {
  const color = tone || T.text2;
  return (
    <button
      onClick={onClick}
      title={label}
      className="group relative grid h-[38px] w-[38px] place-items-center rounded-xl transition-all duration-200 active:scale-95"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.background = T.surfaceHi; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line;   e.currentTarget.style.background = T.surface; }}
    >
      <Icon size={15} strokeWidth={2.2} style={{ color }} />
      <span
        className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
      >
        {label}
      </span>
    </button>
  );
}

function TextBtn({ icon: Icon, children, onClick, tone, softBg, softLine }) {
  return (
    <button
      onClick={onClick}
      className="flex h-[38px] items-center gap-2 rounded-xl px-3.5 text-[14px] font-semibold transition-all duration-200 active:scale-[0.97]"
      style={{
        background: softBg || T.surface,
        border: `1px solid ${softLine || T.line}`,
        color: tone || T.text2,
        fontFamily: T.sans,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.35)')}
      onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
    >
      <Icon size={14} strokeWidth={2.3} />
      {children}
    </button>
  );
}

/* Поділитись — не безіменна іконка з підказкою на ховері, а кнопка з
   підписом: дія важлива (відкриває план чужим), тож має читатись одразу.
   Після кліку на мить стає зеленою «Скопійовано» — видно, що лінк уже в
   буфері, без погляду на тост. */
function ShareBtn({ onShare }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const click = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await onShare?.();
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={click}
      title="Відкрити доступ і скопіювати посилання"
      className="flex h-[38px] items-center gap-2 rounded-xl px-3.5 text-[14px] font-semibold transition-all duration-200 active:scale-[0.97]"
      style={{
        background: copied ? `rgba(${T.okRgb},0.12)` : `rgba(${T.accRgb},0.08)`,
        border: `1px solid ${copied ? `rgba(${T.okRgb},0.32)` : `rgba(${T.accRgb},0.24)`}`,
        color: copied ? T.ok : T.acc,
        fontFamily: T.sans,
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.filter = 'brightness(1.3)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : copied ? <Check size={14} strokeWidth={2.8} /> : <Share2 size={14} strokeWidth={2.3} />}
      {copied ? 'Скопійовано' : 'Поділитись'}
    </button>
  );
}

/* Перемикач планів дня.

   Жив на лівій рейці стовпчиком логотипів — і виглядав як чужий
   елемент, приклеєний збоку. Тут він на своєму місці: поруч із
   режимом, у рядку службових елементів, і поки не потрібен —
   займає стільки ж, скільки звичайна кнопка.

   Показуємо тільки плани цього дня. Повний пошук активів лишається
   окремим пунктом унизу списку: перемкнутись між зробленим і почати
   новий розбір — різні наміри, і змішувати їх у одному рядку
   означає щоразу вибирати з десятків непотрібного. */
function PlanSwitcher({ plans = [], current, onPick, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] items-center gap-2 rounded-xl pl-2 pr-3 transition-all duration-200"
        style={{
          fontFamily: T.sans,
          background: open ? T.surfaceHi : T.surface,
          border: `1px solid ${open ? T.lineAcc : T.line}`,
          color: T.text2,
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
      >
        {current ? (
          <span className="grid w-6 shrink-0 place-items-center">
            <AssetIcon symbol={current} />
          </span>
        ) : (
          <Layers size={15} strokeWidth={2.3} style={{ color: T.text3, marginLeft: 4 }} />
        )}
        <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: current ? T.text : T.text3 }}>
          {current || 'План'}
        </span>
        {plans.length > 1 && (
          <span
            className="rounded-md px-1.5 text-[11px] font-bold tabular-nums"
            style={{ background: `rgba(${T.accRgb},0.14)`, color: T.acc }}
          >
            {plans.length}
          </span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22, ease: EASE }} className="flex">
          <ChevronDown size={13} strokeWidth={2.4} style={{ color: T.text4 }} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.17, ease: EASE }}
            className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[232px] overflow-hidden rounded-2xl p-1.5"
            style={{
              background: T.surfaceHi,
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 30px 70px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Плани на сьогодні
            </div>

            {plans.map((p) => {
              const on = p.symbol === current;
              return (
                <button
                  key={p.symbol}
                  type="button"
                  onClick={() => { setOpen(false); if (!on) onPick?.(p.symbol); }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150"
                  style={{ background: on ? `rgba(${T.accRgb},0.12)` : 'transparent' }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surface; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="grid w-6 shrink-0 place-items-center">
                    <AssetIcon symbol={p.symbol} category={p.category} />
                  </span>
                  <span className="flex-1 truncate text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: on ? T.acc : T.text2 }}>
                    {p.symbol}
                  </span>
                  {on && <Check size={13} strokeWidth={3} style={{ color: T.acc }} />}
                </button>
              );
            })}

            {!plans.length && (
              <div className="px-2.5 py-2 text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Сьогодні ще порожньо
              </div>
            )}

            <div className="my-1 h-px" style={{ background: T.line }} />

            <button
              type="button"
              onClick={() => { setOpen(false); onAdd?.(); }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150"
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surface; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ border: `1px dashed ${T.line}` }}>
                <Plus size={12} strokeWidth={2.6} style={{ color: T.text4 }} />
              </span>
              <span className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
                Інший актив…
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PlanHeader({
  title,
  pair,
  mode = 'daily',
  onBackToDaily,
  onGoWeekly,
  plans,
  onPickPlan,
  onAddPlan,
  onNewPlan,
  onShare,
  onOpenQuiz,
  isQuizFullyCompleted,
  quizCompletedCount,
  onAddTrade,
  onOpenTgAlert,
}) {
  const weekly = mode === 'weekly';
  return (
    <div className="mb-7 flex flex-col gap-6">
      {/* Верхній рядок: перемикач і дії — на одному рівні. Раніше
          перемикач стояв над заголовком окремим рядком, і дії опинялись
          десь між ним і назвою — жодного зі співставлень не читалось.
          Тепер це один рядок службових елементів, а заголовок унизу
          отримує весь рядок і звучить голосніше сам по собі. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Перемикач режимів, а не бейдж стану.

            Раніше в денному режимі це був нерухомий прямокутник, і
            перейти на тиждень можна було лише через модалку «новий
            план» — тобто найочевидніший елемент на екрані нічого не
            робив. Тепер це доріжка з двох станів: видно обидва режими
            одразу, і перехід коштує один клік у будь-який бік. */}
        {(() => {
          const MODES = [
            { id: 'daily', label: 'Daily', icon: CalendarDays, tone: T.acc, rgb: T.accRgb },
            { id: 'weekly', label: 'Weekly', icon: CalendarRange, tone: T.info, rgb: T.infoRgb },
          ];

          return (
            <div
              className="flex shrink-0 items-center gap-1 rounded-xl p-1"
              style={{ fontFamily: T.sans, background: T.sunken, border: `1px solid ${T.line}` }}
            >
              {MODES.map((m) => {
                const on = (m.id === 'weekly') === weekly;
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { if (!on) (m.id === 'weekly' ? onGoWeekly : onBackToDaily)?.(); }}
                    className="relative flex items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-200"
                    style={{ color: on ? m.tone : T.text4 }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text4; }}
                  >
                    {/* Підсвітка спільна на обидві кнопки — тому вона
                        переїжджає, а не блимає на новому місці. */}
                    {on && (
                      <motion.span
                        layoutId="plan-mode-pill"
                        className="absolute inset-0 rounded-lg"
                        style={{ background: `rgba(${m.rgb},0.16)`, border: `1px solid rgba(${m.rgb},0.28)` }}
                        transition={{ duration: 0.26, ease: EASE }}
                      />
                    )}
                    <Icon size={15} strokeWidth={2.4} className="relative shrink-0" />
                    <span className="relative text-[13.5px] font-semibold">{m.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {!weekly && (
          <PlanSwitcher plans={plans} current={pair} onPick={onPickPlan} onAdd={onAddPlan} />
        )}

        {/* Diagnostics-квіз про «сьогодні», а не про конкретний план,
            тому лишається однаковим і на денному, і на тижневому масштабі —
            «все те саме» навмисно, щоб хедер не міняв форму при перемиканні. */}
        <div className="flex flex-wrap items-center gap-2 no-print">
          <TextBtn
            icon={Briefcase}
            data-tour="plan-add-trade"
            onClick={onAddTrade}
            tone={T.ok}
            softBg={`rgba(${T.okRgb},0.08)`}
            softLine={`rgba(${T.okRgb},0.20)`}
          >
            Add trade
          </TextBtn>

          <button
            onClick={onOpenQuiz}
            className="flex h-[38px] items-center gap-2 rounded-xl px-3.5 text-[14px] font-semibold transition-all duration-200 active:scale-[0.97]"
            style={{
              background: isQuizFullyCompleted ? `rgba(${T.okRgb},0.08)` : `rgba(${T.warnRgb},0.07)`,
              border: `1px solid ${isQuizFullyCompleted ? `rgba(${T.okRgb},0.20)` : `rgba(${T.warnRgb},0.20)`}`,
              color: isQuizFullyCompleted ? T.ok : T.warn,
              fontFamily: T.sans,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.35)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
          >
            {isQuizFullyCompleted ? <Check size={14} strokeWidth={3} /> : <ClipboardCheck size={14} strokeWidth={2.3} />}
            Quiz
            <span className="tabular-nums opacity-70" style={{ fontFamily: T.sans }}>
              {quizCompletedCount}/4
            </span>
          </button>

          <div className="mx-1 h-6 w-px" style={{ background: T.line }} />

          <IconBtn icon={Send}    label="Telegram alert" onClick={onOpenTgAlert} tone={T.info} />
          <ShareBtn onShare={onShare} />

          {/* Головна дія хедера. Магнітний ефект прибрано — кнопка їхала
              з-під курсора; колір нейтральний, бо поруч уже є зелена
              «Add trade» і бурштиновий «Quiz», і фіолетовий з ними бився. */}
          <button
            data-tour="plan-new"
            onClick={onNewPlan}
            className="group ml-1 inline-flex h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            style={{
              background: T.text,
              color: 'var(--edge-bg, #0A0A0C)',
              fontFamily: T.sans,
              boxShadow: '0 8px 22px -10px var(--edge-panel-glow, rgba(0,0,0,0.5))',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 12px 28px -10px var(--edge-panel-glow, rgba(0,0,0,0.5))')}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 8px 22px -10px var(--edge-panel-glow, rgba(0,0,0,0.5))')}
          >
            <Plus size={15} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />
            {weekly ? 'New week' : 'New plan'}
          </button>
        </div>
      </div>

      {/* Нижній рядок: сама назва — тепер на всю ширину і без сусідів
          зверху, звучить як заголовок, а не тіснитись поруч з перемикачем. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1
          className="text-[28px] font-bold capitalize leading-none sm:text-[38px] lg:text-[46px]"
          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
        >
          {title}
        </h1>
        {/* Бейджа активу тут немає навмисно: він стоїть окремим полем
            у метаданих нижче, і дублювати його поруч із назвою дня —
            означало б двічі сказати те саме на одному екрані. */}
      </div>
    </div>
  );
}
