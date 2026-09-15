import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import { useAuth } from '../../context/AuthContext';
import { fetchErrorForPlan } from '../../lib/errorsStore';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import NarrativeSelect from '../ui/NarrativeSelect';
import { T, EASE, SPRING } from './planTheme';

/* ==================================================================
   Пост-сесійна діагностика.
   Розкладено на три пронумеровані кроки з живими вердиктами —
   трейдер бачить результат оцінки одразу, без «Awaiting».
================================================================== */

/* Як минув день — одна відповідь із чотирьох.

   Спершу тут була оцінка від 1 до 5, потім список помилок. Обидва
   промахнулись повз питання. Оцінка — бо шкала живе тільки в голові
   того, хто ставив: сьогоднішня пʼятірка і завтрашня про різне.
   Список помилок — бо це розбір ОКРЕМОЇ УГОДИ, а він уже є в картці
   угоди; день не «пересував стоп», день минув якось.

   Ці чотири відповіді покривають усе, що справді відрізняє один
   торговий день від іншого: торгував чи ні, і чи тримався свого.
   Найважливіша з них — «Пропустив своє»: без неї день без угод
   виглядає однаково і коли сетапу не було, і коли ти його побачив
   та не зайшов. А це протилежні дні. */
const DAY_FLOW = [
  {
    id: 'plan',
    label: 'За планом',
    hint: 'Торгував і робив те, що збирався',
    color: '#34d399',
  },
  {
    id: 'drift',
    label: 'З відхиленнями',
    hint: 'Торгував, але відходив від плану',
    color: '#fbbf24',
  },
  {
    id: 'flat',
    label: 'Не торгував',
    hint: 'Свого сетапу не було — і це правильно',
    color: T.acc,
  },
  {
    id: 'missed',
    label: 'Пропустив своє',
    hint: 'Сетап був, але не зайшов',
    color: '#fb923c',
  },
];

const DAY_STATES = [
  { id: 'calm',      label: 'Спокій',      color: '#34d399' },
  { id: 'confident', label: 'Впевненість', color: T.acc },
  { id: 'anxious',   label: 'Тривога',     color: '#fbbf24' },
  { id: 'fomo',      label: 'FOMO',        color: '#fb923c' },
  { id: 'tilt',      label: 'Тільт',       color: '#f87171' },
];

function BiasBadge({ value }) {
  if (!value) return <span className="text-[15px] font-medium" style={{ color: T.text4 }}>Не вказано</span>;
  const map = {
    Bullish: [T.ok, T.okRgb],
    Bearish: [T.bad, T.badRgb],
    'Day off': [T.info, T.infoRgb],
  };
  const [c, rgb] = map[value] || [T.text2, '180,180,189'];
  return (
    <span
      className="rounded-lg px-2.5 py-1 text-[14px] font-semibold"
      style={{ background: `rgba(${rgb},0.10)`, border: `1px solid rgba(${rgb},0.24)`, color: c, fontFamily: T.sans }}
    >
      {value}
    </span>
  );
}

