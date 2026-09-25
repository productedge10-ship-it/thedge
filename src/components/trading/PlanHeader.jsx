import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { CalendarDays, CalendarRange, Plus, Share2, ClipboardCheck, Briefcase, Send, Check, Loader2, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Layers, LayoutGrid } from 'lucide-react';
import AssetIcon from '../ui/AssetIcon';
import AsciiDecode from '../ui/AsciiDecode';
import { T, SPRING, EASE } from './planTheme';
import { usePlanBlocks, PHASE_LABEL } from '../../lib/planBlocks';
import { weekRelLabel } from '../../lib/weekPlan';

/* ==================================================================
   Хедер плану. Раніше 6 різнокольорових кнопок кричали однаково
   голосно. Тепер одна первинна дія (New plan), решта — тихі іконки,
   підписи з'являються на hover.
================================================================== */

/* Оболонка головної кнопки — спільна для обох варіантів анімації.

   Була біла. Задум зрозумілий: поруч зелена «Add trade» і бурштиновий
   «Quiz», і фіолетовий з ними бився. Але біле на темному це не
   «нейтрально», а найгучніше, що можна поставити — у хедері вона
   читалась як чужий предмет. Тепер темна плашка, а фіолетовим
   світиться рамка, не заливка: із сусідами вона так не свариться. */
const CTA_STYLE = {
  fontFamily: T.sans,
  color: T.text,
  background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.sunken})`,
  border: `1px solid ${T.lineAcc}`,
  boxShadow: `0 10px 26px -14px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`,
};

/* Ховер світлом, без зсуву: кнопка стоїть крайньою в тісному рядку,
   і будь-який рух тягне сусідів за собою. */
const ctaIn = (e) => {
  e.currentTarget.style.boxShadow = `0 16px 36px -14px rgba(${T.accRgb},0.8), 0 0 0 3px rgba(${T.accRgb},0.13)`;
  e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.55)`;
};

