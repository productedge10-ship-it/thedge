import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Loader2, Search, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { Magnetic } from '../components/ui/Hovers';
import { notify } from '../utils/notify';
import { useAuth } from '../context/AuthContext';
import {
  fetchErrors, saveError, removeError, setErrorResolved, migrateLegacyErrors, uid, todayISO,
} from '../lib/errorsStore';
import { MONTHS, catsFromReasons } from '../components/errors/utils';
import ErrorStats from '../components/errors/ErrorStats';
import ErrorFilters from '../components/errors/ErrorFilters';
import ErrorGrid from '../components/errors/ErrorGrid';
import ErrorDetailDrawer from '../components/errors/ErrorDetailDrawer';
import ErrorComposerModal from '../components/errors/ErrorComposerModal';

/* ==================================================================
   Головна дія розділу.

   Та сама родина, що «Add Trade» у журналі й «Новий аналіз» в
   аналізах: темна заливка, акцентна рамка, ореол знизу. Спільна мова
   потрібна, щоб головну дію було видно однаково на будь-якій
   сторінці, не вчитуючись.

   Своя в кожної — історія під курсором, і вона каже, в якому ти
   розділі. Тут кнопка тріскається й заварює себе акцентним швом:
   рівно те, що сторінка обіцяє під заголовком. Уся анімація живе в
   CSS (`.errors-cta-*` в index.css) — вона суто декоративна, і
   тягнути заради неї стан у React нема сенсу.

   Вся розмітка зламу схована від читачів екрана: людині, яка слухає
   сторінку, потрібен підпис кнопки, а не опис тріщини.
================================================================== */
function ErrorCta({ onClick, children, className = '' }) {
  const rest = `0 12px 30px -14px rgba(${T.accRgb},0.6), inset 0 1px 0 rgba(255,255,255,0.05)`;
  const hover = `0 18px 42px -14px rgba(${T.accRgb},0.85), 0 0 0 3px rgba(${T.accRgb},0.14)`;

  return (
    <Magnetic
      onClick={onClick}
      /* strength=0 — магніт вимкнено, лишається тільки стиск при
         натисканні. Той самий компонент, що на кнопках журналу й
         аналізів: головні дії застосунку мають однаково відгукуватись
         на палець. Тягнутись за курсором цій кнопці нема куди — вона
         стоїть у шапці сторінки. */
      strength={0}
      className={`errors-cta group relative inline-flex h-[46px] shrink-0 items-center justify-center gap-2.5 overflow-hidden whitespace-nowrap rounded-[13px] px-[22px] text-[14.5px] font-bold ${className}`}
      style={{
        fontFamily: T.sans,
        color: 'var(--edge-text)',
        background: 'linear-gradient(180deg, var(--edge-surface-hi, #18181C), var(--edge-sunken, #0D0D10))',
        border: `1px solid ${T.lineAcc}`,
        boxShadow: rest,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = hover;
        e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.55)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = rest;
        e.currentTarget.style.borderColor = T.lineAcc;
      }}
    >
      {/* Злам і шов.

          `preserveAspectRatio="none"` — щоб тріщина лягла по всій
          кнопці, а не лишила поля з боків. Від розтягування лінії
          рятує `vectorEffect`, а `pathLength="1"` робить довжину
          кожної одиничною, щоб малювати їх одним зсувом.

          Ламана виходить за краї полотна з обох боків навмисно: злам,
          що акуратно починається й закінчується всередині кнопки,
          читається як намальована загогулина, а не як тріщина
          наскрізь. */}
      <svg
        className="errors-cta-fracture"
        viewBox="0 0 220 46"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="errors-cta-crack"
          pathLength="1"
          d="M-6,24 L20,15 L29,30 L53,18 L63,32 L87,19 L97,33 L123,17 L133,31 L159,16 L171,29 L197,18 L226,25"
          fill="none"
          strokeWidth="1.6"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Відгалуження — те, що відрізняє тріщину від зигзага.
            Окремою групою, щоб nth-of-type у CSS рахував саме їх, а
            не всі лінії поспіль. */}
        <g>
          <path className="errors-cta-crack errors-cta-branch" pathLength="1" d="M29,30 L22,42" fill="none" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <path className="errors-cta-crack errors-cta-branch" pathLength="1" d="M53,18 L47,5" fill="none" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <path className="errors-cta-crack errors-cta-branch" pathLength="1" d="M97,33 L105,45" fill="none" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <path className="errors-cta-crack errors-cta-branch" pathLength="1" d="M171,29 L164,41" fill="none" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </g>

        {/* Шов іде тим самим шляхом, що й основний злам — тому й
            видно, що він саме заварює його, а не малює щось поруч. */}
        <path
          className="errors-cta-seam"
          pathLength="1"
          d="M-6,24 L20,15 L29,30 L53,18 L63,32 L87,19 L97,33 L123,17 L133,31 L159,16 L171,29 L197,18 L226,25"
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Іскри — на зламах ламаної, тобто там, де метал опирався б
            найбільше. */}
        <g>
          <rect className="errors-cta-spark" x="27" y="28" width="4" height="4" rx="1" />
          <rect className="errors-cta-spark" x="61" y="30" width="4" height="4" rx="1" />
          <rect className="errors-cta-spark" x="95" y="31" width="4" height="4" rx="1" />
          <rect className="errors-cta-spark" x="131" y="29" width="4" height="4" rx="1" />
          <rect className="errors-cta-spark" x="169" y="27" width="4" height="4" rx="1" />
        </g>
      </svg>

      <span className="errors-cta-row inline-flex items-center gap-2.5">
        {/* Дві сторони одного значка: «увага» і «під захистом». Це і
            є весь шлях запису на цій сторінці, згорнутий в один
            оберт. */}
        <span className="errors-cta-ico" aria-hidden="true">
          <span className="errors-cta-ico-face">
            <AlertTriangle size={17} strokeWidth={2.6} style={{ color: 'var(--edge-bad)' }} />
          </span>
          <span className="errors-cta-ico-face errors-cta-ico-back">
            <ShieldCheck size={17} strokeWidth={2.6} style={{ color: T.acc }} />
          </span>
        </span>

        {/* Підпис у двох копіях: верхня половина літер і нижня. Під
            курсором вони розʼїжджаються по тріщині й сходяться назад,
            коли шов доганяє.

            Друга копія схована від читачів екрана — вона тут суто
            заради розрізу, і озвучувати підпис двічі не треба. */}
        <span className="errors-cta-text">
          <span className="errors-cta-text-top">{children}</span>
          <span className="errors-cta-text-bottom" aria-hidden="true">{children}</span>
        </span>
      </span>
    </Magnetic>
  );
}