function Step({ n, title, hint, children, last }) {
  return (
    <div className="relative pl-10 sm:pl-12" style={{ paddingBottom: last ? 0 : 32 }}>
      {/* маркер + лінія */}
      <div className="absolute left-0 top-0 flex h-full w-7 flex-col items-center">
        <div
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold"
          style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
        >
          {n}
        </div>
        {!last && <div className="mt-2 w-px flex-1" style={{ background: T.line }} />}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h4 className="text-[14px] font-semibold leading-tight" style={{ fontFamily: T.display, color: T.text }}>
            {title}
          </h4>
          <p className="mt-1 text-[14px] font-medium" style={{ color: T.text3 }}>{hint}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PostSessionDiagnostics({ planData, updatePlanData, planId }) {
  const { user } = useAuth();

  /* ---------- детальний розбір ----------

     Поле нижче — це два рядки, написані одразу після сесії, і воно
     має такими й лишитись: діагностика на те й діагностика, щоб
     закритись за хвилину. Але сам запис уже їде в Журнал помилок, а
     там без категорій він губиться серед решти.

     Тому категорії питаємо окремо і не тут: кнопка відкриває той
     самий композер, що й на сторінці помилок. Не хочеш — не
     відкриваєш, помилка все одно долетить, просто з категорією за
     замовчуванням. */
  const [composerOpen, setComposerOpen] = useState(false);
  const [errDraft, setErrDraft] = useState(null);
  const [errForm, setErrForm] = useState({
    pair: '', desc: '', tvLink: '', reasons: [], cats: [],
  });

  /* Що вже лежить у журналі по цьому дню — щоб не питати вдруге те,
     що людина вже вибрала, і щоб наступне збереження плану не
     затерло її вибір категоріями за замовчуванням. */
  useEffect(() => {
    setErrDraft(null);
    setComposerOpen(false);
    if (!planId) return;
    fetchErrorForPlan(user?.id, planId)
      .then((e) => { if (e) setErrDraft({ cats: e.cats, tvLink: e.tvLink || '', reasons: e.reasons || [], pair: e.pair }); })
      .catch(() => {});
  }, [planId, user?.id]);

  /* Драфт піднімаємо в план: саме звідти його забирає збереження,
     інакше вибрані категорії жили б до першого перемальовування.

     Тільки коли він справді змінився. Без перевірки перше ж
     монтування писало б у план `errorDraft: null`, план вважав би
     себе зміненим і йшов на автозбереження — тобто просте відкриття
     сторінки лишало б слід у базі. */
  useEffect(() => {
    const now = JSON.stringify(errDraft ?? null);
    const was = JSON.stringify(planData.errorDraft ?? null);
    if (now === was) return;
    updatePlanData({ errorDraft: errDraft });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [errDraft]);

  const matched    = planData.narrative && planData.actualNarrative && planData.narrative === planData.actualNarrative;
  const mismatched = planData.narrative && planData.actualNarrative && planData.narrative !== planData.actualNarrative;

  const filled = useMemo(() => {
    let n = 0;
    if (planData.actualNarrative) n++;
    if (planData.dayFlow) n++;
    if (planData.dayState) n++;
    return n;
  }, [planData.actualNarrative, planData.dayFlow, planData.dayState]);

  return (
    <div className="px-5 py-6 sm:px-6">
      {/* лічильник */}
      <div className="mb-7 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: T.line }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: filled === 3 ? T.ok : T.acc }}
            initial={false}
            animate={{ width: `${(filled / 3) * 100}%` }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        </div>
        <span
          className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums"
          style={{ fontFamily: T.sans, color: filled === 3 ? T.ok : T.text3 }}
        >
          {filled}/3
        </span>
      </div>

      {/* 01 — Bias */}
      <Step n="01" title="Напрямок ринку" hint="Ринок підтвердив твоє читання?">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Планував
            </span>
            <div
              className="flex h-[42px] items-center rounded-xl px-3.5"
              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            >
              <BiasBadge value={planData.narrative} />
            </div>
          </div>

          <div className="hidden h-[42px] shrink-0 items-center px-1 sm:flex">
            <span style={{ color: T.text4, fontSize: 16 }}>→</span>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Фактично
            </span>
            <NarrativeSelect
              value={planData.actualNarrative}
              onChange={(v) => updatePlanData({ actualNarrative: v })}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {(matched || mismatched) && (
            <motion.div
              key={matched ? 'ok' : 'miss'}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
              className="flex items-center gap-2.5 rounded-lg px-3.5 py-2.5"
              style={{
                background: matched ? `rgba(${T.okRgb},0.06)` : `rgba(${T.badRgb},0.06)`,
                border: `1px solid ${matched ? `rgba(${T.okRgb},0.18)` : `rgba(${T.badRgb},0.18)`}`,
              }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: matched ? T.ok : T.bad, boxShadow: `0 0 8px ${matched ? T.ok : T.bad}` }}
              />
              <span className="text-[14px] font-semibold" style={{ color: matched ? T.ok : T.bad, fontFamily: T.sans }}>
                {matched ? 'Читання підтвердилось' : 'Читання не спрацювало'}
              </span>
              <span className="ml-auto hidden text-[13px] font-medium sm:block" style={{ color: T.text4 }}>
                {matched ? 'Bias збігся з ринком' : 'Ринок пішов проти очікування'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </Step>

      {/* 02 — як минув день */}
      <Step n="02" title="Як минув торговий день" hint="Одна відповідь — та, що ближча до правди">
        <div className="grid gap-2 sm:grid-cols-2">
          {DAY_FLOW.map((f) => {
            const on = planData.dayFlow === f.id;
            return (
              <motion.button
                key={f.id}
                whileTap={{ scale: 0.985 }}
                transition={SPRING}
                onClick={() => updatePlanData({ dayFlow: on ? null : f.id })}
                className="flex flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition-all duration-200"
                style={{
                  fontFamily: T.sans,
                  background: on ? `${f.color}14` : T.sunken,
                  border: `1px solid ${on ? `${f.color}66` : T.line}`,
                  boxShadow: on ? `0 0 20px -10px ${f.color}` : 'none',
                }}
                onMouseEnter={(e) => !on && (e.currentTarget.style.borderColor = T.lineHi)}
                onMouseLeave={(e) => !on && (e.currentTarget.style.borderColor = T.line)}
              >
                <span className="text-[14.5px] font-semibold" style={{ color: on ? f.color : T.text2 }}>
                  {f.label}
                </span>
                <span className="text-[12.5px]" style={{ color: T.text4 }}>
                  {f.hint}
                </span>
              </motion.button>
            );
          })}
        </div>
      </Step>

      {/* 03 — стан */}
      <Step n="03" title="Що керувало тобою сьогодні" hint="Один стан — той, що визначав рішення" last>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {DAY_STATES.map((st) => {
              const on = planData.dayState === st.id;
              return (
                <motion.button
                  key={st.id}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING}
                  onClick={() => updatePlanData({ dayState: on ? null : st.id })}
                  className="rounded-xl px-4 py-2 text-[13.5px] font-semibold transition-all duration-200"
                  style={{
                    fontFamily: T.sans,
                    background: on ? `${st.color}1a` : T.sunken,
                    border: `1px solid ${on ? `${st.color}66` : T.line}`,
                    color: on ? st.color : T.text3,
                    boxShadow: on ? `0 0 18px -8px ${st.color}` : 'none',
                  }}
                  onMouseEnter={(e) => !on && (e.currentTarget.style.borderColor = T.lineHi)}
                  onMouseLeave={(e) => !on && (e.currentTarget.style.borderColor = T.line)}
                >
                  {st.label}
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence initial={false}>
            {(planData.dayFlow === 'drift' || planData.dayFlow === 'missed') && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="overflow-hidden"
              >
                <div
                  className="relative overflow-hidden rounded-xl"
                  style={{ background: `rgba(${T.badRgb},0.04)`, border: `1px solid rgba(${T.badRgb},0.16)` }}
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
                    style={{ background: T.bad, opacity: 0.5 }}
                  />
                  <TextareaAutosize
                    value={planData.analysisMistakeText}
                    onChange={(e) => updatePlanData({ analysisMistakeText: e.target.value })}
                    placeholder="Яку структуру пропустив? Де зрізав кут з підтвердженням?"
                    minRows={3}
                    spellCheck={false}
                    className="w-full resize-none border-none bg-transparent px-4 py-3.5 outline-none"
                    style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.7, color: T.text }}
                  />

                  {/* Підвал: куди це поїде і чим його можна доповнити.
                      Рядок про журнал важливіший за кнопку — він
                      відповідає на питання «а що з цим буде далі»,
                      яке інакше лишається без відповіді. */}
                  <div
                    className="flex flex-wrap items-center gap-2 px-4 py-2.5"
                    style={{ borderTop: `1px solid rgba(${T.badRgb},0.12)` }}
                  >
                    {errDraft?.cats?.length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {errDraft.cats.map((id) => {
                          const c = CATS.find((x) => x.id === id);
                          if (!c) return null;
                          return (
                            <span
                              key={id}
                              className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
                              style={{
                                fontFamily: T.sans,
                                color: c.color,
                                background: `${c.color}1a`,
                                border: `1px solid ${c.color}38`,
                              }}
                            >
                              {c.label}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span className="text-[12.5px] font-medium" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Полетить у Журнал помилок
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setErrForm({
                          pair: errDraft?.pair || planData.pair || '',
                          desc: planData.analysisMistakeText || '',
                          reasons: errDraft?.reasons || [],
                          tvLink: errDraft?.tvLink || '',
                          cats: errDraft?.cats?.length ? errDraft.cats : [],
                        });
                        setComposerOpen(true);
                      }}
                      className="ml-auto flex h-8 items-center rounded-lg px-3 text-[12.5px] font-bold transition-colors"
                      style={{
                        fontFamily: T.sans,
                        background: 'transparent',
                        border: `1px solid rgba(${T.badRgb},0.3)`,
                        color: T.bad,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.badRgb},0.1)`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {errDraft ? 'Змінити розбір' : 'Розібрати детально'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Step>

      {/* Той самий композер, що й на сторінці помилок і в угоді.
          Опис — один на всіх: що написано тут, те стоїть і в журналі,
          інакше незрозуміло, якій версії вірити. */}
      <ErrorComposerModal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        form={errForm}
        setForm={setErrForm}
        recentPairs={[planData.pair].filter(Boolean)}
        onSave={() => {
          setErrDraft({
            cats: errForm.cats.length ? errForm.cats : ['risk'],
            tvLink: errForm.tvLink.trim(),
            reasons: errForm.reasons || [],
            pair: errForm.pair.trim().toUpperCase(),
          });
          if (errForm.desc.trim() !== (planData.analysisMistakeText || '').trim()) {
            updatePlanData({ analysisMistakeText: errForm.desc });
          }
          setComposerOpen(false);
        }}
      />
    </div>
  );
}
