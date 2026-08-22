import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Star, Search, Check, Sunrise, Repeat, Layers, Loader2 } from 'lucide-react';
import AssetIcon from '../ui/AssetIcon';
import { useAuth } from '../../context/AuthContext';
import { loadTodayPairs, loadFrequentPairs, localDay } from '../../lib/planAssets';
import { T, EASE, SPRING } from './planTheme';

/* ==================================================================
   Перемикач активів на лівій рейці.
   Згорнутий — одна кнопка з логотипом поточного активу.
   Розгорнутий — панель з обраними, недавніми і повним пошуком.
   Перемикання не перезавантажує сторінку — просто змінює роут плану.
================================================================== */

const RECENT_KEY = 'plan_recent_assets_v1';

export function pushRecentAsset(symbol) {
  if (!symbol) return;
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const next = [symbol, ...prev.filter((s) => s !== symbol)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

/* Один рядок активу */
function AssetRow({ asset, active, onPick, isFav, onToggleFav }) {
  return (
    <motion.button
      onClick={() => onPick(asset)}
      whileTap={{ scale: 0.985 }}
      transition={SPRING}
      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150"
      style={{ background: active ? T.surfaceHi : 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceHi)}
      onMouseLeave={(e) => (e.currentTarget.style.background = active ? T.surfaceHi : 'transparent')}
    >
      <span className="grid w-9 shrink-0 place-items-center">
        <AssetIcon symbol={asset.symbol} category={asset.category} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[15px] font-semibold"
          style={{ fontFamily: T.sans, color: active ? T.acc : T.text }}
        >
          {asset.symbol}
        </span>
        {(asset.note || asset.category) && (
          <span className="block truncate text-[12px] font-medium" style={{ color: T.text4 }}>
            {asset.note || asset.category}
          </span>
        )}
      </span>

      {active && <Check size={14} strokeWidth={3} className="shrink-0" style={{ color: T.acc }} />}

      {onToggleFav && !active && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => onToggleFav(e, asset.symbol)}
          onKeyDown={(e) => e.key === 'Enter' && onToggleFav(e, asset.symbol)}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: isFav ? T.warn : T.text4 }}
        >
          <Star size={13} strokeWidth={2.4} fill={isFav ? T.warn : 'none'} />
        </span>
      )}
    </motion.button>
  );
}

