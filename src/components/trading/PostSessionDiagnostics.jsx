import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import { useAuth } from '../../context/AuthContext';
import { fetchErrorForPlan } from '../../lib/errorsStore';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import NarrativeSelect from '../ui/NarrativeSelect';
import {
  FLOW, STATES, HARD, REASON_TITLE, ASKS_WHY,
  asList, toggleWith, reasonsFor, pruneReasons, stateWithReason,
  reviewFilled, REVIEW_STEPS,
} from '../../lib/dayReview';
import { T, EASE, SPRING } from './planTheme';

/* ==================================================================
   Розбір дня.

   Пʼять кроків на вертикальній лінії. Лінія тут не прикраса: вечірній
   розбір — це послідовність, і кожен наступний крок має сенс лише
   після попереднього. Вузол горить, коли на крок відповіли, тож
   скільки лишилось, видно без лічильника.

   Відповідей на крок може бути кілька. Один день рідко буває
   однорідним, і змушувати вибрати одне означає отримати неправду.
   Несумісні відповіді не забороняються, а витісняють одна одну —
   правила лежать у `lib/dayReview.js`.
================================================================== */

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

function Step({ n, title, hint, done, children, last }) {
  return (
    <div className="relative pl-11 sm:pl-14" style={{ paddingBottom: last ? 0 : 30 }}>
      <div className="absolute left-0 top-0 flex h-full w-8 flex-col items-center">
        {/* Вузол, а не плашка з цифрою. Заповнений крок гасить номер і
            показує галочку — так скільки лишилось, видно з самої лінії,
            без погляду на лічильник угорі. */}
        <motion.div
          className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold"
          initial={false}
          animate={{
            backgroundColor: done ? `rgba(${T.okRgb},0.14)` : T.sunken,
            borderColor: done ? `rgba(${T.okRgb},0.45)` : T.line,
            color: done ? T.ok : T.text3,
          }}
          transition={{ duration: 0.32, ease: EASE }}
          style={{ borderWidth: 1, borderStyle: 'solid', fontFamily: T.sans }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={done ? 'v' : 'n'}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.16, ease: EASE }}
              className="flex"
            >
              {done ? <Check size={14} strokeWidth={3.2} /> : n}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        {!last && (
          <div className="relative mt-1.5 w-px flex-1" style={{ background: T.line }}>
            <motion.div
              className="absolute inset-x-0 top-0 origin-top"
              initial={false}
              animate={{ scaleY: done ? 1 : 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{ height: '100%', background: `rgba(${T.okRgb},0.5)` }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3.5">
        <div>
          <h4 className="text-[15px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
            {title}
          </h4>
          <p className="mt-1 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{hint}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/* Картка відповіді. Кружечок зліва — єдине, що каже «можна вибрати
   кілька»: у списку з галочками це очевидно, у списку з підсвіткою —
   ні, і людина не пробує натиснути друге. */
function Card({ def, on, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      transition={SPRING}
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
      style={{
        fontFamily: T.sans,
        background: on ? `rgba(${def.rgb},0.09)` : T.sunken,
        border: `1px solid ${on ? `rgba(${def.rgb},0.4)` : T.line}`,
      }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = T.line; }}
    >
      <motion.span
        className="mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full"
        initial={false}
        animate={{
          backgroundColor: on ? `rgb(${def.rgb})` : 'rgba(0,0,0,0)',
          borderColor: on ? `rgb(${def.rgb})` : T.lineHi,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        style={{ borderWidth: 1.5, borderStyle: 'solid' }}
      >
        <AnimatePresence>
          {on && (
            <motion.span
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              className="flex"
            >
              <Check size={11} strokeWidth={3.6} style={{ color: '#0A0A0C' }} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>

      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold" style={{ color: on ? `rgb(${def.rgb})` : T.text2 }}>
          {def.label}
        </span>
        {def.hint && (
          <span className="mt-0.5 block text-[12.5px]" style={{ color: T.text4 }}>{def.hint}</span>
        )}
      </span>
    </motion.button>
  );
}

function Chip({ def, on, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={SPRING}
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-semibold transition-colors duration-200"
      style={{
        fontFamily: T.sans,
        background: on ? `rgba(${def.rgb || T.accRgb},0.14)` : T.sunken,
        border: `1px solid ${on ? `rgba(${def.rgb || T.accRgb},0.42)` : T.line}`,
        color: on ? `rgb(${def.rgb || T.accRgb})` : T.text3,
      }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = T.line; }}
    >
      <motion.span
        className="h-[7px] w-[7px] rounded-full"
        initial={false}
        animate={{
          backgroundColor: on ? `rgb(${def.rgb || T.accRgb})` : T.line,
          scale: on ? 1 : 0.7,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      />
      {def.label}
    </motion.button>
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

  const filled = useMemo(() => reviewFilled(planData), [planData]);

  const flow  = asList(planData.dayFlow);
  const state = asList(planData.dayState);
  const hard  = asList(planData.dayHard);
  const why   = asList(planData.dayWhy);

  /* Зміна гілки тягне за собою причини: інакше знята відповідь
     лишає по собі «набридло чекати», що висить саме по собі, ніби
     день усе ще про неї. */
  const pickFlow = (id) => {
    const next = toggleWith(flow, id, FLOW);
    updatePlanData({ dayFlow: next, dayWhy: pruneReasons(why, next) });
  };

  /* Причина сама проставляє стан. Це і є сенс кроку: людина
     відповідає на конкретне питання про конкретну дію, а «що мною
     керувало» виводиться з відповіді, а не згадується окремо.

     Знімаємо причину — стан лишається. Він міг бути поставлений
     руками, і прибирати чужу відмітку побічним ефектом чужого кліку
     форма права не має. */
  const pickReason = (id) => {
    const on = why.includes(id);
    updatePlanData({
      dayWhy: on ? why.filter((x) => x !== id) : [...why, id],
      ...(on ? {} : { dayState: stateWithReason(state, id) }),
    });
  };

  /* Питаємо «чому» лише там, де є що пояснювати. `flat` мовчить:
     сетапу не було, пояснювати нічого. */
  const whyGroups = flow.filter((id) => ASKS_WHY.includes(id));

  return (
    <div className="px-5 py-6 sm:px-6">
      {/* лічильник */}
      <div className="mb-7 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: T.line }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: filled === REVIEW_STEPS ? T.ok : T.acc }}
            initial={false}
            animate={{ width: `${(filled / REVIEW_STEPS) * 100}%` }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        </div>
        <span
          className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums"
          style={{ fontFamily: T.sans, color: filled === REVIEW_STEPS ? T.ok : T.text3 }}
        >
          {filled}/{REVIEW_STEPS}
        </span>
      </div>

      {/* 01 — Bias */}
      <Step n="01" title="Напрямок ринку" hint="Ринок підтвердив твоє читання?" done={!!planData.actualNarrative}>
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
      <Step
        n="02"
        title="Як минув торговий день"
        hint="Можна кілька — день рідко буває однорідним"
        done={flow.length > 0}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {FLOW.map((f) => (
            <Card key={f.id} def={f} on={flow.includes(f.id)} onClick={() => pickFlow(f.id)} />
          ))}
        </div>

        {/* Чому саме так.

            Сам факт «відійшов від плану» нічого не пояснює — важить
            причина. Питання стоїть тут, під своєю відповіддю, а не
            окремим кроком у кінці: «чому не зайшов» має сенс рівно
            тоді, коли перед очима ще стоїть «був сетап, не торгував». */}
        <AnimatePresence initial={false}>
          {whyGroups.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 pt-1">
                {whyGroups.map((fid) => {
                  const def = FLOW.find((f) => f.id === fid);
                  return (
                    <div key={fid} className="flex flex-col gap-2">
                      <span
                        className="text-[11.5px] font-bold uppercase tracking-[0.14em]"
                        style={{ fontFamily: T.sans, color: `rgba(${def.rgb},0.85)` }}
                      >
                        {REASON_TITLE[fid]}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {reasonsFor(fid).map((r) => (
                          <Chip
                            key={r.id}
                            def={{ ...r, rgb: def.rgb }}
                            on={why.includes(r.id)}
                            onClick={() => pickReason(r.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Чесно попереджаємо, що клік має наслідок. Мовчазна
                    зміна чужого кроку — найшвидший спосіб змусити
                    людину не довіряти формі. */}
                <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Обрана причина сама проставить стан у кроці 03 — його можна змінити руками
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Текстовий розбір лишається тільки там, де щось пішло не
            так: у дні за планом це поле питало б про помилку, якої
            не було. */}
        <AnimatePresence initial={false}>
          {(flow.includes('drift') || flow.includes('missed')) && (
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
                  className="absolute bottom-3 left-0 top-3 w-[2px] rounded-full"
                  style={{ background: T.bad, opacity: 0.5 }}
                />
                <TextareaAutosize
                  value={planData.analysisMistakeText}
                  onChange={(e) => updatePlanData({ analysisMistakeText: e.target.value })}
                  placeholder="Що саме сталося? Яку структуру пропустив, де зрізав кут?"
                  minRows={3}
                  spellCheck={false}
                  className="w-full resize-none border-none bg-transparent px-4 py-3.5 outline-none"
                  style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.7, color: T.text }}
                />

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
      </Step>

      {/* 03 — стан */}
      <Step
        n="03"
        title="Що керувало тобою сьогодні"
        hint="Частину проставлять відповіді вище — лишається перевірити й доповнити"
        done={state.length > 0}
      >
        <div className="flex flex-wrap gap-2">
          {STATES.map((st) => (
            <Chip
              key={st.id}
              def={st}
              on={state.includes(st.id)}
              onClick={() => updatePlanData({ dayState: toggleWith(state, st.id, STATES) })}
            />
          ))}
        </div>
      </Step>

      {/* 04 — навичка */}
      <Step
        n="04"
        title="Що далося найважче"
        hint="Питання про дію, а не про почуття — з нього видно, якої навички бракує"
        done={hard.length > 0}
        last
      >
        <div className="flex flex-wrap gap-2">
          {HARD.map((h) => (
            <Chip
              key={h.id}
              def={h}
              on={hard.includes(h.id)}
              onClick={() => updatePlanData({ dayHard: toggleWith(hard, h.id, HARD) })}
            />
          ))}
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
