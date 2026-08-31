import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import {
  ArrowLeft, CalendarDays, ChevronDown, Check, TrendingUp, Save,
  Loader2, History, AlertTriangle, Eye,
} from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import DateField from '../ui/DateField';
import MaterialPreview from './MaterialPreview';
import {
  PROMPTS, EMOTIONS, SCORE_LABELS, MISTAKE_TYPES,
  fmtDate, fmtR, fmtRange, rOf,
} from '../../lib/reviewsData';

/* ==================================================================
   Новий розбір.

   Одна вузька колонка й порядок згори вниз: період → матеріал →
   що обіцяв минулого разу → висновок. Дві колонки з липкою панеллю
   праворуч виглядали як форма, яку треба заповнити всю; тут же
   видно, що обовʼязкові лише два кроки з шести.

   Усе, крім висновку, згорнуте. Матеріал за місяць — це сотня
   рядків, і розгорнутим він ховає власне те, заради чого сюди
   прийшли.

   Геометрія з макета редизайну, кольори — проєктні токени.
================================================================== */

const PRESETS = [
  { key: 'day', label: 'День', days: 0 },
  { key: 'week', label: 'Тиждень', days: 6 },
  { key: 'month', label: 'Місяць', days: 29 },
];

const mono = (size, extra = {}) => ({ fontFamily: T.mono, fontSize: size, ...extra });

const cut = (s, n = 74) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);

function Chevron({ open, size = 17 }) {
  return (
    <span
      className="flex shrink-0"
      style={{ transition: 'transform .22s', transform: `rotate(${open ? 180 : 0}deg)` }}
    >
      <ChevronDown size={size} strokeWidth={1.9} style={{ color: T.text2 }} />
    </span>
  );
}

