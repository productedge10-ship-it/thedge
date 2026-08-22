import { motion } from 'framer-motion';
import { Plus, Share2, Printer, ClipboardCheck, Briefcase, Send, Check } from 'lucide-react';
import { T, SPRING } from './planTheme';

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

export default function PlanHeader({
  title,
  pair,
  onNewPlan,
  onShare,
  onDownload,
  onOpenQuiz,
  isQuizFullyCompleted,
  quizCompletedCount,
  onAddTrade,
  onOpenTgAlert,
}) {
  return (
    <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
      {/* Заголовок */}
      <div className="min-w-0">
        <div
          className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]"
          style={{ fontFamily: T.sans, color: T.acc }}
        >
          Daily plan
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1
            className="text-[28px] font-bold capitalize leading-none sm:text-[38px] lg:text-[46px]"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
          >
            {title}
          </h1>
          {pair && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={SPRING}
              className="rounded-lg px-2.5 py-1 text-[15px] font-semibold tabular-nums"
              style={{
                fontFamily: T.sans,
                background: `rgba(${T.accRgb},0.10)`,
                border: `1px solid rgba(${T.accRgb},0.22)`,
                color: T.acc,
              }}
            >
              {pair}
            </motion.span>
          )}
        </div>
      </div>

      {/* Дії */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <TextBtn
          icon={Briefcase}
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
        <IconBtn icon={Share2}  label="Копіювати лінк"  onClick={onShare} />
        <IconBtn icon={Printer} label="Друк / PDF"      onClick={onDownload} />

        {/* Головна дія хедера. Магнітний ефект прибрано — кнопка їхала
            з-під курсора; колір нейтральний, бо поруч уже є зелена
            «Add trade» і бурштиновий «Quiz», і фіолетовий з ними бився. */}
        <button
          onClick={onNewPlan}
          className="group ml-1 inline-flex h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
          style={{
            background: T.text,
            color: 'var(--edge-bg, #0A0A0C)',
            fontFamily: T.sans,
            boxShadow: '0 6px 18px -8px rgba(250,250,250,0.35)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 10px 24px -8px rgba(250,250,250,0.5)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 6px 18px -8px rgba(250,250,250,0.35)')}
        >
          <Plus size={15} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />
          New plan
        </button>
      </div>
    </div>
  );
}