const ctaOut = (e) => {
  e.currentTarget.style.boxShadow = CTA_STYLE.boxShadow;
  e.currentTarget.style.borderColor = T.lineAcc;
};

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
        /* Підказка потрібна саме тут: коли план обрано, на кнопці
           стоїть лише назва активу, і здогадатись, що по ній
           перемикаються, можна тільки клікнувши. */
        title={plans.length > 1
          ? 'Перемкнутись між планами на сьогодні'
          : 'Плани на сьогодні'}
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
          {/* Множина навмисно. «План» читається як назва розділу —
              тобто як кнопка, що кудись веде. «Плани» одразу каже,
              що їх декілька і що тут між ними вибирають. */}
          {current || 'Плани'}
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
            className="plan-dropdown-panel absolute right-0 top-[calc(100%+8px)] z-[80] w-[232px] overflow-hidden rounded-2xl p-1.5"
            style={{
              background: T.surfaceHi,
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 30px 70px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
              {plans.length > 1 ? 'Перемкнутись на план' : 'Плани на сьогодні'}
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
                Планів на сьогодні ще немає
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
                {plans.length ? 'Ще один актив…' : 'Створити план…'}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------
   Блоки плану.

   Раніше це була панель угорі сторінки, під метаданими. Вона мала
   дві біди, і обидві структурні, а не косметичні.

   Перша: місце. Блоки налаштовують раз на місяць, а панель бачили
   щодня — і щодня вона відтісняла сам план униз. Навіть згорнута в
   один рядок вона лишалась першим, що читає око на сторінці, яка
   взагалі не про налаштування.

   Друга: пунктир означав у ній дві різні речі одночасно. Контейнер
   був обведений пунктиром просто як оздоба, а вимкнений блок
   усередині — теж пунктиром, але вже зі змістом «сюди можна додати».
   Один сигнал, два значення, в одному компоненті: око читає це як
   недомальоване.

   Тут обидві зникають самі. Налаштування живе серед інших службових
   кнопок хедера, а на місці пунктиру — звичайний список із
   галочками, той самий, що в перемикачі планів поруч.
------------------------------------------------------------------ */
function BlocksMenu({ mode }) {
  const { blocks, isVisible, toggle, hidden } = usePlanBlocks(mode);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const shown = blocks.length - blocks.filter((b) => hidden.includes(b.id)).length;

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

  const phases = ['plan', 'live', 'review'];

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Блоки плану"
        title="Блоки плану"
        className="group relative flex h-[38px] items-center gap-2 rounded-xl px-3 transition-all duration-200 active:scale-[0.97]"
        style={{
          fontFamily: T.sans,
          background: open ? T.surfaceHi : T.surface,
          border: `1px solid ${open ? T.lineAcc : T.line}`,
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
      >
        <LayoutGrid size={15} strokeWidth={2.2} style={{ color: open ? T.acc : T.text2 }} />
        {/* Показуємо лічильник, лише коли щось приховано. Постійне
            «8 з 8» — це шум: воно не повідомляє нічого, поки людина
            сама нічого не змінила. */}
        {shown < blocks.length && (
          <span
            className="rounded-md px-1.5 text-[11px] font-bold tabular-nums"
            style={{ background: `rgba(${T.accRgb},0.14)`, color: T.acc }}
          >
            {shown}/{blocks.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.17, ease: EASE }}
            className="plan-dropdown-panel absolute right-0 top-[calc(100%+8px)] z-[80] w-[264px] overflow-hidden rounded-2xl p-1.5"
            style={{
              background: T.surfaceHi,
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 30px 70px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div
              className="px-2.5 pb-2 pt-1.5 text-[12px] leading-[17px]"
              style={{ fontFamily: T.sans, color: T.text3 }}
            >
              Залиш тільки те, чим користуєшся. Записи прихованих блоків не зникають.
            </div>

            <div className="max-h-[52vh] overflow-y-auto">
              {phases.map((phase) => {
                const list = blocks.filter((b) => b.phase === phase);
                if (!list.length) return null;
                return (
                  <div key={phase}>
                    <div
                      className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{ fontFamily: T.sans, color: T.text3 }}
                    >
                      {PHASE_LABEL[phase]}
                    </div>

                    {list.map((b) => {
                      const on = isVisible(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={on}
                          onClick={() => toggle(b.id)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150"
                          onMouseEnter={(e) => { e.currentTarget.style.background = T.surface; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          {/* Стан читається заливкою й галочкою, а не
                              типом рамки: суцільна проти пунктирної на
                              двадцяти пікселях не розрізняється зовсім. */}
                          <span
                            className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg transition-colors duration-200"
                            style={{
                              background: on ? `rgba(${T.okRgb},0.16)` : 'transparent',
                              border: `1px solid ${on ? `rgba(${T.okRgb},0.32)` : T.lineHi}`,
                              color: on ? T.ok : T.text3,
                            }}
                          >
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.span
                                key={on ? 'on' : 'off'}
                                initial={{ scale: 0.4, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.4, opacity: 0 }}
                                transition={{ duration: 0.14 }}
                                className="grid place-items-center"
                              >
                                {on ? <Check size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={2.8} />}
                              </motion.span>
                            </AnimatePresence>
                          </span>

                          <span
                            className="flex-1 truncate text-[13.5px] font-semibold"
                            style={{ fontFamily: T.sans, color: on ? T.text2 : T.text3 }}
                          >
                            {b.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------
   Гортання тижнів.

   Стрілки стоять впритул до самої дати, а не серед дій угорі: вони
   міняють те, що написано поруч, і читатись мають як частина
   заголовка. У ряду з «Add trade» і «Quiz» вони б означали дію над
   планом, а не над тим, який план відкрито.
------------------------------------------------------------------ */
function WeekArrow({ dir, onClick }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      title={dir === 'prev' ? 'Попередній тиждень' : 'Наступний тиждень'}
      aria-label={dir === 'prev' ? 'Попередній тиждень' : 'Наступний тиждень'}
      className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl transition-all duration-200 active:scale-95"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.background = T.surfaceHi; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line;   e.currentTarget.style.background = T.surface; }}
    >
      <Icon size={17} strokeWidth={2.4} style={{ color: T.text2 }} />
    </button>
  );
}

/* Підпис відстані: «6 – 12 October» саме по собі не каже, попереду це
   чи позаду. Коли тиждень не той, який зараз планують, підпис стає
   кнопкою повернення — інакше з гортання нема швидкого виходу. */
function WeekChip({ offset, canReturn, onReturn }) {
  const label = weekRelLabel(offset);
  const tone = offset === 0 ? T.acc : offset > 0 ? T.info : T.text3;
  const rgb  = offset === 0 ? T.accRgb : offset > 0 ? T.infoRgb : null;

  const style = {
    fontFamily: T.sans,
    color: tone,
    background: rgb ? `rgba(${rgb},0.10)` : T.surface,
    border: `1px solid ${rgb ? `rgba(${rgb},0.24)` : T.line}`,
  };

  if (!canReturn) {
    return (
      <span className="flex h-[30px] items-center rounded-lg px-2.5 text-[12.5px] font-semibold" style={style}>
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onReturn}
      title="Повернутись до тижня, який плануєш"
      className="flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-all duration-200 active:scale-[0.97]"
      style={style}
      onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.35)')}
      onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
    >
      <RotateCcw size={12} strokeWidth={2.6} />
      {label}
    </button>
  );
}

export default function PlanHeader({
  title,
  pair,
  mode = 'daily',
  weekOffset = 0,
  canReturnToWeek = false,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onBackToDaily,
  onGoWeekly,
  plans,
  onPickPlan,
  onAddPlan,
  onNewPlan,
  onOpenTgAlert,
  onShare,
  onOpenQuiz,
  isQuizFullyCompleted,
  quizCompletedCount,
  onAddTrade,
}) {
  const weekly = mode === 'weekly';

  /* Ховер головної кнопки тримаємо станом, а не тільки в CSS:
     розшифровка підпису — це JS, і йому потрібен сигнал. Решта
     анімації лишається на :hover, щоб рух не залежав від
     перерендерів. */
  const [hot, setHot] = useState(false);

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

          <BlocksMenu mode={mode} />
          {/* Нагадування, а не «Telegram alert».

              Вікно робило дві різні речі одразу: привʼязувало акаунт до
              бота і ставило таймер. Привʼязка переїхала в налаштування —
              її роблять один раз і назавжди, а в шапці плану лишились
              тільки щоденні дії.

              Назва теж змінилась: «Telegram» називало канал доставки, а
              людина в цю мить думає не про канал, а про те, що хоче, аби
              їй нагадали. */}
          <IconBtn icon={Send} label="Нагадування" onClick={onOpenTgAlert} tone={T.info} />
          <ShareBtn onShare={onShare} />

          {/* Головна дія хедера. */}
          <button
            data-tour="plan-new"
            onClick={onNewPlan}
            className="plan-cta group relative ml-1 inline-flex h-[38px] shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl px-4 text-[14px] font-bold active:scale-[0.98]"
            style={CTA_STYLE}
            onMouseEnter={(e) => { setHot(true); ctaIn(e); }}
            onMouseLeave={(e) => { setHot(false); ctaOut(e); }}
            onFocus={() => setHot(true)}
            onBlur={() => setHot(false)}
          >
            {/* Тло — маленький термінал.

                ASCII тут не прикраса й не данина ретро: план — єдине
                місце застосунку, де малюють те, чого ще не сталося, а
                символьний графік виглядає саме як накидка, ескіз. І він
                чесно дешевий: два рядки тексту й один clip-path проти
                десятка SVG-анімацій, які тут стояли раніше.

                `steps()` на друкуванні обовʼязковий. Плавний clip-path
                виглядає як штора, що їде; ступінчастий — як символи, що
                зʼявляються по одному. Різниця в одному слові, а жест
                виходить зовсім інший. */}
            <pre className="plan-ascii" aria-hidden="true">
              <span className="plan-ascii-dots">· · · · · · · · · · · ·</span>
              <span className="plan-ascii-spark">▁▂▁▃▂▄▃▅▆▅▇▆█▇█</span>
            </pre>

            {/* Промінь сканера доганяє друк і гасне за правим краєм —
                він і ставить крапку в жесті. */}
            <span className="plan-scan" aria-hidden="true" />

            <span className="plan-cta-label relative flex items-center gap-2">
              <span className="plan-cta-icon">
                <Plus size={15} strokeWidth={3} className="plan-cta-plus" />
                <span className="plan-cta-prompt" aria-hidden="true">›</span>
              </span>
              {/* Підпис не зникає, а перебирається символами й стає
                  командою. Верхній регістр тут не косметика: рядок із
                  курсором має читатись як щось, що ввели, а не як
                  назва кнопки. */}
              {/* Ширину тримає невидимий двійник, набраний у найширшому
                  зі станів. Без нього кнопка дихала на кожному ховері:
                  моноширинний верхній регістр із розрядкою помітно
                  ширший за звичайний підпис, а кнопка стоїть крайньою
                  в тісному рядку й тягла б за собою сусідів.

                  Кінцевий текст лишається кодом, а не чистим «NEW
                  PLAN»: рядок має виглядати як щось введене в
                  термінал, і саме недочитаність робить його таким.
                  Але читатись він мусить з першого погляду, тому
                  підміни рівно три і всі очевидні. */}
              <span className="plan-cta-text">
                <span className="plan-cta-sizer" aria-hidden="true">
                  {weekly ? 'N3W_W33K' : 'N3W_PL4N'}
                </span>
                <AsciiDecode
                  text={weekly ? 'New week' : 'New plan'}
                  alt={weekly ? 'N3W_W33K' : 'N3W_PL4N'}
                  active={hot}
                  className="plan-cta-live"
                />
              </span>
              <span className="plan-caret" aria-hidden="true">▌</span>
            </span>
          </button>
        </div>
      </div>

      {/* Нижній рядок: сама назва — тепер на всю ширину і без сусідів
          зверху, звучить як заголовок, а не тіснитись поруч з перемикачем. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {weekly && <WeekArrow dir="prev" onClick={onPrevWeek} />}

        <h1
          className="edge-page-title capitalize"
          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
        >
          {title}
        </h1>

        {weekly && <WeekArrow dir="next" onClick={onNextWeek} />}
        {weekly && (
          <WeekChip offset={weekOffset} canReturn={canReturnToWeek} onReturn={onThisWeek} />
        )}
        {/* Бейджа активу тут немає навмисно: він стоїть окремим полем
            у метаданих нижче, і дублювати його поруч із назвою дня —
            означало б двічі сказати те саме на одному екрані. */}
      </div>
    </div>
  );
}