/* Розкривна панель.

   Анімуємо саме висоту, а не саму лише прозорість: зі стрибком висоти
   вміст зʼявлявся вже обрізаним і смикав усе, що під ним.

   Три деталі, без яких воно однаково виглядає зламано:

   • overflow: hidden потрібен, поки йде рух, і шкодить після нього —
     інакше він обріже textarea, що виріс під довгий текст. Тому
     знімаємо його по завершенні відкриття.
   • Висота рахується від вмісту, тож усі внутрішні відступи мусять
     бути на вкладеному елементі. На самій панелі padding не давав би
     їй скластися до нуля.
   • Прозорість веде трохи попереду висоти й гасне швидше, ніж
     проявляється: інакше на згортанні півкадру видно порожню коробку.
*/
function Fold({ open, children }) {
  const [clip, setClip] = useState(true);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="fold"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { duration: 0.32, ease: EASE },
            opacity: { duration: 0.22, ease: EASE },
          }}
          onAnimationStart={() => setClip(true)}
          onAnimationComplete={(d) => setClip(d?.height === 0)}
          style={{ overflow: clip ? 'hidden' : 'visible', borderTop: `1px solid ${T.line}` }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const panel = {
  borderRadius: 16,
  background: T.surface,
  border: `1px solid ${T.line}`,
  overflow: 'hidden',
};

function FoldHead({ onClick, children }) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center justify-between"
      style={{ gap: 20, padding: '17px 20px', transition: 'background .18s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ReviewBuilder({
  onBack,
  range, onRange,
  stats, material, loadingMaterial,
  selected, onToggle,
  repeats,
  score, onScore,
  emotions, onEmotion,
  answers, onAnswer,
  lesson, onLesson,
  prevReview, keptPromises, onKeptPromise,
  saving, onSave,
}) {
  const [statsOpen, setStatsOpen] = useState(false);
  const [matOpen, setMatOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const [tab, setTab] = useState('trades');
  /* Що зараз розглядаємо зблизька. Тримаємо id, а не сам обʼєкт: після
     зміни періоду список перечитується, і збережена копія показувала б
     те, чого в матеріалі вже немає. */
  const [previewId, setPreviewId] = useState(null);
  /* Відкритий крок один: це анкета з шести питань, і всі розгорнуті
     разом знову перетворюють її на полотно полів. */
  const [step, setStep] = useState(1);

  const applyPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    onRange({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) });
  };

  const activePreset = PRESETS.find((p) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - p.days);
    return start.toISOString().slice(0, 10) === range.from && end.toISOString().slice(0, 10) === range.to;
  })?.key;

  const counts = {
    trades: material.trades.length,
    plans: material.plans.length,
    mistakes: material.mistakes.length,
  };
  const list = material[tab];
  const pickedTotal = selected.trades.length + selected.plans.length + selected.mistakes.length;
  const allPicked = list.length > 0 && selected[tab].length === list.length;

  const toggleAll = () => {
    list.forEach((item) => {
      const on = selected[tab].includes(item.id);
      if (allPicked ? on : !on) onToggle(tab, item.id);
    });
  };

  const repeated = (repeats || []).filter((r) => r.before > 0);

  const preview = previewId ? list.find((x) => x.id === previewId) : null;

  const donePromises = prevReview
    ? (prevReview.promises || []).filter((_, i) => keptPromises[i] === true).length
    : 0;

  /* Шість кроків висновку: оцінка, стан і чотири тексти. */
  const textSteps = [
    ...PROMPTS.map((p) => ({ key: p.id, title: p.label, hint: p.question, placeholder: p.placeholder })),
    {
      key: 'lesson',
      title: 'Одна зміна на наступний період',
      hint: 'те, що ти реально зробиш',
      placeholder: 'Наприклад: жодної угоди поза London — азія закрита.',
      accent: true,
    },
  ];

  const valueOf = (key) => (key === 'lesson' ? lesson : answers[key] || '');
  const setValue = (key, v) => (key === 'lesson' ? onLesson(v) : onAnswer(key, v));

  const filled = [
    score > 0,
    emotions.length > 0,
    ...textSteps.map((t) => !!valueOf(t.key).trim()),
  ];
  const filledCount = filled.filter(Boolean).length;

  const ready = score > 0 && lesson.trim();

  const steps = [
    {
      title: 'Дисципліна періоду',
      hint: 'Наскільки ти тримався плану весь період?',
      preview: score ? `${score} / 5 · ${SCORE_LABELS[score]}` : 'не оцінено',
      kind: 'rating',
    },
    {
      title: 'Стан за період',
      hint: 'Що переважало — обери все, що було.',
      preview: emotions.length
        ? emotions.map((id) => EMOTIONS.find((e) => e.id === id)?.label).filter(Boolean).join(' · ')
        : 'не обрано',
      kind: 'chips',
    },
    ...textSteps.map((t) => ({
      ...t,
      kind: 'text',
      preview: valueOf(t.key).trim() ? cut(valueOf(t.key).trim()) : 'не заповнено',
    })),
  ];

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 860 }}>

      {/* ─────────── шапка ─────────── */}
      <div className="flex flex-wrap items-center" style={{ gap: 16, padding: '4px 0 22px' }}>
        <button
          onClick={onBack}
          title="До списку розборів"
          className="grid shrink-0 place-items-center"
          style={{
            width: 38, height: 38, borderRadius: 11,
            border: `1px solid ${T.line}`, background: T.surfaceHi,
            color: T.text2, transition: 'all .18s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
        >
          <ArrowLeft size={16} strokeWidth={1.9} />
        </button>

        <div className="min-w-0 flex-1" style={{ minWidth: 150 }}>
          <div className="uppercase" style={mono(9.5, { letterSpacing: '2.4px', color: T.acc })}>
            Розбори
          </div>
          <div
            style={{
              fontFamily: T.display, marginTop: 7, fontSize: 26,
              fontWeight: 600, letterSpacing: '-0.6px', color: T.text,
            }}
          >
            Новий розбір
          </div>
        </div>

        <div
          className="flex w-full shrink-0 sm:w-auto"
          style={{ gap: 3, padding: 4, borderRadius: 12, background: T.surfaceHi, border: `1px solid ${T.line}` }}
        >
          {PRESETS.map((p) => {
            const on = activePreset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => applyPreset(p.days)}
                className="flex-1 sm:flex-none"
                style={{
                  fontFamily: T.sans, height: 32, padding: '0 14px', borderRadius: 9,
                  fontSize: 13, transition: 'all .18s',
                  background: on ? T.line : 'transparent',
                  color: on ? T.text : T.text3,
                  fontWeight: on ? 500 : 400,
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────── період і цифри ─────────── */}
      <div style={panel}>
        <div
          onClick={() => setStatsOpen((v) => !v)}
          className="flex cursor-pointer flex-wrap items-center justify-between"
          style={{ gap: 14, padding: '16px 20px', transition: 'background .18s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div className="flex min-w-0 items-center" style={{ gap: 14 }}>
            <CalendarDays size={16} strokeWidth={1.8} className="shrink-0" style={{ color: T.text2 }} />
            <span className="truncate" style={mono(13.5, { color: T.text2 })}>
              {fmtRange(range.from, range.to)}
            </span>
          </div>

          <div className="flex flex-wrap items-center" style={{ gap: 22 }}>
            <Pair value={stats.total} unit="угод" />
            <Pair
              value={fmtR(stats.netR)}
              unit="net"
              tone={stats.netR > 0 ? T.ok : stats.netR < 0 ? T.bad : T.text}
            />
            <Pair value={stats.mistakes} unit="помилок" tone={stats.mistakes > 0 ? T.warn : T.text} />
            <Chevron open={statsOpen} size={16} />
          </div>
        </div>

        <Fold open={statsOpen}>
          {/* Довільні дати. У макеті їх не було — там смуга тільки
              розкриває цифри. Але без них лишились би три пресети й
              жодного способу розібрати, скажімо, конкретний тиждень
              місячної давнини. */}
          <div
            className="flex flex-wrap items-center"
            style={{ gap: 10, padding: '14px 20px', borderBottom: `1px solid ${T.line}` }}
          >
            <span className="shrink-0" style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text2 }}>
              Свій період
            </span>
            <div className="min-w-[150px] flex-1">
              <DateField
                value={range.from}
                onChange={(v) => onRange({ from: v, to: range.to })}
                height={38}
                monthStyle="short"
                fontSize={13}
                fontWeight={500}
              />
            </div>
            <span className="shrink-0" style={{ color: T.text3 }}>—</span>
            <div className="min-w-[150px] flex-1">
              <DateField
                value={range.to}
                onChange={(v) => onRange({ from: range.from, to: v })}
                align="right"
                height={38}
                monthStyle="short"
                fontSize={13}
                fontWeight={500}
              />
            </div>
          </div>

          <div className="grid grid-cols-3" style={{ background: T.sunken }}>
            <Metric label="Win rate" value={`${Math.round(stats.winrate)}%`} />
            <Metric
              label="За планом"
              value={`${Math.round(stats.planRate)}%`}
              tone={stats.total ? (stats.planRate >= 70 ? T.ok : T.warn) : T.text}
            />
            <Metric
              label="Ціна помилок"
              value={stats.costOfMistakes ? fmtR(stats.costOfMistakes) : '0R'}
              tone={stats.costOfMistakes < 0 ? T.bad : T.text}
              last
            />
          </div>
        </Fold>
      </div>

      {/* ─────────── що розбираємо ─────────── */}
      <div style={{ ...panel, marginTop: 12 }}>
        <FoldHead onClick={() => setMatOpen((v) => !v)}>
          <div className="flex min-w-0 items-center" style={{ gap: 14 }}>
            <span
              className="grid shrink-0 place-items-center"
              style={{ width: 34, height: 34, borderRadius: 10, background: T.surfaceHi, border: `1px solid ${T.line}` }}
            >
              <TrendingUp size={16} strokeWidth={1.9} style={{ color: T.text2 }} />
            </span>
            <div className="min-w-0">
              <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 600, color: T.text }}>
                Що розбираємо
              </div>
              <div style={{ fontFamily: T.sans, marginTop: 3, fontSize: 12.5, color: T.text2 }}>
                {loadingMaterial ? (
                  <span className="inline-flex items-center" style={{ gap: 6 }}>
                    <Loader2 size={12} className="animate-spin" style={{ color: T.acc }} />
                    збираю за період…
                  </span>
                ) : pickedTotal
                  ? `обрано ${pickedTotal} з ${counts.trades + counts.plans + counts.mistakes}`
                  : `${counts.trades} угод · ${counts.plans} планів · ${counts.mistakes} помилок`}
              </div>
            </div>
          </div>
          <Chevron open={matOpen} />
        </FoldHead>

        <Fold open={matOpen}>
          <div
            className="flex flex-wrap items-center justify-between"
            style={{ gap: 12, padding: '12px 20px', background: T.sunken, borderBottom: `1px solid ${T.line}` }}
          >
            <div className="flex" style={{ gap: 3 }}>
              {[
                { key: 'trades', label: 'Угоди' },
                { key: 'plans', label: 'Плани' },
                { key: 'mistakes', label: 'Помилки' },
              ].map((t) => {
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className="flex items-center"
                    style={{
                      fontFamily: T.sans, gap: 8, height: 32, padding: '0 13px', borderRadius: 9,
                      fontSize: 13, fontWeight: 500, transition: 'all .18s',
                      background: on ? T.surfaceHi : 'transparent',
                      color: on ? T.text : T.text3,
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                  >
                    {t.label}
                    <span style={mono(11, { color: on ? T.acc : T.text3 })}>{counts[t.key]}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={toggleAll}
              disabled={!list.length}
              style={{
                fontFamily: T.sans, fontSize: 12.5, color: T.text2,
                opacity: list.length ? 1 : 0.4, transition: 'color .18s',
              }}
              onMouseEnter={(e) => { if (list.length) e.currentTarget.style.color = T.acc; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; }}
            >
              {allPicked ? 'зняти все' : 'вибрати все'}
            </button>
          </div>

          <div className="custom-scrollbar" style={{ maxHeight: 330, overflowY: 'auto' }}>
            {list.length === 0 ? (
              <p style={{ fontFamily: T.sans, padding: '40px 20px', textAlign: 'center', fontSize: 14, color: T.text3 }}>
                За цей період нічого немає.
              </p>
            ) : (
              list.map((item) => (
                <MaterialRow
                  key={item.id}
                  kind={tab}
                  item={item}
                  on={selected[tab].includes(item.id)}
                  onToggle={() => onToggle(tab, item.id)}
                  onPreview={() => setPreviewId(item.id)}
                />
              ))
            )}
          </div>

          {/* Повтори. Головна цінність розбору: якщо помилка вже була
              раніше, це не випадковість, а звичка. */}
          {repeated.map((r) => {
            const meta = MISTAKE_TYPES[r.type] || { label: r.type };
            return (
              <div
                key={r.type}
                className="flex items-center"
                style={{
                  gap: 12, padding: '14px 20px',
                  background: `rgba(${T.warnRgb},0.05)`,
                  borderTop: `1px solid rgba(${T.warnRgb},0.14)`,
                }}
              >
                <AlertTriangle size={16} strokeWidth={1.7} className="shrink-0" style={{ color: T.warn }} />
                <div className="min-w-0 flex-1">
                  <div style={{ fontFamily: T.sans, fontSize: 13.5, fontWeight: 600, color: T.warn }}>
                    {meta.label} повторюється
                  </div>
                  <div style={{ fontFamily: T.sans, marginTop: 3, fontSize: 12.5, color: T.text2 }}>
                    {r.now} у цьому періоді · {r.before} раніше
                  </div>
                </div>
                {r.cost ? (
                  <span className="shrink-0" style={mono(12.5, { color: T.warn })}>{fmtR(r.cost)}</span>
                ) : null}
              </div>
            );
          })}
        </Fold>
      </div>

      {/* ─────────── минулого разу ─────────── */}
      {prevReview && (
        <div style={{ ...panel, marginTop: 12 }}>
          <FoldHead onClick={() => setPrevOpen((v) => !v)}>
            <div className="flex min-w-0 items-center" style={{ gap: 14 }}>
              <span
                className="grid shrink-0 place-items-center"
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: `rgba(${T.accRgb},0.12)`, border: `1px solid rgba(${T.accRgb},0.28)`,
                }}
              >
                <History size={16} strokeWidth={1.8} style={{ color: T.acc }} />
              </span>
              <div className="min-w-0">
                <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 600, color: T.text }}>
                  Минулого разу ти обіцяв
                </div>
                <div className="truncate" style={{ fontFamily: T.sans, marginTop: 3, fontSize: 12.5, color: T.text2 }}>
                  {fmtRange(prevReview.from, prevReview.to)} · {donePromises}/{(prevReview.promises || []).length} виконано
                </div>
              </div>
            </div>
            <Chevron open={prevOpen} />
          </FoldHead>

          <Fold open={prevOpen}>
            <div style={{ padding: '18px 20px 20px' }}>
              <div
                style={{
                  padding: '16px 18px', borderRadius: 13,
                  background: `rgba(${T.accRgb},0.06)`, borderLeft: `2px solid ${T.acc}`,
                }}
              >
                <p style={{ fontFamily: T.sans, fontSize: 14.5, lineHeight: '25px', color: T.text2 }}>
                  {prevReview.lesson}
                </p>
              </div>

              <div className="flex flex-col" style={{ marginTop: 12, gap: 7 }}>
                {(prevReview.promises || []).map((p, i) => {
                  const on = keptPromises[i] === true;
                  return (
                    <button
                      key={p.text}
                      onClick={() => onKeptPromise(i, on ? null : true)}
                      className="flex items-center text-left"
                      style={{
                        gap: 13, padding: '13px 16px', borderRadius: 12, transition: 'all .18s',
                        background: on ? `rgba(${T.okRgb},0.06)` : T.surfaceHi,
                        border: `1px solid ${on ? `rgba(${T.okRgb},0.25)` : T.line}`,
                      }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = T.line; }}
                    >
                      <Box on={on} tone={T.ok} />
                      <span
                        className="min-w-0 flex-1"
                        style={{ fontFamily: T.sans, fontSize: 14, lineHeight: '21px', color: on ? T.text2 : T.text }}
                      >
                        {p.text}
                      </span>
                      <span
                        className="shrink-0"
                        style={mono(10.5, { letterSpacing: '.5px', color: on ? T.ok : T.text3 })}
                      >
                        {on ? 'виконано' : 'не виконано'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Fold>
        </div>
      )}

      {/* ─────────── висновок ─────────── */}
      <div className="flex items-center justify-between" style={{ gap: 16, marginTop: 30 }}>
        <div className="uppercase" style={mono(10, { letterSpacing: '2.4px', color: T.text2 })}>
          Висновок
        </div>
        <div className="flex items-center" style={{ gap: 12 }}>
          <div style={{ width: 110, height: 3, borderRadius: 99, background: T.line, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%', borderRadius: 99, background: T.acc,
                width: `${Math.round((filledCount / 6) * 100)}%`, transition: 'width .25s',
              }}
            />
          </div>
          <span style={mono(11, { color: T.text2 })}>{filledCount}/6</span>
        </div>
      </div>

      <div className="flex flex-col" style={{ marginTop: 14, gap: 8 }}>
        {steps.map((st, i) => {
          const num = i + 1;
          const open = step === num;
          const isFilled = filled[i];
          return (
            <div
              key={st.title}
              style={{
                borderRadius: 16, overflow: 'hidden', transition: 'all .2s',
                background: open ? T.surfaceHi : T.surface,
                border: `1px solid ${open ? T.lineHi : T.line}`,
              }}
            >
              <div
                onClick={() => setStep(open ? 0 : num)}
                className="flex cursor-pointer items-center"
                style={{ gap: 14, padding: '17px 20px', transition: 'background .18s' }}
              >
                <span
                  className="grid shrink-0 place-items-center"
                  style={{
                    width: 24, height: 24, borderRadius: 8, transition: 'all .18s',
                    ...mono(11),
                    background: isFilled
                      ? `rgba(${T.okRgb},0.13)`
                      : st.accent ? `rgba(${T.accRgb},0.14)` : T.sunken,
                    border: `1px solid ${isFilled
                      ? `rgba(${T.okRgb},0.32)`
                      : st.accent ? `rgba(${T.accRgb},0.34)` : T.line}`,
                    color: isFilled ? T.ok : st.accent ? T.acc : T.text3,
                  }}
                >
                  {num}
                </span>

                <div className="min-w-0 flex-1">
                  <div
                    style={{
                      fontFamily: T.sans, fontSize: 14.5, fontWeight: 600,
                      letterSpacing: '.1px', color: open ? T.text : T.text2,
                    }}
                  >
                    {st.title}
                  </div>
                  <div
                    className="truncate"
                    style={{
                      fontFamily: T.sans, marginTop: 4, fontSize: 12.5, lineHeight: '19px',
                      color: isFilled ? T.text2 : T.text3,
                    }}
                  >
                    {st.preview}
                  </div>
                </div>

                <Chevron open={open} />
              </div>

              <Fold open={open}>
                <div style={{ padding: '4px 20px 22px 54px' }}>
                  <div style={{ fontFamily: T.sans, paddingTop: 16, fontSize: 13, color: T.text2 }}>
                    {st.hint}
                  </div>

                  {st.kind === 'rating' && (
                    <div className="grid grid-cols-5" style={{ marginTop: 14, gap: 8 }}>
                      {[1, 2, 3, 4, 5].map((n) => {
                        const on = score === n;
                        return (
                          <button
                            key={n}
                            onClick={() => onScore(on ? 0 : n)}
                            title={SCORE_LABELS[n]}
                            style={{
                              height: 44, borderRadius: 12, transition: 'all .18s',
                              ...mono(15, { fontWeight: 600 }),
                              background: on ? `rgba(${T.accRgb},0.16)` : T.sunken,
                              border: `1px solid ${on ? T.acc : T.line}`,
                              color: on ? T.acc : T.text3,
                            }}
                            onMouseEnter={(e) => { if (!on) { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; } }}
                            onMouseLeave={(e) => { if (!on) { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; } }}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {st.kind === 'chips' && (
                    <div className="flex flex-wrap" style={{ marginTop: 14, gap: 8 }}>
                      {EMOTIONS.map((e) => {
                        const on = emotions.includes(e.id);
                        const c = e.good ? T.ok : T.warn;
                        return (
                          <button
                            key={e.id}
                            onClick={() => onEmotion(e.id)}
                            style={{
                              fontFamily: T.sans, height: 34, padding: '0 15px', borderRadius: 10,
                              fontSize: 13.5, fontWeight: 500, transition: 'all .18s',
                              background: on ? `${c}1c` : T.sunken,
                              border: `1px solid ${on ? `${c}55` : T.line}`,
                              color: on ? c : T.text2,
                            }}
                            onMouseEnter={(ev) => { if (!on) { ev.currentTarget.style.borderColor = T.lineHi; ev.currentTarget.style.color = T.text; } }}
                            onMouseLeave={(ev) => { if (!on) { ev.currentTarget.style.borderColor = T.line; ev.currentTarget.style.color = T.text2; } }}
                          >
                            {e.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {st.kind === 'text' && (
                    <TextareaAutosize
                      value={valueOf(st.key)}
                      onChange={(e) => setValue(st.key, e.target.value)}
                      placeholder={st.placeholder}
                      minRows={3}
                      className="w-full outline-none"
                      style={{
                        fontFamily: T.sans, marginTop: 14, padding: '15px 17px', borderRadius: 13,
                        background: T.sunken,
                        border: `1px solid ${st.accent ? `rgba(${T.accRgb},0.3)` : T.line}`,
                        color: T.text, fontSize: 14.5, lineHeight: '24px',
                        resize: 'vertical', transition: 'all .18s',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = T.acc; }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = st.accent ? `rgba(${T.accRgb},0.3)` : T.line;
                      }}
                    />
                  )}
                </div>
              </Fold>
            </div>
          );
        })}
      </div>

      {/* ─────────── збереження ─────────── */}
      <div className="flex items-center" style={{ marginTop: 24, gap: 12 }}>
        <button
          onClick={onSave}
          disabled={!ready || saving}
          className="flex flex-1 items-center justify-center"
          style={{
            fontFamily: T.sans, gap: 10, height: 52, borderRadius: 14,
            background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)',
            fontSize: 15, fontWeight: 600, transition: 'all .18s',
            opacity: ready && !saving ? 1 : 0.4,
            cursor: ready && !saving ? 'pointer' : 'not-allowed',
            boxShadow: ready ? `0 16px 34px -18px rgba(${T.accRgb},0.9)` : 'none',
          }}
        >
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={1.9} />}
          Зберегти розбір
        </button>

        <button
          onClick={onBack}
          style={{
            fontFamily: T.sans, height: 52, padding: '0 22px', borderRadius: 14,
            border: `1px solid ${T.line}`, color: T.text2, fontSize: 14, transition: 'all .18s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text2; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
        >
          Скасувати
        </button>
      </div>

      <p style={{ fontFamily: T.sans, marginTop: 12, textAlign: 'center', fontSize: 12.5, color: T.text3 }}>
        Постав оцінку дисципліни й напиши одну зміну — решта не обовʼязкова
      </p>

      <AnimatePresence>
        {preview && (
          <MaterialPreview
            key="preview"
            kind={tab}
            item={preview}
            selected={selected[tab].includes(preview.id)}
            onToggle={() => onToggle(tab, preview.id)}
            onClose={() => setPreviewId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Pair({ value, unit, tone }) {
  return (
    <span className="flex items-baseline" style={{ gap: 7 }}>
      <span className="tabular-nums" style={mono(16, { fontWeight: 600, color: tone || T.text })}>
        {value}
      </span>
      <span style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text2 }}>{unit}</span>
    </span>
  );
}

function Metric({ label, value, tone, last }) {
  return (
    <div style={{ padding: '16px 20px', borderRight: last ? 'none' : `1px solid ${T.line}` }}>
      <div className="uppercase" style={mono(9.5, { letterSpacing: '1.6px', color: T.text3 })}>
        {label}
      </div>
      <div className="tabular-nums" style={mono(19, { marginTop: 7, fontWeight: 600, color: tone || T.text })}>
        {value}
      </div>
    </div>
  );
}

function Box({ on, tone }) {
  const c = tone || T.acc;
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: 18, height: 18, borderRadius: 6, transition: 'all .18s',
        background: on ? c : 'transparent',
        border: `1.6px solid ${on ? c : T.lineHi}`,
      }}
    >
      {on && <Check size={11} strokeWidth={3.2} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />}
    </span>
  );
}

/* Рядок матеріалу. Три види в одному компоненті: різняться лише
   підписами, а рамка, галочка й мітка вибору спільні. */
function MaterialRow({ kind, item, on, onToggle, onPreview }) {
  const head = [];
  let note = '';
  let flagged = false;
  let meta = '';

  if (kind === 'trades') {
    const long = item.type === 'LONG';
    const r = rOf(item);
    head.push(
      <span key="pair" style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, letterSpacing: '.2px', color: T.text }}>
        {item.pair}
      </span>,
      <span
        key="side"
        className="inline-flex items-center uppercase"
        style={{
          height: 20, padding: '0 8px', borderRadius: 6,
          ...mono(9.5, { letterSpacing: '1.1px' }),
          background: long ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
          border: `1px solid ${long ? `rgba(${T.okRgb},0.22)` : `rgba(${T.badRgb},0.22)`}`,
          color: long ? T.ok : T.bad,
        }}
      >
        {item.type}
      </span>,
      <span key="r" className="tabular-nums" style={mono(12.5, { fontWeight: 600, color: r > 0 ? T.ok : r < 0 ? T.bad : T.text3 })}>
        {fmtR(r)}
      </span>,
    );
    note = item.note || '';
    flagged = !item.followedPlan;
    if (flagged) note = note ? `${note} · не за планом` : 'не за планом';
    meta = `${fmtDate(item.date)} · ${item.session}`;
  } else if (kind === 'plans') {
    const done = item.status === 'Відпрацьовано';
    head.push(
      <span key="pair" style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text }}>{item.pair}</span>,
      <span
        key="st"
        style={{
          fontFamily: T.sans, padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          background: done ? `rgba(${T.okRgb},0.10)` : `rgba(${T.warnRgb},0.10)`,
          color: done ? T.ok : T.warn,
        }}
      >
        {item.status}
      </span>,
    );
    note = item.text || '';
    meta = fmtDate(item.date);
  } else {
    const m = MISTAKE_TYPES[item.type] || { label: item.type };
    head.push(
      <span key="t" style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text }}>{m.label}</span>,
      <span key="p" style={{ fontFamily: T.sans, fontSize: 13, color: T.text2 }}>{item.pair}</span>,
    );
    if (item.cost != null) {
      head.push(
        <span key="c" className="tabular-nums" style={mono(12.5, { fontWeight: 600, color: T.bad })}>
          {fmtR(item.cost)}
        </span>,
      );
    }
    note = item.description || '';
    meta = fmtDate(item.date);
  }

  return (
    <div
      onClick={onToggle}
      className="group relative flex cursor-pointer items-center"
      style={{
        gap: 13, padding: '14px 20px',
        borderBottom: `1px solid ${T.line}`,
        background: on ? T.surfaceHi : 'transparent',
        transition: 'background .16s',
      }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        className="absolute"
        style={{
          left: 0, top: 9, bottom: 9, width: 2, borderRadius: 99,
          background: on ? T.acc : 'transparent', transition: 'all .18s',
        }}
      />
      <Box on={on} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
          {head}
          {/* На вузькому екрані окрема колонка справа лишає тексту
              смужку в кілька слів, тому дата йде в той самий рядок. */}
          <span className="tabular-nums sm:hidden" style={{ fontFamily: T.sans, fontSize: 12, color: T.text3 }}>
            {meta}
          </span>
        </div>
        {note && (
          <div style={{ fontFamily: T.sans, marginTop: 5, fontSize: 12.5, lineHeight: '19px', color: flagged ? T.warn : T.text3 }}>
            {note}
          </div>
        )}
      </div>

      <span className="hidden shrink-0 tabular-nums sm:block" style={{ fontFamily: T.sans, fontSize: 12, color: T.text3 }}>
        {meta}
      </span>

      {/* Перегляд окремою кнопкою, а не кліком по рядку: рядок уже
          зайнятий вибором, і одна дія не має ховати другу. Місце під
          неї зайняте завжди, тому список не сіпається під курсором. */}
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(); }}
        title="Подивитись детальніше"
        className="grid shrink-0 place-items-center opacity-0 transition-all duration-200 group-hover:opacity-100 focus:opacity-100"
        style={{ width: 28, height: 28, borderRadius: 9, color: T.text3 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = 'transparent'; }}
      >
        <Eye size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}
