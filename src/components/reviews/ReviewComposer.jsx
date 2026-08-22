import TextareaAutosize from 'react-textarea-autosize';
import { Check, Sparkles, Save, History, Loader2 } from 'lucide-react';
import { T } from '../../lib/theme';
import { PROMPTS, EMOTIONS, SCORE_LABELS, fmtRange } from '../../lib/reviewsData';

/* ==================================================================
   Панель висновку.
   Липка колонка праворуч: оцінка дисципліни, стан, три конкретні
   питання й одна зміна на наступний період. Плюс нагадування, що
   ти обіцяв собі минулого разу — інакше розбір перетворюється на
   щоденник без наслідків.
================================================================== */

/* Кроки пронумеровані: розбір читається як послідовність, а не як
   стопка полів. Заповнений крок підсвічує свій номер. */
function Block({ step, title, hint, children, right, done }) {
  return (
    <div className="px-5 py-5" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {step && (
            <span
              className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] font-bold tabular-nums transition-colors duration-300"
              style={{
                fontFamily: T.mono,
                background: done ? `rgba(${T.accRgb},0.14)` : T.sunken,
                border: `1px solid ${done ? T.lineAcc : T.line}`,
                color: done ? T.acc : T.text4,
              }}
            >
              {step}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text2 }}>
              {title}
            </div>
            {hint && <div className="mt-1 text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>{hint}</div>}
          </div>
        </div>
        {right}
      </div>
      <div className={step ? 'pl-9' : ''}>{children}</div>
    </div>
  );
}