function Group({ icon: Icon, label, hint, children }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2">
        <Icon size={10} strokeWidth={2.6} style={{ color: T.text4 }} />
        <span
          className="text-[12px] font-bold uppercase tracking-[0.18em]"
          style={{ fontFamily: T.sans, color: T.text4 }}
        >
          {label}
        </span>
        {hint && (
          <span className="ml-auto text-[11.5px] font-medium" style={{ fontFamily: T.sans, color: T.text4 }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function AssetSwitcher({
  currentPair,
  flatAssets = [],
  favorites = [],
  onPick,
  onToggleFavorite,
  onOpenFullSearch,
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  /* Історія роботи з бази: що вже писав сьогодні і що пишеш регулярно */
  const [todayPairs, setTodayPairs] = useState([]);
  const [frequent, setFrequent] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user?.id) return;
    let alive = true;
    setLoading(true);
    Promise.all([loadTodayPairs(user.id), loadFrequentPairs(user.id)])
      .then(([t, f]) => {
        if (!alive) return;
        setTodayPairs(t);
        setFrequent(f);
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [open, user?.id, currentPair]);

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 180);
    else setQuery('');
  }, [open]);

  const byName = useMemo(() => {
    const map = new Map();
    flatAssets.forEach((a) => map.set(a.symbol, a));
    return map;
  }, [flatAssets]);

  const current = byName.get(currentPair) || (currentPair ? { symbol: currentPair } : null);

  /* Сьогоднішні — крім того, що відкритий зараз */
  const todayList = useMemo(
    () => todayPairs
      .filter((p) => p !== currentPair)
      .map((p) => ({ ...(byName.get(p) || { symbol: p }), note: 'план на сьогодні' })),
    [todayPairs, byName, currentPair],
  );

  /* Часті — крім поточного й тих, що вже в сьогоднішніх */
  const frequentList = useMemo(
    () => frequent
      .filter((f) => f.symbol !== currentPair && !todayPairs.includes(f.symbol))
      .slice(0, 6)
      .map((f) => ({
        ...(byName.get(f.symbol) || { symbol: f.symbol }),
        note: `${f.count} ${f.count === 1 ? 'план' : f.count < 5 ? 'плани' : 'планів'}`,
      })),
    [frequent, byName, currentPair, todayPairs],
  );

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return flatAssets
      .filter((a) => a.symbol.toUpperCase().includes(q))
      .slice(0, 12);
  }, [query, flatAssets]);

  /* Вибір із «Сьогодні» веде саме в сьогоднішній план цього активу,
     навіть якщо зараз відкритий план за іншу дату. Інакше замість
     написаного відкривався б порожній бланк на чужий день. */
  const pick = (asset, date) => {
    setOpen(false);
    pushRecentAsset(asset.symbol);
    onPick(asset.symbol, date);
  };

  return (
    <div ref={ref} className="relative">
      {/* Тригер */}
      <button
        onClick={() => setOpen(!open)}
        className="group relative flex items-center"
        title="Перемкнути актив"
      >
        <span
          className="relative grid h-11 w-11 place-items-center rounded-xl transition-all duration-200"
          style={{
            background: open ? T.surfaceHi : 'transparent',
            border: `1px solid ${open ? T.lineHi : 'transparent'}`,
          }}
          onMouseEnter={(e) => !open && (e.currentTarget.style.background = T.surfaceHi)}
          onMouseLeave={(e) => !open && (e.currentTarget.style.background = 'transparent')}
        >
          {current ? (
            <AssetIcon symbol={current.symbol} category={current.category} />
          ) : (
            <Layers size={16} strokeWidth={2.2} style={{ color: T.text3 }} />
          )}

          {/* стрілка-індикатор */}
          <motion.span
            className="absolute -right-0.5 top-1/2 -translate-y-1/2"
            animate={{ rotate: open ? 90 : 0, opacity: open ? 1 : 0.5 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            <ChevronRight size={10} strokeWidth={3} style={{ color: open ? T.acc : T.text4 }} />
          </motion.span>
        </span>

        {!open && (
          <span
            className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg px-3 py-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 12px 30px rgba(0,0,0,0.6)' }}
          >
            <span className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
              {currentPair || 'Вибрати актив'}
            </span>
          </span>
        )}
      </button>

      {/* Панель */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -10, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.97 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="absolute left-[calc(100%+12px)] top-1/2 z-50 w-[286px] origin-left -translate-y-1/2 overflow-hidden rounded-2xl"
            style={{
              background: 'rgba(13,13,16,0.97)',
              backdropFilter: 'blur(24px)',
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 30px 70px rgba(0,0,0,0.8)',
            }}
          >
            {/* Пошук */}
            <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Search size={14} strokeWidth={2.4} style={{ color: T.text4 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук активу..."
                spellCheck={false}
                className="w-full border-none bg-transparent outline-none"
                style={{ fontFamily: T.sans, fontSize: 13, color: T.text }}
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-[12px] font-semibold" style={{ color: T.text4, fontFamily: T.sans }}>
                  ESC
                </button>
              )}
            </div>

            <div className="max-h-[420px] overflow-y-auto p-1.5 custom-scrollbar">
              {query ? (
                results.length ? (
                  <Group icon={Search} label={`Знайдено ${results.length}`}>
                    {results.map((a) => (
                      <AssetRow
                        key={a.symbol}
                        asset={a}
                        active={a.symbol === currentPair}
                        onPick={pick}
                        isFav={favorites.includes(a.symbol)}
                        onToggleFav={onToggleFavorite}
                      />
                    ))}
                  </Group>
                ) : (
                  <div className="px-3 py-8 text-center">
                    <span className="text-[14px] font-medium" style={{ color: T.text4 }}>
                      Нічого не знайшлось
                    </span>
                  </div>
                )
              ) : (
                <>
                  {current && (
                    <Group icon={Check} label="Зараз">
                      <AssetRow asset={current} active onPick={() => setOpen(false)} />
                    </Group>
                  )}

                  {todayList.length > 0 && (
                    <Group icon={Sunrise} label="Сьогодні" hint={`${todayList.length + (current ? 1 : 0)} плани`}>
                      {todayList.map((a) => (
                        <AssetRow
                          key={a.symbol}
                          asset={a}
                          onPick={(x) => pick(x, localDay())}
                          isFav={favorites.includes(a.symbol)}
                          onToggleFav={onToggleFavorite}
                        />
                      ))}
                    </Group>
                  )}

                  {frequentList.length > 0 && (
                    <Group icon={Repeat} label="Часто пишеш">
                      {frequentList.map((a) => (
                        <AssetRow
                          key={a.symbol}
                          asset={a}
                          onPick={pick}
                          isFav={favorites.includes(a.symbol)}
                          onToggleFav={onToggleFavorite}
                        />
                      ))}
                    </Group>
                  )}

                  {loading && !todayList.length && !frequentList.length && (
                    <div className="flex items-center justify-center gap-2 px-3 py-8">
                      <Loader2 size={14} className="animate-spin" style={{ color: T.text4 }} />
                      <span className="text-[13.5px]" style={{ color: T.text4, fontFamily: T.sans }}>
                        дивлюсь історію планів…
                      </span>
                    </div>
                  )}

                  {!loading && !current && !todayList.length && !frequentList.length && (
                    <div className="px-3 py-8 text-center">
                      <span className="text-[14px] font-medium leading-relaxed" style={{ color: T.text4 }}>
                        Тут зʼявляться активи, по яких ти пишеш плани.<br />
                        Почни вводити символ або відкрий каталог.
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Повний каталог */}
            <button
              onClick={() => { setOpen(false); onOpenFullSearch?.(); }}
              className="flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold transition-colors duration-150"
              style={{ borderTop: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; }}
            >
              <Layers size={12} strokeWidth={2.4} />
              Повний каталог активів
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
