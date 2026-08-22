import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2 } from 'lucide-react';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { useAuth } from '../context/AuthContext';
import {
  fetchErrors, saveError, removeError, setErrorResolved, migrateLegacyErrors, uid, todayISO,
} from '../lib/errorsStore';
import { MONTHS } from '../components/errors/utils';
import ErrorStats from '../components/errors/ErrorStats';
import ErrorFilters from '../components/errors/ErrorFilters';
import ErrorGrid from '../components/errors/ErrorGrid';
import ErrorDetailDrawer from '../components/errors/ErrorDetailDrawer';
import ErrorComposerModal from '../components/errors/ErrorComposerModal';

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
  const [form, setForm] = useState({ pair: '', desc: '', tvLink: '', reasons: [], cats: [] });

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
      (!catFilter || e.cats.includes(catFilter)) &&
      (assetFilter === 'all' || e.pair === assetFilter) &&
      (!q || e.pair.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q))
    );
    filtered.sort((a, b) => (a.date < b.date ? 1 : -1) * (sort === 'newest' ? 1 : -1));
    return filtered;
  }, [entries, query, catFilter, assetFilter, sort]);

  const groupedEntries = useMemo(() => {
    const map = new Map();
    filteredEntries.forEach(e => {
      const key = e.date.slice(0, 7);
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

    const entry = {
      id: uid(),
      pair: form.pair.trim().toUpperCase(),
      date: todayISO(),
      cats: form.cats?.length ? form.cats : undefined,
      desc: form.desc.trim(),
      tvLink: form.tvLink.trim() || undefined,
      reasons: form.reasons || [],

    };

    setEntries((list) => [entry, ...list]);
    setComposerOpen(false);
    setForm({ pair: '', desc: '', tvLink: '', reasons: [], cats: [] });

    try {
      await saveError(user.id, entry);
    } catch (e) {
      console.error(e);
      setEntries((list) => list.filter((x) => x.id !== entry.id));
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
  const recentPairs = [...new Set(entries.map(e => e.pair))].slice(0, 5);
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

      <div className="relative z-10 mx-auto w-full max-w-[1700px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pt-7">

        {/* ─────────── Шапка ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Дисципліна
            </div>
            <h1
              className="text-[26px] font-bold leading-none sm:text-[34px] lg:text-[42px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Журнал помилок
            </h1>
            <p className="mt-2.5 max-w-[560px] text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Помилка, яку записано й розібрано, — єдина, що не повторюється.
            </p>

            {/* Цифра нерозібраних — єдине, що перетворює цю сторінку
                з архіву на список справ. Показуємо лише коли є що
                розбирати: нуль тут не мотивує, а дорікає. */}
            {openCount > 0 && (
              <div
                className="mt-3.5 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold"
                style={{
                  fontFamily: T.sans, color: T.acc,
                  background: `rgba(${T.accRgb},0.10)`, border: `1px solid rgba(${T.accRgb},0.24)`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.acc }} />
                {openCount} {openCount === 1 ? 'запис чекає' : 'записів чекають'} на розбір
              </div>
            )}
          </div>

          <button
            onClick={() => setComposerOpen(true)}
            className="group inline-flex h-[46px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            style={{
              background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
              boxShadow: `0 6px 18px -8px rgba(${T.accRgb},0.6)`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`)}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`)}
          >
            <Plus size={17} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />
            Зафіксувати помилку
          </button>
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
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col items-center rounded-2xl px-5 py-24 text-center"
            style={{ border: `1px dashed ${T.line}` }}
          >
            <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
              Тут поки порожньо
            </div>
            <p className="mb-6 max-w-[420px] text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
              Перший запис завжди найважчий — і саме він найцінніший.
              Зафіксуй помилку, поки памʼятаєш, що саме відчував.
            </p>
            <button
              onClick={() => setComposerOpen(true)}
              className="h-11 rounded-xl px-5 text-[14px] font-bold transition-colors duration-200"
              style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
            >
              Зафіксувати першу
            </button>
          </motion.div>
        ) : filteredEntries.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col items-center rounded-2xl px-5 py-24 text-center"
            style={{ border: `1px dashed ${T.line}` }}
          >
            <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
              Нічого не знайшлось
            </div>
            <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Спробуй інші слова або скинь фільтри.
            </p>
            <button
              onClick={() => { setQuery(''); setCatFilter(null); setAssetFilter('all'); }}
              className="h-11 rounded-xl px-5 text-[14px] font-semibold transition-colors duration-200"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              Скинути фільтри
            </button>
          </motion.div>
        ) : (
          <ErrorGrid groups={groupedEntries} numMap={numMap} onOpenCard={e => setSelectedId(e.id)} />
        )}
      </div>

      <ErrorDetailDrawer selected={selectedEntry} numMap={numMap} onClose={() => setSelectedId(null)} onDelete={handleDelete} onResolve={handleResolve} />
      
      <ErrorComposerModal isOpen={composerOpen} onClose={() => setComposerOpen(false)} form={form} setForm={setForm} recentPairs={recentPairs} onSave={handleSaveEntry} />
    </div>
  );
}