export default function ReviewComposer({
  from, to, score, onScore, emotions, onEmotion,
  answers, onAnswer, lesson, onLesson,
  prevReview, keptPromises, onKeptPromise,
  picked, saving, onSave,
}) {
  const scoreColor = score >= 4 ? T.ok : score === 3 ? T.warn : score ? T.bad : T.text4;
  const ready = score > 0 && lesson.trim();

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      {/* шапка */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}>
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid ${T.accLine}` }}
        >
          <Sparkles size={15} strokeWidth={2.2} style={{ color: T.acc }} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Висновок</div>
          <div className="truncate text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
            {fmtRange(from, to)} · обрано {picked}
          </div>
        </div>
      </div>

      {/* минулий розбір */}
      {prevReview && (
        <Block
          title="Минулого разу ти обіцяв"
          hint={fmtRange(prevReview.from, prevReview.to)}
          right={<History size={15} strokeWidth={2.2} style={{ color: T.text4 }} />}
        >
          <p
            className="mb-3 rounded-xl px-3.5 py-3 text-[14px] leading-relaxed"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, fontFamily: T.sans, color: T.text2 }}
          >
            {prevReview.lesson}
          </p>

          <div className="flex flex-col gap-2">
            {(prevReview.promises || []).map((p, i) => {
              const kept = keptPromises[i];
              return (
                <button
                  key={p.text}
                  onClick={() => onKeptPromise(i, kept === true ? null : true)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-200"
                  style={{
                    background: kept === true ? `rgba(${T.okRgb},0.07)` : T.sunken,
                    border: `1px solid ${kept === true ? `rgba(${T.okRgb},0.25)` : T.line}`,
                  }}
                  onMouseEnter={(e) => { if (kept !== true) e.currentTarget.style.borderColor = T.lineHi; }}
                  onMouseLeave={(e) => { if (kept !== true) e.currentTarget.style.borderColor = T.line; }}
                >
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors duration-200"
                    style={{
                      background: kept === true ? T.ok : 'transparent',
                      border: `1.5px solid ${kept === true ? T.ok : T.lineHi}`,
                    }}
                  >
                    {kept === true && <Check size={12} strokeWidth={3.4} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />}
                  </span>
                  <span className="text-[13.5px] font-medium" style={{ fontFamily: T.sans, color: kept === true ? T.text : T.text2 }}>
                    {p.text}
                  </span>
                </button>
              );
            })}
          </div>
        </Block>
      )}

      {/* дисципліна */}
      <Block
        step="1"
        done={score > 0}
        title="Дисципліна періоду"
        right={
          <span className="shrink-0 text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: scoreColor }}>
            {SCORE_LABELS[score] || 'не оцінено'}
          </span>
        }
      >
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = score >= n;
            const c = n >= 4 ? T.ok : n === 3 ? T.warn : T.bad;
            return (
              <button
                key={n}
                onClick={() => onScore(score === n ? 0 : n)}
                className="h-9 flex-1 rounded-lg transition-all duration-200"
                style={{
                  background: on ? `${c}26` : T.sunken,
                  border: `1px solid ${on ? `${c}55` : T.line}`,
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = T.line; }}
                title={SCORE_LABELS[n]}
              >
                <span className="text-[13.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: on ? c : T.text4 }}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </Block>

      {/* стан */}
      <Block step="2" done={emotions.length > 0} title="Стан за період" hint="що переважало">
        <div className="flex flex-wrap gap-2">
          {EMOTIONS.map((e) => {
            const on = emotions.includes(e.id);
            const c = e.good ? T.ok : T.warn;
            return (
              <button
                key={e.id}
                onClick={() => onEmotion(e.id)}
                className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-200"
                style={{
                  fontFamily: T.sans,
                  color: on ? c : T.text3,
                  background: on ? `${c}14` : T.sunken,
                  border: `1px solid ${on ? `${c}38` : T.line}`,
                }}
                onMouseEnter={(ev) => { if (!on) { ev.currentTarget.style.color = T.text; ev.currentTarget.style.borderColor = T.lineHi; } }}
                onMouseLeave={(ev) => { if (!on) { ev.currentTarget.style.color = T.text3; ev.currentTarget.style.borderColor = T.line; } }}
              >
                {e.label}
              </button>
            );
          })}
        </div>
      </Block>

      {/* три питання */}
      {PROMPTS.map((p, i) => (
        <Block key={p.id} step={String(3 + i)} done={!!(answers[p.id] || '').trim()} title={p.label} hint={p.question}>
          <div
            className="rounded-xl transition-colors duration-200"
            style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
          >
            <TextareaAutosize
              value={answers[p.id] || ''}
              onChange={(e) => onAnswer(p.id, e.target.value)}
              placeholder={p.placeholder}
              minRows={2}
              className="w-full resize-none border-none bg-transparent px-3.5 py-3 outline-none"
              style={{ fontFamily: T.sans, fontSize: 14.5, lineHeight: 1.7, color: T.text }}
            />
          </div>
        </Block>
      ))}

      {/* головна зміна */}
      <Block step="6" done={!!lesson.trim()} title="Одна зміна на наступний період" hint="те, що ти реально зробиш">
        <div
          className="rounded-xl transition-colors duration-200"
          style={{ background: T.sunken, border: `1px solid ${lesson.trim() ? T.lineAcc : T.line}` }}
        >
          <TextareaAutosize
            value={lesson}
            onChange={(e) => onLesson(e.target.value)}
            placeholder="Наприклад: жодної угоди поза London — азія закрита."
            minRows={2}
            className="w-full resize-none border-none bg-transparent px-3.5 py-3 outline-none"
            style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.text, fontWeight: 500 }}
          />
        </div>
      </Block>

      {/* збереження */}
      <div className="px-5 py-4">
        <button
          onClick={onSave}
          disabled={!ready || saving}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
          style={{
            background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
            opacity: ready && !saving ? 1 : 0.4,
            cursor: ready ? 'pointer' : 'not-allowed',
            boxShadow: ready ? `0 6px 18px -8px rgba(${T.accRgb},0.6)` : 'none',
          }}
          onMouseEnter={(e) => { if (ready) e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`; }}
          onMouseLeave={(e) => { if (ready) e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`; }}
        >
          {saving ? <Loader2 size={16} strokeWidth={3} className="animate-spin" /> : <Save size={16} strokeWidth={2.6} />}
          Зберегти розбір
        </button>
        {!ready && (
          <p className="mt-2.5 text-center text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Постав оцінку дисципліни й напиши одну зміну — решта не обовʼязкова.
          </p>
        )}
      </div>
    </div>
  );
}
