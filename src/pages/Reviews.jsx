import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, X, ArrowLeft, BookOpenCheck, Loader2 } from 'lucide-react';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import { notify } from '../utils/notify';
import { useAuth } from '../context/AuthContext';
import { periodStats, repeatedMistakes, previousReview, fmtRange } from '../lib/reviewsData';
import {
  loadReviews, createReview, deleteReview, setReviewPublic,
  loadMaterial, loadAllMistakes,
} from '../lib/reviewsStore';
import ReviewBuilder from '../components/reviews/ReviewBuilder';
import { DateRangeField } from '../components/ui/DateField';
import ConfirmModal from '../components/ui/ConfirmModal';
import ReviewReader from '../components/reviews/ReviewReader';
import ReviewRow from '../components/reviews/ReviewRow';

/* ==================================================================
   Розбори.
   Список готових розборів — і окрема сторінка, де збирається новий:
   зліва матеріал за період (угоди, плани, помилки), справа висновок.
   Все в одному екрані, без перемикань туди-сюди.
================================================================== */

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/* ================================================================== */

export default function Reviews() {
  useEdgeFonts();

  const { user } = useAuth();

  const [mode, setMode] = useState('list');           // list | create
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Матеріал приходить з журналу за вибраний період, а не з демо */
  const [material, setMaterial] = useState({ trades: [], plans: [], mistakes: [] });
  const [allMistakes, setAllMistakes] = useState([]);
  const [loadingMaterial, setLoadingMaterial] = useState(false);

  /* Фільтр живе у двох станах: що людина набирає й що вже застосовано.

     Живий пошук по тексту сам по собі непоганий, але дата так не
     працює: після першого кліку по календарю період неповний, і
     список на мить схлопувався б у порожнечу. Тому обидва поля — це
     чернетка, а список змінює одна кнопка. */
  const EMPTY = { q: '', from: '', to: '' };
  const [draft, setDraft] = useState(EMPTY);
  const [query, setQuery] = useState(EMPTY);

  const dirty = draft.q !== query.q || draft.from !== query.from || draft.to !== query.to;
  const applyFilters = () => setQuery(draft);
  const resetFilters = () => { setDraft(EMPTY); setQuery(EMPTY); };
  const [reading, setReading] = useState(null);

  /* стан нового розбору */
  const [range, setRange] = useState({ from: daysAgo(6), to: today() });
  const [selected, setSelected] = useState({ trades: [], plans: [], mistakes: [] });
  const [score, setScore] = useState(0);
  const [emotions, setEmotions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [lesson, setLesson] = useState('');
  const [keptPromises, setKeptPromises] = useState({});
  const [shots, setShots] = useState({});
  /* Домовленості на наступний період. Раніше виводились із тексту
     «одна зміна» — увесь абзац ставав єдиним пунктом. Тепер це
     справжній список, який наступний розбір покаже для позначок. */
  const [promises, setPromises] = useState([]);
  /* Розбір, який просять видалити. Тримаємо весь обʼєкт, а не id:
     у вікні підтвердження показуємо його висновок, щоб було видно,
     що саме зникне. */
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && reading) setReading(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading]);

  /* ---------- розбори з бази ---------- */
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      try {
        const [list, hist] = await Promise.all([loadReviews(user.id), loadAllMistakes(user.id)]);
        if (!alive) return;
        setReviews(list);
        setAllMistakes(hist);
      } catch (err) {
        notify.error('Розбори не завантажились', err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  /* ---------- матеріал за період ---------- */
  useEffect(() => {
    if (!user?.id || mode !== 'create') return;
    let alive = true;
    setLoadingMaterial(true);
    loadMaterial(user.id, range.from, range.to)
      .then((m) => { if (alive) setMaterial(m); })
      .catch((err) => notify.error('Матеріал не завантажився', err.message))
      .finally(() => { if (alive) setLoadingMaterial(false); });
    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id, mode, range.from, range.to]);

  /* матеріал за вибраний період */
  /* Фільтрацію по періоду вже зробив запит — тут лише зручний псевдонім */
  const inPeriod = material;

  const stats = useMemo(() => periodStats(inPeriod.trades, inPeriod.mistakes), [inPeriod]);
  const repeats = useMemo(
    () => repeatedMistakes(allMistakes, range.from, range.to),
    [allMistakes, range],
  );
  const prev = useMemo(() => previousReview(reviews, range.from), [reviews, range]);

  /* коли міняється період — знімаємо вибір того, що вже поза ним */
  useEffect(() => {
    setSelected((s) => ({
      trades: s.trades.filter((id) => inPeriod.trades.some((t) => t.id === id)),
      plans: s.plans.filter((id) => inPeriod.plans.some((p) => p.id === id)),
      mistakes: s.mistakes.filter((id) => inPeriod.mistakes.some((m) => m.id === id)),
    }));
  }, [inPeriod]);

  const toggle = (kind, id) =>
    setSelected((s) => ({
      ...s,
      [kind]: s[kind].includes(id) ? s[kind].filter((x) => x !== id) : [...s[kind], id],
    }));

  const startCreate = () => {
    setRange({ from: daysAgo(6), to: today() });
    setSelected({ trades: [], plans: [], mistakes: [] });
    setScore(0); setEmotions([]); setAnswers({}); setLesson(''); setKeptPromises({}); setShots({}); setPromises([]);
    setMode('create');
  };

  const saveReview = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      /* Статистику зберігаємо зліпком: угоди потім можна відредагувати,
         а розбір має лишитись свідченням того, як усе виглядало тоді */
      const saved = await createReview(user.id, {
        from: range.from,
        to: range.to,
        score,
        emotions,
        answers,
        lesson: lesson.trim(),
        shots,
        /* Якщо чекліст порожній, а зміна написана — беремо її як
           єдину домовленість: краще одна, ніж жодної. */
        promises: promises.length
          ? promises.map((text) => ({ text, done: false }))
          : lesson.trim() ? [{ text: lesson.trim(), done: false }] : [],
        stats: {
          trades: stats.total,
          netR: stats.netR,
          winrate: stats.winrate,
          planRate: stats.planRate,
          mistakes: stats.mistakes,
        },
        evidence: selected,
      });

      setReviews((list) => [saved, ...list]);
      setMode('list');
      notify.success('Розбір збережено', 'Тепер його видно з будь-якого пристрою.');
    } catch (err) {
      notify.error('Не вдалось зберегти', err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- видалення ---------- */
  const removeReview = async () => {
    const id = toDelete?.id;
    if (!id) return;

    const before = reviews;
    setDeleting(true);
    /* Прибираємо зі списку одразу, а вікно закриваємо після відповіді
       бази: інакше на помилці розбір повертався б у список уже після
       того, як людина відвела погляд. */
    setReviews((list) => list.filter((x) => x.id !== id));
    try {
      await deleteReview(user.id, id);
      setToDelete(null);
      if (reading?.id === id) setReading(null);
    } catch (err) {
      setReviews(before);
      notify.error('Не вдалось видалити', err.message);
    } finally {
      setDeleting(false);
    }
  };

  /* ---------- поділитись ---------- */
  const shareReview = async (review) => {
    try {
      const updated = review.isPublic
        ? review
        : await setReviewPublic(user.id, review.id, true);

      setReviews((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      if (reading?.id === updated.id) setReading(updated);

      await navigator.clipboard.writeText(`${window.location.origin}/shared/review/${updated.id}`);
      notify.success('Лінк скопійовано', 'Розбір відкритий для перегляду за посиланням.');
    } catch (err) {
      notify.error('Не вдалось поділитись', err.message);
    }
  };

  const unshareReview = async (review) => {
    try {
      const updated = await setReviewPublic(user.id, review.id, false);
      setReviews((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      if (reading?.id === updated.id) setReading(updated);
      notify.success('Доступ закрито', 'Посилання більше не працює.');
    } catch (err) {
      notify.error('Не вдалось закрити доступ', err.message);
    }
  };

  const filtered = useMemo(() => {
    const q = query.q.trim().toLowerCase();

    /* Умови складаються: слово І період. Задав обидва — лишаються
       розбори, що підходять під те й те. */
    return reviews.filter((r) => {
      /* Розбір має вміститись у вибраний проміжок цілком.

         Спершу тут був перетин — «хоч одним днем зачепився». На ділі
         це збивало з пантелику: обираєш 25–31 серпня й отримуєш ще й
         розбір за 23–29, бо в них спільні шість днів. «Цілком
         усередині» — єдине правило, яке легко передбачити наперед. */
      if (query.from && (r.from || r.to) < query.from) return false;
      if (query.to && (r.to || r.from) > query.to) return false;

      if (!q) return true;
      return (r.lesson || '').toLowerCase().includes(q)
        || Object.values(r.answers || {}).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [reviews, query]);

  /* ================================================================ */

  return (
    <div className="relative min-h-full">

      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        {/* Лише для списку: у нового розбору шапка своя, з поверненням
            назад і перемикачем періоду. */}
        {mode === 'list' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        >
          <div className="flex min-w-0 items-start gap-4">

            <div className="min-w-0">
              <div
                className="uppercase"
                style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '2.6px', color: T.acc }}
              >
                Розбори
              </div>
              <h1
                className="text-[28px] leading-none sm:text-[38px]"
                style={{ fontFamily: T.display, marginTop: 13, fontWeight: 600, color: T.text, letterSpacing: '-1px' }}
              >
                Висновки
              </h1>
              {/* Лічильник моноширинним і в верхньому регістрі — він
                  службовий, і так не змагається із заголовком за увагу. */}
              <p
                className="uppercase"
                style={{ fontFamily: T.mono, marginTop: 13, fontSize: 11, letterSpacing: '1.8px', color: T.text3 }}
              >
                {`${reviews.length} ${reviews.length === 1 ? 'розбір' : 'розборів'}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex h-[42px] w-full items-center gap-2.5 rounded-xl px-3.5 transition-colors duration-200 sm:w-[260px]"
                  style={{ background: T.surface, border: `1px solid ${T.line}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
                >
                  <Search size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
                  <input
                    value={draft.q}
                    onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
                    placeholder="Пошук по висновках…"
                    className="w-full bg-transparent text-[14px] outline-none"
                    style={{ fontFamily: T.sans, color: T.text }}
                  />
                  {draft.q && (
                    <button
                      onClick={() => { setDraft((d) => ({ ...d, q: '' })); setQuery((v) => ({ ...v, q: '' })); }}
                      style={{ color: T.text4 }}
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  )}
                </div>

                {/* Період одним полем: готові проміжки зліва, календар
                    справа. Той самий react-day-picker у тих самих
                    кольорах, що й у новому розборі. */}
                <div className="w-[220px]">
                  <DateRangeField
                    value={{ from: draft.from, to: draft.to }}
                    onChange={(r) => setDraft((d) => ({ ...d, ...r }))}
                  />
                </div>

                {/* Одна кнопка на обидва поля. Поки чернетка збігається
                    з тим, що вже показано, вона гасне — інакше людина
                    тисне її й не розуміє, чому нічого не змінилось. */}
                <button
                  onClick={applyFilters}
                  disabled={!dirty}
                  className="inline-flex h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-bold transition-all duration-200"
                  style={{
                    fontFamily: T.sans,
                    background: dirty ? `rgba(${T.accRgb},0.14)` : 'transparent',
                    border: `1px solid ${dirty ? T.lineAcc : T.line}`,
                    color: dirty ? T.acc : T.text4,
                    cursor: dirty ? 'pointer' : 'default',
                  }}
                >
                  <Search size={15} strokeWidth={2.6} />
                  Пошук
                </button>

                {(query.q || query.from || query.to) && (
                  <button
                    onClick={resetFilters}
                    title="Скинути фільтри"
                    className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl transition-colors duration-200"
                    style={{ border: `1px solid ${T.line}`, color: T.text3 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.35)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                  >
                    <X size={15} strokeWidth={2.4} />
                  </button>
                )}

                {/* Та сама кнопка, що «Add Account» на рахунках: висота
                    під сусіднє поле пошуку, решта — спільний клас. */}
                <button
                  onClick={startCreate}
                  className="edge-add-btn inline-flex h-[42px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold"
                  style={{ color: '#fff', fontFamily: T.sans }}
                >
                  <Plus size={15} strokeWidth={3} className="shrink-0" style={{ color: T.acc }} />
                  Новий розбір
                </button>
          </div>
        </motion.div>
        )}

        {/* ─────────── Контент ─────────── */}
        <AnimatePresence mode="wait">
          {mode === 'list' ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2.5 py-24">
                  <Loader2 size={18} className="animate-spin" style={{ color: T.acc }} />
                  <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    завантажую розбори…
                  </span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-24 text-center">
                  <div
                    className="mb-6 grid h-16 w-16 place-items-center rounded-2xl"
                    style={{ border: `1px dashed ${T.lineHi}`, color: T.text3 }}
                  >
                    <BookOpenCheck size={24} strokeWidth={1.7} />
                  </div>
                  <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
                    {reviews.length === 0 ? 'Ще немає розборів' : 'Нічого не знайшлось'}
                  </div>
                  <p className="mb-7 max-w-[440px] text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
                    {reviews.length === 0
                      ? 'Розбір — це коли ти дивишся на свої угоди, плани й помилки разом і вирішуєш, що змінити. Достатньо раз на тиждень.'
                      : 'Спробуй інші слова або ширший період.'}
                  </p>
                  <button
                    onClick={() => (reviews.length === 0 ? startCreate() : resetFilters())}
                    className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-transform duration-200 active:scale-[0.98]"
                    style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                  >
                    {reviews.length === 0 ? <><Plus size={15} strokeWidth={3} /> Зробити перший</> : 'Скинути фільтри'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <AnimatePresence initial={false}>
                    {filtered.map((r, i) => (
                      <ReviewRow
                        key={r.id}
                        review={r}
                        index={i}
                        onOpen={setReading}
                        onDelete={(id) => setToDelete(reviews.find((x) => x.id === id))}
                        onShare={shareReview}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <ReviewBuilder
                onBack={() => setMode('list')}
                range={range}
                onRange={setRange}
                stats={stats}
                material={inPeriod}
                loadingMaterial={loadingMaterial}
                selected={selected}
                onToggle={toggle}
                repeats={repeats}
                score={score}
                onScore={setScore}
                emotions={emotions}
                onEmotion={(id) => setEmotions((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
                answers={answers}
                onAnswer={(id, v) => setAnswers((s) => ({ ...s, [id]: v }))}
                lesson={lesson}
                onLesson={setLesson}
                prevReview={prev}
                keptPromises={keptPromises}
                onKeptPromise={(i, v) => setKeptPromises((s) => ({ ...s, [i]: v }))}
                shots={shots}
                onShots={setShots}
                userId={user?.id}
                promises={promises}
                onPromises={setPromises}
                saving={saving}
                onSave={saveReview}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {reading && (
          <ReviewReader
            key="reader"
            review={reading}
            onClose={() => setReading(null)}
            onDelete={(id) => setToDelete(reviews.find((x) => x.id === id))}
            onShare={() => shareReview(reading)}
            onUnshare={() => unshareReview(reading)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toDelete && (
          <ConfirmModal
            open
            title="Видалити розбір?"
            text={`За ${fmtRange(toDelete.from, toDelete.to)}. Разом із ним зникнуть відповіді, обрані угоди й скріншоти. Скасувати це не вийде.`}
            detail={toDelete.lesson}
            confirmLabel="Видалити розбір"
            busy={deleting}
            onConfirm={removeReview}
            onCancel={() => setToDelete(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
