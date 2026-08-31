import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import {
  ArrowLeft, CalendarDays, ChevronDown, Check, TrendingUp, Save,
  Loader2, History, AlertTriangle, Plus, ChevronLeft, ChevronRight,
  ImagePlus, X,
} from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import DateField from '../ui/DateField';
import MaterialPreview from './MaterialPreview';
import ImageSlider from '../ui/ImageSlider';
import { uploadImage, isHttpUrl } from '../../lib/imageStore';
import { notify } from '../../utils/notify';
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

/* Підкладка обраного рядка. Через білі напівпрозорі шари, а не готовими
   кольорами: так вона однаково лягає і на темну, і на світлу тему. */
const SELECTED_BG = 'linear-gradient(90deg, rgba(255,255,255,0.055), rgba(255,255,255,0.03) 70%, rgba(255,255,255,0.016))';

const cut = (s, n = 74) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);

/* «1 правило», «3 правила», «5 правил». Без цього виходило «3 правил»,
   що виглядає як недописаний рядок, а не як число. Окремий випадок для
   11–14: там завжди форма множини, попри останню цифру. */
const plural = (n, one, few, many) => {
  const t = n % 100;
  if (t >= 11 && t <= 14) return many;
  const d = n % 10;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
};


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
  shots: initialShots, onShots, userId,
  promises, onPromises,
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
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  /* Скріни живуть тут, а не в answers: answers — це рівно ті три
     питання, які летять у базу текстом, і домішувати до них масиви
     картинок означало б ламати форму відповіді. */
  const [shots, setShots] = useState(initialShots || {});

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
    /* Скріни просимо лише там, де вони справді щось доводять: «що
       спрацювало» і «що зламалось». До закономірності й до зміни на
       наступний період картинка нічого не додає. */
    ...PROMPTS.map((p) => ({
      key: p.id, title: p.label, hint: p.question, placeholder: p.placeholder,
      attach: p.id === 'worked' || p.id === 'broke',
    })),
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

  /* Оцінка дисципліни більше не крок висновку.

     Вона не відповідь на питання, а факт про період — такий самий, як
     кількість угод; писати висновок починають уже знаючи її. Тому вона
     стоїть окремою панеллю над «Висновком», завжди розкрита, і в
     лічильник кроків не входить. */
  const filled = [
    emotions.length > 0,
    ...textSteps.map((t) => !!valueOf(t.key).trim()),
    promises.length > 0,
  ];
  const filledCount = filled.filter(Boolean).length;

  const ready = score > 0 && lesson.trim();
  const scoreTone = score >= 4 ? T.ok : score === 3 ? T.warn : T.bad;

  const steps = [
    {
      kicker: 'Стан',
      title: 'Стан за період',
      hint: 'Що переважало — обери все, що було. Це допоможе побачити, з якою головою ти торгував.',
      preview: emotions.length
        ? emotions.map((id) => EMOTIONS.find((e) => e.id === id)?.label).filter(Boolean).join(' · ')
        : '',
      kind: 'chips',
    },
    ...textSteps.map((t) => ({
      ...t,
      kicker: t.accent ? 'Головне' : 'Розбір',
      kind: 'text',
      preview: valueOf(t.key).trim() ? cut(valueOf(t.key).trim()) : '',
    })),
    {
      kicker: 'Обіцянка',
      title: 'Чого дотримуватись',
      hint: 'Конкретні правила на наступний період. Наступного разу цей список зустріне тебе згори — і ти позначиш, що виконав.',
      kind: 'list',
      accent: true,
      /* Тільки кількість. Показувати перше правило поруч було зайвим:
         у списку відповідей це рядок про стан справ, а не місце, де
         їх перечитують. */
      preview: promises.length
        ? `${promises.length} ${plural(promises.length, 'правило', 'правила', 'правил')}`
        : '',
    },
  ];

  const stepsTotal = steps.length;
  const idx = Math.min(step, stepsTotal - 1);
  const current = steps[idx];
  const answered = steps
    .map((st, i) => ({ ...st, i }))
    .filter((st) => filled[st.i] && st.i !== idx);

  const MAX_SHOTS = 5;

  const putShots = (key, next) => {
    const merged = { ...shots, [key]: next.slice(0, MAX_SHOTS) };
    setShots(merged);
    onShots?.(merged);
  };

  /* Два джерела картинок навмисно.

     Посилання з TradingView — головний шлях: так само працює сторінка
     планів, і людина вже звикла робити Alt+S і Ctrl+V. Файл лишаємо
     як запасний варіант для скрінів не з графіка; він їде в сховище
     стисненим, бо base64 у тілі розбору роздуває запис у рази. */
  const addShotUrl = (key, url) => {
    const cur = shots[key] || [];
    if (cur.length >= MAX_SHOTS) { notify.error('Достатньо', `Більше ${MAX_SHOTS} скрінів на крок не тримаємо.`); return; }
    if (cur.some((x) => x.src === url)) return;
    putShots(key, [...cur, { src: url, name: 'TradingView' }]);
  };

  const addShotFiles = async (key, fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    if (!userId) { notify.error('Не вийшло', 'Немає користувача для завантаження.'); return; }

    const cur = shots[key] || [];
    const room = MAX_SHOTS - cur.length;
    if (room <= 0) { notify.error('Достатньо', `Більше ${MAX_SHOTS} скрінів на крок не тримаємо.`); return; }

    try {
      const uploaded = await Promise.all(
        files.slice(0, room).map(async (f) => ({ src: await uploadImage(userId, 'reviews', f), name: f.name })),
      );
      putShots(key, [...cur, ...uploaded]);
    } catch (e) {
      /* «Bucket not found» сам по собі нічого не пояснює людині: це не
         зламаний файл і не мережа, а невиконана міграція сховища
         (src/db/2026-08-07_note_images_storage.sql). Посилання з
         TradingView при цьому працюють — вони нікуди не вантажаться. */
      const raw = String(e?.message || '');
      if (/bucket not found/i.test(raw)) {
        notify.error(
          'Сховище не налаштоване',
          'Виконай src/db/2026-08-07_note_images_storage.sql у Supabase. Поки що вставляй посилання з TradingView — воно працює без сховища.',
        );
      } else {
        notify.error('Не вдалось завантажити', raw || 'Спробуй ще раз.');
      }
    }
  };

  const removeShot = (key, i) => {
    const cur = [...(shots[key] || [])];
    cur.splice(i, 1);
    putShots(key, cur);
  };

  /* Напрямок руху памʼятаємо окремо: анімація має їхати туди, куди
     людина натиснула, а з самого лише номера кроку цього не видно. */
  const go = (n) => {
    const next = Math.max(0, Math.min(stepsTotal - 1, n));
    setDir(next >= idx ? 1 : -1);
    setStep(next);
  };

  return (
    <div className="w-full">

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
          <div className="uppercase" style={mono(11, { letterSpacing: '2.2px', color: T.acc })}>
            Розбори
          </div>
          <div
            style={{
              fontFamily: T.display, marginTop: 7, fontSize: 30,
              fontWeight: 600, letterSpacing: '-0.7px', color: T.text,
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
                  fontFamily: T.sans, height: 38, padding: '0 18px', borderRadius: 10,
                  fontSize: 14.5, transition: 'all .18s',
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
            <span className="truncate" style={mono(15, { color: T.text })}>
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
            <span className="shrink-0" style={{ fontFamily: T.sans, fontSize: 14, color: T.text2 }}>
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
              <div style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 600, color: T.text }}>
                Що розбираємо
              </div>
              <div style={{ fontFamily: T.sans, marginTop: 4, fontSize: 14, color: T.text2 }}>
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
                      fontFamily: T.sans, gap: 8, height: 38, padding: '0 16px', borderRadius: 10,
                      fontSize: 14.5, fontWeight: 500, transition: 'all .18s',
                      background: on ? T.surfaceHi : 'transparent',
                      color: on ? T.text : T.text3,
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                  >
                    {t.label}
                    <span style={mono(12.5, { fontWeight: 600, color: on ? T.acc : T.text3 })}>{counts[t.key]}</span>
                  </button>
                );
              })}
            </div>

            {/* Подвійний клік сам себе не показує — і без цього рядка
                про нього просто ніхто б не дізнався. */}
            <span className="ml-auto mr-4 hidden lg:block" style={{ fontFamily: T.sans, fontSize: 13, color: T.text3 }}>
              Клік — переглянути, подвійний — взяти в розбір
            </span>

            <button
              onClick={toggleAll}
              disabled={!list.length}
              style={{
                fontFamily: T.sans, fontSize: 14, color: T.text2,
                opacity: list.length ? 1 : 0.4, transition: 'color .18s',
              }}
              onMouseEnter={(e) => { if (list.length) e.currentTarget.style.color = T.acc; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; }}
            >
              {allPicked ? 'Зняти все' : 'Вибрати все'}
            </button>
          </div>

          <div className="custom-scrollbar" style={{ maxHeight: 460, overflowY: 'auto' }}>
            {list.length === 0 ? (
              <p style={{ fontFamily: T.sans, padding: '48px 20px', textAlign: 'center', fontSize: 15, color: T.text3 }}>
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
                  <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 600, color: T.warn }}>
                    {meta.label} повторюється
                  </div>
                  <div style={{ fontFamily: T.sans, marginTop: 4, fontSize: 14, color: T.text2 }}>
                    {r.now} у цьому періоді · {r.before} раніше
                  </div>
                </div>
                {r.cost ? (
                  <span className="shrink-0" style={mono(14, { color: T.warn })}>{fmtR(r.cost)}</span>
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
                <div style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 600, color: T.text }}>
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
                <p style={{ fontFamily: T.sans, fontSize: 16, lineHeight: '27px', color: T.text }}>
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
                        style={{ fontFamily: T.sans, fontSize: 15.5, lineHeight: '23px', color: on ? T.text2 : T.text }}
                      >
                        {p.text}
                      </span>
                      <span
                        className="shrink-0"
                        style={mono(12, { fontWeight: 600, letterSpacing: '.4px', color: on ? T.ok : T.text2 })}
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

      {/* ─────────── дисципліна періоду ─────────── */}
      <div style={{ ...panel, marginTop: 12, padding: '20px 24px' }}>
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 20 }}>
          <div className="min-w-0">
            <div style={{ fontFamily: T.sans, fontSize: 16, fontWeight: 600, color: T.text }}>
              Дисципліна періоду
            </div>
            <div style={{ fontFamily: T.sans, marginTop: 4, fontSize: 13.5, color: T.text2 }}>
              Наскільки ти тримався плану весь період?
            </div>
          </div>

          <div className="flex items-center" style={{ gap: 14 }}>
            <span
              style={{
                fontFamily: T.sans, fontSize: 14, fontWeight: 600,
                color: score ? scoreTone : T.text3, whiteSpace: 'nowrap',
              }}
            >
              {score ? SCORE_LABELS[score] : 'не оцінено'}
            </span>
            <div className="flex" style={{ gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = score === n;
                /* Колір ставимо за самою оцінкою, а не акцентом вікна:
                   двійка й пʼятірка — не те саме, і рівний фіолетовий на
                   обох це ховав. */
                const c = n >= 4 ? T.ok : n === 3 ? T.warn : T.bad;
                return (
                  <button
                    key={n}
                    onClick={() => onScore(on ? 0 : n)}
                    title={SCORE_LABELS[n]}
                    style={{
                      width: 52, height: 48, borderRadius: 12, transition: 'all .18s',
                      ...mono(17, { fontWeight: 600 }),
                      background: on ? `${c}22` : T.sunken,
                      border: `1px solid ${on ? c : T.line}`,
                      color: on ? c : T.text2,
                    }}
                    onMouseEnter={(e) => { if (!on) { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; } }}
                    onMouseLeave={(e) => { if (!on) { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; } }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────── висновок: кроки по одному ─────────── */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 20, marginTop: 32 }}>
        <div className="flex items-baseline" style={{ gap: 14 }}>
          <span className="uppercase" style={mono(12, { fontWeight: 600, letterSpacing: '2.2px', color: T.text2 })}>
            Висновок
          </span>
          <span style={mono(12.5, { letterSpacing: '1.2px', color: T.text3 })}>
            крок {idx + 1} з {stepsTotal}
          </span>
        </div>

        <div className="flex items-center" style={{ gap: 6 }}>
          {steps.map((st, i) => (
            <button
              key={st.title}
              onClick={() => go(i)}
              title={st.title}
              style={{
                height: 5, borderRadius: 99, transition: 'all .25s',
                width: i === idx ? 34 : 16,
                background: i === idx ? T.acc : filled[i] ? `rgba(${T.okRgb},0.55)` : T.lineHi,
              }}
            />
          ))}
          <span style={mono(12.5, { marginLeft: 8, fontWeight: 600, color: T.text2 })}>
            {filledCount}/{stepsTotal}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          borderRadius: 20,
          background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
          border: `1px solid ${T.lineHi}`,
          boxShadow: '0 30px 70px -40px rgba(0,0,0,0.9)',
          overflow: 'hidden',
        }}
      >
        {/* Картка їде вбік у той бік, куди рухаєшся. Без напрямку
            «назад» відчувалося б так само, як «далі», і крок губився.

            Анімація навмисно на CSS, а не на framer.

            У framer початковий зсув живе інлайновим стилем, доки рух
            не догра. Спиняться кадри — і картка лишається зсунутою на
            26px убік, а при наступному перемальовуванні (натиснув
            чип — і на тобі) різко вистрілює на місце. Саме це й було
            видно на кроці «Стан за період».

            У CSS базовий стан елемента вже кінцевий, а кадри лише
            прикрашають появу: не встигли — картка просто виникне без
            руху. Ключ перемонтовує вміст і тим перезапускає анімацію. */}
          <div
            key={current.title}
            style={{
              minHeight: 250,
              padding: '30px 32px 26px',
              animation: `edge-step-in-${dir < 0 ? 'left' : 'right'} .3s cubic-bezier(.2,.8,.2,1)`,
            }}
          >
            <div className="flex items-center" style={{ gap: 13 }}>
              <span
                className="grid shrink-0 place-items-center"
                style={{
                  width: 28, height: 28, borderRadius: 9,
                  ...mono(12.5, { fontWeight: 600 }),
                  background: current.accent ? `rgba(${T.accRgb},0.15)` : T.sunken,
                  border: `1px solid ${current.accent ? `rgba(${T.accRgb},0.36)` : T.line}`,
                  color: current.accent ? T.acc : T.text2,
                }}
              >
                {idx + 1}
              </span>
              <span className="uppercase" style={mono(11.5, { fontWeight: 600, letterSpacing: '2px', color: T.text2 })}>
                {current.kicker}
              </span>
            </div>

            <div
              style={{
                fontFamily: T.display, marginTop: 16, fontSize: 26,
                fontWeight: 600, letterSpacing: '-0.5px', color: T.text,
              }}
            >
              {current.title}
            </div>
            <div
              style={{
                fontFamily: T.sans, marginTop: 9, fontSize: 15.5,
                lineHeight: '25px', color: T.text2, maxWidth: 700,
              }}
            >
              {current.hint}
            </div>

            {current.kind === 'chips' && (
              /* Обране мало відрізнятись лише відтінком канта — на
                 сімох чипах поспіль це не читається взагалі. Тепер у
                 вибраного зʼявляється галочка, суцільний кант і
                 підкладка кольору стану: різницю видно з першого
                 погляду, не вчитуючись у кожен. */
              <div className="flex flex-wrap" style={{ marginTop: 24, gap: 10 }}>
                {EMOTIONS.map((e) => {
                  const on = emotions.includes(e.id);
                  const c = e.good ? T.ok : T.warn;
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEmotion(e.id)}
                      className="flex items-center"
                      style={{
                        /* Геометрія однакова в обох станах.

                           Раніше галочка зʼявлялась і зникала разом із
                           місцем під неї, а відступ зліва мінявся з 18
                           на 14 — чип змінював ширину, ряд перепаковувався,
                           і сусіди стрибали вбік. Тепер значок є завжди,
                           просто невидимий: рухаються тільки кольори й
                           прозорість, а їх браузер анімує без перерахунку
                           розкладки. */
                        fontFamily: T.sans, gap: 9, height: 44,
                        padding: '0 18px 0 14px',
                        borderRadius: 12,
                        fontSize: 15, fontWeight: 500,
                        transition: 'background-color .22s ease, border-color .22s ease, color .22s ease, box-shadow .22s ease',
                        background: on ? `${c}22` : T.sunken,
                        border: `1px solid ${on ? c : T.line}`,
                        color: on ? c : T.text2,
                        boxShadow: on ? `0 0 0 3px ${c}1a` : 'none',
                      }}
                      onMouseEnter={(ev) => { if (!on) { ev.currentTarget.style.borderColor = T.lineHi; ev.currentTarget.style.color = T.text; ev.currentTarget.style.background = T.surfaceHi; } }}
                      onMouseLeave={(ev) => { if (!on) { ev.currentTarget.style.borderColor = T.line; ev.currentTarget.style.color = T.text2; ev.currentTarget.style.background = T.sunken; } }}
                    >
                      <span
                        className="grid shrink-0 place-items-center"
                        style={{
                          width: 18, height: 18, borderRadius: 6,
                          background: on ? c : 'transparent',
                          border: `1.5px solid ${on ? c : T.lineHi}`,
                          transition: 'background-color .22s ease, border-color .22s ease',
                        }}
                      >
                        <Check
                          size={12}
                          strokeWidth={3.4}
                          style={{
                            color: 'var(--edge-bg, #0A0A0C)',
                            opacity: on ? 1 : 0,
                            transform: on ? 'scale(1)' : 'scale(0.5)',
                            transition: 'opacity .16s ease, transform .22s cubic-bezier(.22,1,.36,1)',
                          }}
                        />
                      </span>
                      {e.label}
                    </button>
                  );
                })}
              </div>
            )}

            {current.kind === 'list' && (
              <Checklist items={promises} onChange={onPromises} />
            )}

            {current.kind === 'text' && (
              <>
                <Field
                  value={valueOf(current.key)}
                  onChange={(v) => setValue(current.key, v)}
                  placeholder={current.placeholder}
                  accent={current.accent}
                />

                {current.attach && (
                  <Shots
                    items={shots[current.key] || []}
                    max={MAX_SHOTS}
                    onFiles={(list) => addShotFiles(current.key, list)}
                    onUrl={(url) => addShotUrl(current.key, url)}
                    onRemove={(i) => removeShot(current.key, i)}
                  />
                )}
              </>
            )}
          </div>

        <div
          className="flex items-center justify-between"
          style={{ gap: 12, padding: '16px 20px', background: T.sunken, borderTop: `1px solid ${T.line}` }}
        >
          <button
            onClick={() => go(idx - 1)}
            disabled={idx === 0}
            className="flex items-center"
            style={{
              fontFamily: T.sans, gap: 8, height: 46, padding: '0 16px 0 13px', borderRadius: 12,
              border: `1px solid ${T.line}`, fontSize: 14.5, transition: 'all .18s',
              color: T.text2, opacity: idx === 0 ? 0.35 : 1,
              cursor: idx === 0 ? 'default' : 'pointer',
            }}
            onMouseEnter={(e) => { if (idx) { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
          >
            <ChevronLeft size={16} strokeWidth={2} />
            Назад
          </button>

          <div className="flex items-center" style={{ gap: 10 }}>
            {idx < stepsTotal - 1 && !filled[idx] && (
              <button
                onClick={() => go(idx + 1)}
                style={{ fontFamily: T.sans, height: 46, padding: '0 14px', borderRadius: 12, fontSize: 14.5, color: T.text3, transition: 'color .18s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
              >
                Пропустити
              </button>
            )}

            <button
              onClick={() => go(idx + 1)}
              disabled={idx === stepsTotal - 1}
              className="flex items-center"
              style={{
                fontFamily: T.sans, gap: 9, height: 46, padding: '0 20px', borderRadius: 12,
                background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)',
                fontSize: 15, fontWeight: 600, transition: 'all .18s',
                opacity: idx === stepsTotal - 1 ? 0.45 : 1,
                cursor: idx === stepsTotal - 1 ? 'default' : 'pointer',
                boxShadow: `0 14px 30px -18px rgba(${T.accRgb},0.9)`,
              }}
            >
              {idx === stepsTotal - 1 ? 'Готово' : 'Далі'}
              {idx < stepsTotal - 1 && <ChevronRight size={16} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>

      {/* Уже відповіджені кроки — щоб повернутись, не гортаючи слайдер */}
      {answered.length > 0 && (
        <div className="flex flex-col" style={{ marginTop: 12, gap: 7 }}>
          {answered.map((a) => (
            <button
              key={a.title}
              onClick={() => go(a.i)}
              className="flex items-center text-left"
              style={{
                gap: 12, padding: '13px 18px', borderRadius: 13,
                background: T.surface, border: `1px solid ${T.line}`, transition: 'all .18s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.background = T.surfaceHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.surface; }}
            >
              <Check size={15} strokeWidth={2.4} className="shrink-0" style={{ color: T.ok }} />
              <span
                className="shrink-0 truncate uppercase"
                style={{ ...mono(11, { fontWeight: 600, letterSpacing: '1.4px', color: T.text3 }), width: 170 }}
              >
                {a.title}
              </span>
              <span className="min-w-0 flex-1 truncate" style={{ fontFamily: T.sans, fontSize: 14.5, color: T.text2 }}>
                {a.preview}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ─────────── збереження ─────────── */}
      {/* Показуємо на останньому кроці. Кнопка «Зберегти» поруч із
          «Далі» весь час — це два заклики до дії водночас, і людина
          тисне збереження, не дійшовши до головного питання. */}
      {idx === stepsTotal - 1 && (
      <div className="flex items-center" style={{ marginTop: 16, gap: 12 }}>
        <button
          onClick={onSave}
          disabled={!ready || saving}
          className="flex flex-1 items-center justify-center"
          style={{
            fontFamily: T.sans, gap: 10, height: 56, borderRadius: 14,
            background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)',
            fontSize: 16, fontWeight: 600, transition: 'all .18s',
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
            fontFamily: T.sans, height: 56, padding: '0 26px', borderRadius: 14,
            border: `1px solid ${T.line}`, color: T.text2, fontSize: 15, transition: 'all .18s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text2; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
        >
          Скасувати
        </button>
      </div>
      )}

      <p style={{ fontFamily: T.sans, marginTop: 14, textAlign: 'center', fontSize: 14, color: T.text3 }}>
        Обовʼязкові тільки оцінка дисципліни й одна зміна на наступний період — решту можна пропустити
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
      <span className="tabular-nums" style={mono(18, { fontWeight: 600, color: tone || T.text })}>
        {value}
      </span>
      <span style={{ fontFamily: T.sans, fontSize: 14, color: T.text2 }}>{unit}</span>
    </span>
  );
}

function Metric({ label, value, tone, last }) {
  return (
    <div style={{ padding: '16px 20px', borderRight: last ? 'none' : `1px solid ${T.line}` }}>
      <div className="uppercase" style={mono(11, { letterSpacing: '1.4px', fontWeight: 600, color: T.text2 })}>
        {label}
      </div>
      <div className="tabular-nums" style={mono(22, { marginTop: 8, fontWeight: 600, color: tone || T.text })}>
        {value}
      </div>
    </div>
  );
}

/* Позначка вибору.

   Була голим квадратиком 18px із тонким кантом — на світлому рядку її
   було ледве видно, а натиснути точно виходило не завжди. Тепер:
   помітніша підкладка в незібраному стані, помітно товща галочка й
   мʼяке сяйво по колу, коли вибрано. Розмір 22px — саме та межа, за
   якою чекбокс перестає бути «дрібницею на краю рядка».

   Галочка проявляється масштабом, а не появою: миттєвий стрибок на
   такому дрібному елементі читається як блимання. */
function Box({ on, tone }) {
  const c = tone || T.acc;
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        transition: 'background .18s ease, border-color .18s ease, box-shadow .18s ease',
        background: on ? c : 'rgba(255,255,255,0.035)',
        border: `1.5px solid ${on ? c : T.lineHi}`,
        boxShadow: on ? `0 0 0 3px ${c}22` : 'none',
      }}
    >
      <Check
        size={13}
        strokeWidth={3.4}
        style={{
          color: 'var(--edge-bg, #0A0A0C)',
          opacity: on ? 1 : 0,
          transform: on ? 'scale(1)' : 'scale(0.6)',
          transition: 'opacity .15s ease, transform .18s cubic-bezier(.22,1,.36,1)',
        }}
      />
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
      <span
        key="pair"
        style={{
          fontFamily: T.sans, fontSize: 15.5, fontWeight: 600, letterSpacing: '.2px',
          color: on ? T.text : T.text2, transition: 'color .18s',
        }}
      >
        {item.pair}
      </span>,
      <span
        key="side"
        className="inline-flex items-center uppercase"
        style={{
          height: 20, padding: '0 8px', borderRadius: 6,
          ...mono(11, { fontWeight: 600, letterSpacing: '1px' }),
          background: long ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
          border: `1px solid ${long ? `rgba(${T.okRgb},${on ? 0.38 : 0.22})` : `rgba(${T.badRgb},${on ? 0.38 : 0.22})`}`,
          transition: 'all .18s',
          color: long ? T.ok : T.bad,
        }}
      >
        {item.type}
      </span>,
      <span key="r" className="tabular-nums" style={mono(14, { fontWeight: 600, color: r > 0 ? T.ok : r < 0 ? T.bad : T.text3 })}>
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
      <span key="pair" style={{ fontFamily: T.sans, fontSize: 15.5, fontWeight: 600, color: T.text }}>{item.pair}</span>,
      <span
        key="st"
        style={{
          fontFamily: T.sans, padding: '3px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500,
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
      <span key="t" style={{ fontFamily: T.sans, fontSize: 15.5, fontWeight: 600, color: T.text }}>{m.label}</span>,
      <span key="p" style={{ fontFamily: T.sans, fontSize: 14, color: T.text2 }}>{item.pair}</span>,
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

  /* Один клік дивиться, подвійний бере в розбір.

     Браузер шле click і на першому кліку подвійного теж, тому просту
     дію доводиться відкладати: якщо протягом 220 мс прилетів dblclick,
     скасовуємо відкриття вікна й перемикаємо вибір. Без цієї паузи
     подвійний клік спершу відкривав би вікно перегляду, а вибір
     відбувався б уже за ним. */
  const clickTimer = useRef(null);

  useEffect(() => () => clearTimeout(clickTimer.current), []);

  const onSingle = () => {
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(onPreview, 220);
  };
  const onDouble = () => {
    clearTimeout(clickTimer.current);
    onToggle();
  };

  return (
    <div
      onClick={onSingle}
      onDoubleClick={onDouble}
      className="group relative flex cursor-pointer select-none items-center"
      style={{
        gap: 16, padding: '15px 20px 15px 22px',
        borderBottom: `1px solid ${T.line}`,
        /* Обране — світліша підкладка з градієнтом, що згасає вправо, і
           тонкий відблиск згори. Нейтральна, без акценту: акцент у
           списку на сорок рядків робить із нього фіолетову ковдру. */
        background: on ? SELECTED_BG : 'transparent',
        boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.045)' : 'none',
        transition: 'all .2s',
      }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Світла риска зліва. Росте від центра, а не зʼявляється цілком —
          саме рух робить вибір помітним краєм ока. */}
      <span
        className="absolute"
        style={{
          left: 0, top: '50%', width: 2, borderRadius: 99,
          transform: 'translateY(-50%)',
          height: on ? '62%' : 0,
          opacity: on ? 1 : 0,
          background: 'linear-gradient(180deg, rgba(236,234,243,0.85), rgba(236,234,243,0.25))',
          transition: 'all .24s cubic-bezier(.2,.8,.2,1)',
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center" style={{ gap: 10 }}>
          {head}
          {/* На вузькому екрані окрема колонка справа лишає тексту
              смужку в кілька слів, тому дата йде в той самий рядок. */}
          <span className="tabular-nums sm:hidden" style={{ fontFamily: T.sans, fontSize: 13, color: T.text3 }}>
            {meta}
          </span>
        </div>
        {note && (
          <div style={{ fontFamily: T.sans, marginTop: 6, fontSize: 14, lineHeight: '21px', color: flagged ? T.warn : T.text2 }}>
            {note}
          </div>
        )}
      </div>

      <span className="hidden shrink-0 tabular-nums sm:block" style={{ fontFamily: T.sans, fontSize: 13, color: T.text3 }}>
        {meta}
      </span>

      {/* Кнопка вибору. Подвійний клік по рядку робить те саме, але
          сам себе він не показує — а ця кнопка і є підказкою, що
          матеріал можна взяти в розбір. */}
      <Pick on={on} onClick={(e) => { e.stopPropagation(); onToggle(); }} />
    </div>
  );
}

/* Поле відповіді.

   Шапки з підписом і лічильником слів тут більше немає: вона займала
   рядок, відбирала контраст у самого поля й нічого не вирішувала —
   що це поле для тексту, видно й так.

   Уся рамка живе в CSS-класі, а не в інлайнових стилях. Це не смак:
   інлайновий style перебиває будь-яке правило з таблиці, тому
   :focus-within просто не мав шансу — кант і кільце на фокусі не
   зʼявлялись зовсім.
*/
function Field({ value, onChange, placeholder, accent }) {
  return (
    <div
      className={`edge-field${accent ? ' edge-field--accent' : ''}`}
      style={{ marginTop: 22, maxWidth: 1100 }}
    >
      {/* Плашка згори. Лічильника слів у ній навмисно немає — він
          рахував те, чого ніхто не міряє, і забирав праву половину
          рядка. Лишився самий підпис, який на фокусі світлішає до
          акценту: видно, в якому саме полі курсор. */}
      <div
        className="edge-field-cap uppercase"
        style={{
          fontFamily: T.mono, padding: '10px 18px 9px',
          fontSize: 10.5, fontWeight: 600, letterSpacing: '1.6px',
          color: T.text3,
          background: 'rgba(255,255,255,0.03)',
          borderBottom: `1px solid ${T.line}`,
          transition: 'color .18s ease',
        }}
      >
        {accent ? 'Зміна' : 'Відповідь'}
      </div>

      {/* Росте до шести рядків, далі прокрутка. Ручка розтягування
          прибрана: нею користувались, щоб побачити довгий текст, а
          тепер поле само дає стільки місця, скільки має сенс, і не
          роздуває картку на пів екрана. */}
      <TextareaAutosize
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        minRows={3}
        maxRows={6}
        className="edge-scroll w-full bg-transparent outline-none"
        style={{
          fontFamily: T.sans, padding: '15px 18px 16px',
          color: T.text, fontSize: 16, lineHeight: '27px',
          resize: 'none',
        }}
      />
    </div>
  );
}

/* Чекліст домовленостей на наступний період.

   Раніше обіцянка виводилась із тексту «одна зміна»: що написав — те
   й ставало єдиним пунктом. Але «жодної угоди поза London» і
   «стоп на день після двох стопів» — це два різні правила, і
   позначати їх виконаними теж треба окремо.

   Enter додає й лишає курсор у полі: правила пишуть чергою, і тягтись
   до кнопки після кожного — зайвий рух.
*/
/* Три — не кругле число заради краси. Стільки правил людина реально
   тримає в голові під час сесії; із десятьма список перетворюється на
   декларацію, яку ніхто не перечитує. Обмеження жорстке, бо м'яка
   порада «тримай список коротким» не працює. */
const MAX_RULES = 3;

function Checklist({ items, onChange }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const full = items.length >= MAX_RULES;

  const add = () => {
    const v = draft.trim();
    if (!v || full) return;
    /* Дублікат мовчки не додаємо: два однакові рядки в списку
       домовленостей — це не два правила, а помилка набору. */
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    onChange([...items, v]);
    setDraft('');
    inputRef.current?.focus();
  };

  const remove = (i) => onChange(items.filter((_, k) => k !== i));

  return (
    <div style={{ marginTop: 22, maxWidth: 900 }}>
      {items.length > 0 && (
        <div className="flex flex-col" style={{ marginBottom: 12, gap: 8 }}>
          {items.map((text, i) => (
            <div
              key={text}
              className="group/row flex items-center"
              style={{
                gap: 14, padding: '14px 16px', borderRadius: 13,
                background: T.sunken, border: `1px solid ${T.line}`,
                transition: 'border-color .18s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
            >
              {/* Порожня рамка, а не галочка: тут правило лише
                  записують. Ставити позначку буде наступний розбір. */}
              <span
                className="shrink-0"
                style={{
                  width: 20, height: 20, borderRadius: 6,
                  border: `1.6px solid ${T.lineHi}`,
                }}
              />
              <span
                className="min-w-0 flex-1"
                style={{ fontFamily: T.sans, fontSize: 16, lineHeight: '24px', color: T.text }}
              >
                {text}
              </span>
              <button
                onClick={() => remove(i)}
                title="Прибрати"
                className="grid shrink-0 place-items-center opacity-0 transition-all duration-200 group-hover/row:opacity-100"
                style={{ width: 28, height: 28, borderRadius: 9, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={14} strokeWidth={2.6} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* На трьох правилах поле просто зникає. Ні лічильника, ні
          пояснення: три рядки на екрані самі показують, що список
          повний, а хрестик поруч — як його звільнити. */}
      {!full && (
      <div
        /* Той самий клас, що й у полях відповідей: інлайнові фон і кант
           перебивали б :focus-within і фокус знову б не малювався. */
        className="edge-field edge-field--accent flex items-center"
        style={{ gap: 12, padding: '0 8px 0 16px' }}
      >
        <Plus size={17} strokeWidth={2.4} className="shrink-0" style={{ color: T.acc }} />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Наприклад: після двох стопів — стоп на день"
          className="min-w-0 flex-1 bg-transparent outline-none"
          style={{ fontFamily: T.sans, height: 56, fontSize: 16, color: T.text }}
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0"
          style={{
            fontFamily: T.sans, height: 40, padding: '0 18px', borderRadius: 11,
            fontSize: 14.5, fontWeight: 600,
            background: draft.trim() ? T.acc : 'transparent',
            color: draft.trim() ? 'var(--edge-on-acc, #0A0A0C)' : T.text4,
            cursor: draft.trim() ? 'pointer' : 'default',
            transition: 'all .18s',
          }}
        >
          Додати
        </button>
      </div>
      )}

      {!full && (
        <p style={{ fontFamily: T.sans, marginTop: 10, fontSize: 13.5, color: T.text3 }}>
          Enter додає правило. Максимум {MAX_RULES} — стільки реально тримаєш у голові під час сесії.
        </p>
      )}
    </div>
  );
}

/* Скріншоти кроку.

   Дві речі, яких не було в макеті, але без яких блок неповний:

   • вставка посилання з TradingView (Ctrl+V або перетягнути) — рівно
     як на сторінці планів, бо саме звідти беруть графіки;
   • перегляд: клік по мініатюрі відкриває галерею зі стрілками й
     лупою, а не окрему вкладку з голою картинкою.

   Зона більша за макетну (168×108 проти 126×80): у неї кладуть
   графіки, а на мініатюрі 126px від графіка лишається пляма.
*/
function Shots({ items, max, onFiles, onUrl, onRemove }) {
  const [hot, setHot] = useState(false);
  const [view, setView] = useState(-1);

  const takeUrl = (raw) => {
    const url = String(raw || '').trim();
    if (!isHttpUrl(url)) return false;
    onUrl(url);
    return true;
  };

  const onPaste = (e) => {
    if (takeUrl(e.clipboardData.getData('text'))) { e.preventDefault(); return; }
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); onFiles(files); }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setHot(false);
    if (e.dataTransfer.files?.length) { onFiles(e.dataTransfer.files); return; }
    takeUrl(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text'));
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div className="flex items-center justify-between" style={{ gap: 16 }}>
        <span className="uppercase" style={mono(11, { fontWeight: 600, letterSpacing: '1.6px', color: T.text3 })}>
          Скріншоти
        </span>
        <span style={{ fontFamily: T.sans, fontSize: 13.5, color: T.text3 }}>
          {items.length ? `${items.length} з ${max}` : 'немає'}
        </span>
      </div>

      <div className="flex flex-wrap" style={{ marginTop: 12, gap: 10 }}>
        {items.map((sh, i) => (
          <div
            key={sh.src}
            className="group/shot relative overflow-hidden"
            style={{
              width: 168, height: 108, borderRadius: 12,
              border: `1px solid ${T.line}`, background: T.sunken,
              cursor: 'zoom-in', transition: 'border-color .2s',
            }}
            onClick={() => setView(i)}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
          >
            <img src={sh.src} alt="" loading="lazy" className="h-full w-full object-cover" />

            <button
              onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              title="Прибрати"
              className="absolute grid place-items-center opacity-0 transition-all duration-200 group-hover/shot:opacity-100"
              style={{
                top: 6, right: 6, width: 24, height: 24, borderRadius: 8,
                background: 'rgba(12,12,16,0.72)', backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.09)', color: '#cfcddb',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.badRgb},0.9)`; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(12,12,16,0.72)'; e.currentTarget.style.color = '#cfcddb'; }}
            >
              <X size={12} strokeWidth={2.6} />
            </button>

            <span
              className="absolute inset-x-0 bottom-0 truncate"
              style={{
                padding: '6px 9px',
                background: 'linear-gradient(180deg, transparent, rgba(10,10,13,0.85))',
                ...mono(10.5, { letterSpacing: '.5px' }),
                color: '#b9b7c4',
              }}
            >
              {sh.name}
            </span>
          </div>
        ))}

        {items.length < max && (
          <label
            tabIndex={0}
            onPaste={onPaste}
            onDragOver={(e) => { e.preventDefault(); setHot(true); }}
            onDragLeave={() => setHot(false)}
            onDrop={onDrop}
            className="flex cursor-pointer flex-col items-center justify-center outline-none"
            style={{
              width: 168, height: 108, gap: 7, borderRadius: 12,
              border: `1px dashed ${hot ? T.acc : T.lineHi}`,
              background: hot ? `rgba(${T.accRgb},0.09)` : `rgba(${T.accRgb},0.03)`,
              color: hot ? T.acc : T.text3,
              transition: 'all .2s',
            }}
          >
            <ImagePlus size={19} strokeWidth={1.7} />
            <span style={{ fontFamily: T.sans, fontSize: 13 }}>
              {hot ? 'Відпусти' : 'Додати'}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
              className="hidden"
            />
          </label>
        )}
      </div>

      <div style={{ fontFamily: T.sans, marginTop: 10, fontSize: 13, color: T.text3 }}>
        Ctrl+V посилання з TradingView, перетягни файл або вибери — до {max} на крок
      </div>

      {view >= 0 && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setView(-1); }}
          className="fixed inset-0 z-[300] flex items-center justify-center p-6"
          style={{ background: 'rgba(8,8,11,0.86)', backdropFilter: 'blur(8px)' }}
        >
          <div className="w-full" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
            <ImageSlider images={items.map((x) => x.src)} containerClassName="h-[70vh] w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

/* Перемикач «беру в розбір».

   З макета: у спокої — порожнє коло з плюсом, при виборі кнопка
   розтягується в пігулку з галочкою й підписом. Колір нейтральний,
   світло-прозорий, а не акцентний: фіолетова заливка на кожному
   другому рядку перетворювала список на строкату мозаїку. */
function Pick({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      title={on ? 'Прибрати з розбору' : 'Додати в розбір'}
      className="flex shrink-0 items-center justify-center"
      style={{
        gap: 7,
        height: 30,
        width: on ? 'auto' : 30,
        padding: on ? '0 13px 0 11px' : 0,
        borderRadius: 99,
        background: on ? 'rgba(255,255,255,0.055)' : 'transparent',
        border: `1px solid ${on ? 'rgba(255,255,255,0.15)' : T.lineHi}`,
        boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
        color: on ? T.text : T.text3,
        transition: 'all .22s cubic-bezier(.2,.8,.2,1)',
      }}
      onMouseEnter={(e) => {
        if (on) return;
        e.currentTarget.style.borderColor = T.text3;
        e.currentTarget.style.color = T.text;
      }}
      onMouseLeave={(e) => {
        if (on) return;
        e.currentTarget.style.borderColor = T.lineHi;
        e.currentTarget.style.color = T.text3;
      }}
    >
      {on ? <Check size={13} strokeWidth={2.4} /> : <Plus size={13} strokeWidth={2.2} />}
      {on && (
        <span className="uppercase" style={mono(10, { letterSpacing: '1.3px', whiteSpace: 'nowrap' })}>
          у розборі
        </span>
      )}
    </button>
  );
}