export default function ErrorLog() {
  useEdgeFonts();
  const { user } = useAuth();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState(null);
  const [assetFilter, setAssetFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  
  const [selectedId, setSelectedId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  /* id запису, який зараз редагують. null — створюємо новий. */
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ pair: '', desc: '', tvLink: '', reasons: [], cats: [], shots: [] });

  /* Завантаження з бази. Заразом одноразово переносимо те, що
     лишилось у localStorage від старої версії сторінки. */
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

    (async () => {
      try {
        const cloud = await fetchErrors(user.id);
        if (!alive) return;

        const moved = await migrateLegacyErrors(user.id, cloud.length);
        if (!alive) return;

        setEntries(moved.length ? [...moved, ...cloud] : cloud);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setSelectedId(null); setComposerOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const numMap = useMemo(() => {
    const chrono = [...entries].sort((a, b) => a.date < b.date ? -1 : 1);
    const map = {};
    chrono.forEach((e, i) => map[e.id] = i + 1);
    return map;
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = entries.filter(e =>
      (!catFilter || (e.cats || []).includes(catFilter)) &&
      (assetFilter === 'all' || e.pair === assetFilter) &&
      (!q || e.pair.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q))
    );
    /* «Спочатку нерозібрані» — не примха сортування, а те, заради
       чого сторінку відкривають: розібрані записи вже зробили свою
       роботу, а решта чекає. Усередині групи все одно нові зверху. */
    const byDate = (a, b) => (String(a.date) < String(b.date) ? 1 : -1);
    if (sort === 'open') filtered.sort((a, b) => (a.resolved === b.resolved ? byDate(a, b) : a.resolved ? 1 : -1));
    else filtered.sort((a, b) => byDate(a, b) * (sort === 'newest' ? 1 : -1));
    return filtered;
  }, [entries, query, catFilter, assetFilter, sort]);

  const groupedEntries = useMemo(() => {
    const map = new Map();
    filteredEntries.forEach(e => {
      const key = String(e.date || '').slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return [...map.entries()].map(([key, items]) => {
      const [y, m] = key.split('-');
      return { label: `${MONTHS[parseInt(m, 10) - 1]} ${y}`, items };
    });
  }, [filteredEntries]);

  /* Записуємо оптимістично: людина щойно зафіксувала помилку, і
     чекати на мережу, щоб побачити власний запис, — знущання. Якщо
     база відмовила, запис прибираємо назад. */
  const handleSaveEntry = async () => {
    if (!user?.id) return;
    /* Актив більше не обовʼязковий: помилка «торгував без плану» не
       належить жодному інструменту. Обовʼязкові причина й опис —
       перевірку показує сам композер, сюди справа доходить уже
       заповненою. */
    if (!(form.reasons || []).length || form.desc.trim().length < 4) return;

    const reasons = form.reasons || [];

    /* Категорії виводимо тут, а не лишаємо порожніми до відповіді
       сервера: цей запис одразу лягає в список, і зведення зверху
       рахує по ньому теґи. Раніше тут стояв undefined — база потім
       підставляла категорії сама, але сторінка встигала впасти на
       записі без cats ще до того, як запит долітав. */
    const entry = {
      id: editingId || uid(),
      pair: form.pair.trim().toUpperCase(),
      /* Дату збереженого запису не переписуємо: правка тексту через
         тиждень не робить помилку сьогоднішньою. */
      date: editingId ? (entries.find((e) => e.id === editingId)?.date || todayISO()) : todayISO(),
      cats: form.cats?.length ? form.cats : catsFromReasons(reasons),
      desc: form.desc.trim(),
      tvLink: form.tvLink.trim() || undefined,
      shots: form.shots || [],
      reasons,
    };

    setEntries((list) => (editingId
      ? list.map((e) => (e.id === entry.id ? { ...e, ...entry } : e))
      : [entry, ...list]));
    setComposerOpen(false);
    setEditingId(null);
    setForm({ pair: '', desc: '', tvLink: '', reasons: [], cats: [], shots: [] });

    try {
      const saved = await saveError(user.id, entry);
      /* Сервер повертає запис зі своїм id і нормалізованими полями —
         міняємо локальний на нього, інакше видалення чи позначка
         «виправлено» пішли б у неіснуючий рядок. */
      if (saved?.id) {
        setEntries((list) => list.map((x) => (x.id === entry.id ? saved : x)));
      }
    } catch (e) {
      /* Запис зникав мовчки: помилку бачила тільки консоль, а людина —
         як щойно створена картка розчиняється без пояснень. Тепер
         причина видно на екрані, а текст помилки бази йде разом із
         нею: без нього «не збереглось» нічим не допомагає. */
      console.error('saveError', e);
      if (!editingId) setEntries((list) => list.filter((x) => x.id !== entry.id));
      notify.error(
        'Помилку не збережено',
        e?.message || e?.details || 'База не прийняла запис.',
      );
      /* Форму повертаємо як була — інакше текст, який людина щойно
         набрала, доводиться писати вдруге. */
      setForm({
        pair: entry.pair,
        desc: entry.desc,
        tvLink: entry.tvLink || '',
        reasons: entry.reasons,
        cats: entry.cats || [],
        shots: entry.shots || [],
      });
      setComposerOpen(true);
    }
  };

  const handleDelete = async (id) => {
    if (!user?.id) return;
    const backup = entries;

    setEntries((list) => list.filter((e) => e.id !== id));
    setSelectedId(null);

    try {
      await removeError(user.id, id);
    } catch (e) {
      console.error(e);
      setEntries(backup);
    }
  };

  /* Розібрано / повернути в роботу. Стан оптимістичний: людина
     клацає це підряд, перебираючи стрічку, і чекати на мережу після
     кожного запису означало б зробити перебір повільнішим за саме
     читання. */
  const handleResolve = async (entry) => {
    if (!user?.id) return;
    const next = !entry.resolved;
    const backup = entries;

    setEntries((list) => list.map((e) => (e.id === entry.id ? { ...e, resolved: next } : e)));

    try {
      await setErrorResolved(user.id, entry.id, next);
    } catch (e) {
      console.error(e);
      setEntries(backup);
    }
  };

  const selectedEntry = selectedId ? entries.find(e => e.id === selectedId) : null;

  /* Перегортання йде по тому ж порядку, що й на екрані: людина
     бачила стрічку саме такою, і «наступна» має означати ту, що
     була нижче, а не наступну за датою в базі. */
  const flat = useMemo(() => groupedEntries.flatMap((g) => g.items), [groupedEntries]);
  const pos = flat.findIndex((e) => e.id === selectedId);
  const goPrev = pos > 0 ? () => setSelectedId(flat[pos - 1].id) : undefined;
  const goNext = pos >= 0 && pos < flat.length - 1 ? () => setSelectedId(flat[pos + 1].id) : undefined;

  const openEdit = (entry) => {
    setForm({
      pair: entry.pair || '',
      desc: entry.desc || '',
      tvLink: entry.tvLink || '',
      reasons: entry.reasons || [],
      cats: entry.cats || [],
      shots: entry.shots || [],
    });
    setEditingId(entry.id);
    setSelectedId(null);
    setComposerOpen(true);
  };

  /* «Схожі помилки»: закриваємо вікно і накидаємо той самий фільтр,
     який людина поставила б руками — щоб далі можна було гортати
     список звичним способом. */
  const showSimilar = (catId) => {
    if (!catId) return;
    setSelectedId(null);
    setCatFilter(catId);
    setAssetFilter('all');
    setQuery('');
    setSort('newest');
  };
  const openCount = entries.filter((e) => !e.resolved).length;

  return (
    <div className="relative min-h-full">

      <style>{`
        .error-input:focus { border-color: rgba(139,123,255,.45) !important; }
        .error-input-dashed:focus { border-color: rgba(139,123,255,.5) !important; }
        .error-btn-outline:hover { border-color: ${T.lineHi} !important; color: ${T.text} !important; }
        .error-btn-action:hover { border-color: ${T.lineHi} !important; color: ${T.text} !important; }
        .error-btn-action-danger:hover { border-color: rgba(248,113,113,.5) !important; color: ${T.bad} !important; background: rgba(248,113,113,.08) !important; }
        .error-chip:hover { border-color: ${T.lineHi} !important; }
        .error-btn-save:hover { box-shadow: 0 10px 34px rgba(139,123,255,.3) !important; }
        .error-tv-link:hover { color: ${T.acc} !important; }
        .pulse-dot { animation: pulseDot 2.4s ease infinite; }
        @keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>

      {/* 1800, як у Аналітики й Бектесту.

          Було 1180 — вужче за решту розділів, і на широкому екрані
          сторінка стояла вузькою колонкою посеред порожнечі. Помилки
          читають списком і порівнюють між собою, тож вузька колонка
          тут шкодить удвічі: у рядок влазить менше, а прокручувати
          доводиться більше. */}
      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 lg:pt-8">

        {/* ─────────── Шапка ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-7 flex flex-wrap items-start justify-between gap-8"
        >
          <div className="min-w-0 max-w-[640px]">
            <div className="flex items-center gap-[9px]">
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: 'var(--edge-acc)', boxShadow: `0 0 12px 2px rgba(${T.accRgb},0.67)` }}
              />
              <span
                className="text-[11px] font-bold uppercase"
                style={{ fontFamily: T.mono, letterSpacing: '2.6px', color: 'var(--edge-acc)' }}
              >
                Дисципліна
              </span>
            </div>

            <h1
              className="mt-3 text-[32px] font-bold sm:text-[40px] lg:text-[48px]"
              style={{
                fontFamily: T.display,
                letterSpacing: '-1.9px',
                lineHeight: 1,
                backgroundImage: `linear-gradient(170deg, ${T.text} 34%, ${T.text3})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Журнал помилок
            </h1>

            <p className="mt-3.5 text-[15.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)', lineHeight: 1.55 }}>
              Помилка, яку записано й розібрано, — єдина, що не повторюється.
            </p>

            {/* Цифра нерозібраних — єдине, що перетворює цю сторінку
                з архіву на список справ. Показуємо лише коли є що
                розбирати: нуль тут не мотивує, а дорікає. */}
            {openCount > 0 && (
              <button
                onClick={() => setSort('open')}
                className="mt-4 inline-flex h-9 items-center gap-2.5 rounded-xl px-3.5 text-[13.5px] font-semibold"
                style={{
                  fontFamily: T.sans,
                  color: 'var(--edge-warn)',
                  background: 'linear-gradient(90deg,rgba(var(--edge-warn-rgb),0.10),rgba(var(--edge-hair-rgb),0.02))',
                  border: '1px solid rgba(var(--edge-warn-rgb),0.27)',
                  transition: 'all .16s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(var(--edge-warn-rgb),0.55)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(var(--edge-warn-rgb),0.27)'; }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--edge-warn)', boxShadow: '0 0 10px 2px rgba(var(--edge-warn-rgb),0.80)' }}
                />
                {openCount} {openCount === 1 ? 'запис чекає' : 'записів чекають'} на розбір
              </button>
            )}
          </div>

          <ErrorCta onClick={() => setComposerOpen(true)}>
            Зафіксувати помилку
          </ErrorCta>
        </motion.div>

        <ErrorStats entries={entries} />
        
        <ErrorFilters entries={entries} query={query} setQuery={setQuery} assetFilter={assetFilter} setAsset={setAssetFilter} sort={sort} setSort={setSort} catFilter={catFilter} setCatFilter={setCatFilter} />

        {/* Три різні порожнечі, і плутати їх не можна: «ще вантажимо»,
            «ти сюди ще нічого не писав» і «фільтри нічого не знайшли».
            Одна заглушка на всі три щоразу бреше у двох випадках. */}
        {loading ? (
          <div
            className="flex items-center justify-center gap-2.5 rounded-2xl px-5 py-24"
            style={{ border: `1px dashed ${T.line}` }}
          >
            <Loader2 size={16} className="animate-spin" style={{ color: T.text4 }} />
            <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Дістаємо твої записи
            </span>
          </div>
        ) : entries.length === 0 ? (
          /* Порожній журнал — не помилка і не поламаний стан, а
             запрошення. Тому блок носить колір головної дії
             сторінки, а не сірий пунктир «тут нічого немає». */
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="relative flex flex-col items-center overflow-hidden rounded-[20px] px-6 py-16 text-center"
            style={{
              background: `linear-gradient(160deg, rgba(${T.accRgb},0.14), var(--edge-sunken) 52%, var(--edge-sunken))`,
              border: `1px solid rgba(${T.accRgb},0.32)`,
              boxShadow: `0 28px 60px -34px rgba(${T.accRgb},0.6)`,
            }}
          >
            <span
              className="pointer-events-none absolute rounded-full"
              style={{ left: '50%', top: -120, width: 420, height: 260, marginLeft: -210, background: T.acc, filter: 'blur(80px)', opacity: 0.18 }}
            />
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg,transparent,rgba(${T.accRgb},0.8),transparent)` }}
            />

            <span
              className="relative grid h-14 w-14 place-items-center rounded-[18px]"
              style={{
                background: `rgba(${T.accRgb},0.16)`,
                border: `1px solid rgba(${T.accRgb},0.4)`,
                color: 'var(--edge-acc)',
              }}
            >
              <Plus size={24} strokeWidth={2.4} />
            </span>

            <div className="relative mt-5 text-[23px] font-bold" style={{ fontFamily: T.display, color: 'var(--edge-text)', letterSpacing: '-0.6px' }}>
              Тут поки порожньо
            </div>
            <p className="relative mt-3 max-w-[430px] text-[15px]" style={{ fontFamily: T.sans, color: 'var(--edge-text2)', lineHeight: 1.65 }}>
              Перший запис завжди найважчий — і саме він найцінніший.
              Зафіксуй помилку, поки памʼятаєш, що саме відчував.
            </p>

            <ErrorCta onClick={() => setComposerOpen(true)} className="mt-6">
              Зафіксувати першу
            </ErrorCta>
          </motion.div>
        ) : filteredEntries.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col items-center justify-center rounded-[20px] px-6 py-14 text-center"
            style={{ border: '1.5px dashed var(--edge-line)', background: 'rgba(var(--edge-hair-rgb),0.015)' }}
          >
            <span
              className="grid h-12 w-12 place-items-center rounded-[15px]"
              style={{ background: 'rgba(var(--edge-hair-rgb),0.04)', border: '1px solid var(--edge-line)', color: 'var(--edge-text3)' }}
            >
              <Search size={20} strokeWidth={1.8} />
            </span>
            <div className="mt-3.5 text-[16px] font-semibold" style={{ fontFamily: T.display, color: 'var(--edge-text2)' }}>
              Нічого не знайшлось
            </div>
            <p className="mt-1.5 text-[13.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>
              Спробуй інший запит або скинь фільтри
            </p>
            <button
              onClick={() => { setQuery(''); setCatFilter(null); setAssetFilter('all'); }}
              className="mt-5 h-10 rounded-xl px-4 text-[13.5px] font-semibold"
              style={{ background: 'rgba(var(--edge-hair-rgb),0.04)', border: '1px solid var(--edge-line)', color: 'var(--edge-text2)', fontFamily: T.sans, transition: 'all .16s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.5)`; e.currentTarget.style.color = 'var(--edge-text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--edge-line)'; e.currentTarget.style.color = 'var(--edge-text2)'; }}
            >
              Скинути фільтри
            </button>
          </motion.div>
        ) : (
          <ErrorGrid groups={groupedEntries} onOpenCard={e => setSelectedId(e.id)} />
        )}
      </div>

      <ErrorDetailDrawer
        selected={selectedEntry}
        numMap={numMap}
        entries={entries}
        onClose={() => setSelectedId(null)}
        onDelete={handleDelete}
        onResolve={handleResolve}
        onEdit={openEdit}
        onSimilar={showSimilar}
        onPrev={goPrev}
        onNext={goNext}
      />
      
      <ErrorComposerModal isOpen={composerOpen} onClose={() => { setComposerOpen(false); setEditingId(null); }} form={form} setForm={setForm} onSave={handleSaveEntry} />
    </div>
  );
}