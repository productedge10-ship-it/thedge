import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import {
  Target, BookOpen, ClipboardCheck, CheckSquare, Calculator, FileText,
  BrainCircuit, History, NotebookPen, BarChart2, Users, AlertTriangle,
  Activity, ArrowRight, Loader2, Check, Circle,
  SlidersHorizontal, Eye, EyeOff, GripVertical, RotateCcw, Plus,
  Minimize2, Maximize2,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import useCloudState from '../hooks/useCloudState';
import { loadHubState, daysSince, greeting } from '../lib/hubData';
import { DEFAULT_LAYOUT, normalizeLayout, move } from '../lib/launchpad';
import { goalById } from '../lib/settings';
import useTerminalSkin from '../hooks/useTerminalSkin';


/* ==================================================================
   Стартова сторінка.

   Не вітрина можливостей, а відповідь на питання «що зараз робити».
   Тому згори — стан дня з живими цифрами, а плитки розділів
   згруповані за тим, у якому порядку трейдер їх реально відкриває:
   спершу підготовка, потім робота, потім розбір.
================================================================== */

/* У кожної плитки свій відтінок світла. Фіолетовий на всьому підряд
   перетворював сітку на суцільну пляму — тепер розділ упізнається
   за кольором, а не тільки за іконкою. Кольори приглушені, щоб на
   чорному вони світились, а не кричали. */
const HUE = {
  ice:    '110,168,254',
  mint:   '79,209,197',
  violet: '167,139,250',
  amber:  '251,191,36',
  rose:   '251,113,133',
  lime:   '163,230,53',
  sky:    '56,189,248',
  peach:  '251,146,60',
};

/* Одна пружина на всі рухи розкладки. Підбирали не за красою кривої,
   а за відчуттям: плитка має доїхати за один погляд і зупинитись без
   гойдання. Тому висока жорсткість, майже критичне гасіння і легка
   «вага» — рух виглядає коротким, але не різким. */
const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 };

/* ==================================================================
   Геометрія сітки.

   CSS-сітка тут програла. Поки плитки просто лежать, вона ідеальна,
   але щойно одну з них починають тягнути, браузер міняє її місце в
   потоці — а анімація в цей момент рахує зміщення від старого місця.
   Звідси й стрибки: елемент і потік сперечаються, хто головний.

   Тому в режимі розкладки сітки як такої немає. Є координати, які ми
   рахуємо самі, і пружини, які до них їдуть. Плитка ніколи не змінює
   місця в потоці — рухається тільки її transform, і рухається саме
   так, як ми сказали. Рівно ця модель стоїть за іконками на телефоні.
================================================================== */

const GAP = 14;   /* той самий проміжок, що був у gap-3.5 */
const ROW = 164;  /* висота плитки: фіксована, інакше рядки «дихають» */

const colsFor = (w) => (w < 640 ? 1 : w < 1180 ? 2 : 4);

/* Щільна укладка: кожна плитка сідає в перше вільне місце, куди
   влазить по ширині. Якщо широка не вміщається в хвіст рядка, дірку
   закриє наступна вузька — порожнього місця не лишається. */
function pack(ids, widthOf, cols, cellW) {
  const grid = [];
  const busy = (r, c) => (grid[r] ? grid[r][c] : false);
  const take = (r, c) => { grid[r] = grid[r] || Array(cols).fill(false); grid[r][c] = true; };

  const slots = {};
  let last = 0;

  ids.forEach((id) => {
    const w = Math.min(widthOf(id), cols);

    for (let r = 0; ; r += 1) {
      let placed = false;
      for (let c = 0; c + w <= cols; c += 1) {
        let free = true;
        for (let k = 0; k < w; k += 1) if (busy(r, c + k)) { free = false; break; }
        if (!free) continue;

        for (let k = 0; k < w; k += 1) take(r, c + k);
        slots[id] = {
          x: c * (cellW + GAP),
          y: r * (ROW + GAP),
          w: w * cellW + (w - 1) * GAP,
          r,
          c,
          span: w,
        };
        last = Math.max(last, r);
        placed = true;
        break;
      }
      if (placed) break;
    }
  });

  return { slots, height: (last + 1) * (ROW + GAP) - GAP };
}

/* ---------- одна комірка ----------
   Координати живуть у motion-значеннях, а не в React-стані: пружина
   крутиться в composited-потоці й не тягне за собою жодного рендера.
   Поки плитку тягнуть, значеннями керує жест — ми в них не лізимо,
   тому боротьби за одні й ті самі числа не виникає. */
function Slot({ slot, dragging, drag, bounds, onStart, onMove, onEnd, children }) {
  const x = useMotionValue(slot.x);
  const y = useMotionValue(slot.y);
  const w = useMotionValue(slot.w);
  const first = useRef(true);

  useEffect(() => {
    /* перший кадр — просто стати на місце, без польоту з нуля */
    if (first.current) {
      first.current = false;
      x.set(slot.x); y.set(slot.y); w.set(slot.w);
      return undefined;
    }
    /* поки тягнуть — значеннями керує жест, ми в них не лізимо */
    if (dragging) return undefined;

    const a = animate(x, slot.x, SPRING);
    const b = animate(y, slot.y, SPRING);
    const c = animate(w, slot.w, SPRING);
    return () => { a.stop(); b.stop(); c.stop(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [slot.x, slot.y, slot.w, dragging]);

  return (
    <motion.div
      drag={drag}
      /* межі — щоб плитку не можна було віднести за екран */
      dragConstraints={bounds}
      dragMomentum={false}
      dragElastic={0}
      onDragStart={onStart}
      onDrag={onMove}
      onDragEnd={onEnd}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        x,
        y,
        width: w,
        height: ROW,
        zIndex: dragging ? 30 : 1,
        filter: dragging ? 'drop-shadow(0 22px 44px rgba(0,0,0,0.55))' : 'none',
      }}
    >
      {children}
    </motion.div>
  );
}

/* Плитки. Кожна знає, як дістати свій підпис зі стану дня —
   так дані не розповзаються по компонентах. */
const SECTIONS = [
  {
    group: 'Перед сесією',
    hint: 'Підготуватись, поки ринок ще не відкрився',
    items: [
      {
        to: '/plan', icon: Target, title: 'Trading Plan', hue: HUE.ice,
        text: 'Розписати день по таймфреймах і визначити bias',
        badge: (s) => (s.plansToday ? `${s.plansToday} на сьогодні` : 'ще не створений'),
        alert: (s) => !s.plansToday,
        big: true,
        resize: true,
      },
      {
        to: '/checklist', icon: ClipboardCheck, title: 'Чекліст входу', hue: HUE.mint,
        text: 'Пройтись по своїх правилах перед позицією',
      },
      {
        to: '/calculator', icon: Calculator, title: 'Калькулятор', hue: HUE.sky,
        text: 'Порахувати обсяг під ризик',
      },
      {
        to: '/system', icon: NotebookPen, title: 'Торгова система', hue: HUE.violet,
        text: 'Правила, за якими ти торгуєш',
      },
    ],
  },
  {
    group: 'Під час і після',
    hint: 'Зафіксувати те, що сталось, поки памʼятаєш',
    items: [
      {
        to: '/journal', icon: BookOpen, title: 'Журнал угод', hue: HUE.lime,
        text: 'Записати угоду разом із розбором себе',
        badge: (s) => (s.tradesWeek ? `${s.tradesWeek} за тиждень` : 'порожньо за тиждень'),
        big: true,
        resize: true,
      },
      {
        to: '/todo', icon: CheckSquare, title: 'Завдання', hue: HUE.amber,
        text: 'Список, матриця, помодоро',
        badge: (s) => (s.tasksOverdue
          ? `${s.tasksOverdue} прострочено`
          : s.tasksToday ? `${s.tasksToday} на сьогодні` : null),
        alert: (s) => s.tasksOverdue > 0,
      },
      {
        to: '/error', icon: AlertTriangle, title: 'Журнал помилок', hue: HUE.rose,
        text: 'Що зламалось і скільки це коштувало',
        badge: (s) => (s.mistakesWeek ? `${s.mistakesWeek} за тиждень` : null),
        alert: (s) => s.mistakesWeek > 0,
      },
      {
        to: '/notes', icon: FileText, title: 'Нотатки', hue: HUE.peach,
        text: 'Думки, ідеї, спостереження',
      },
    ],
  },
  {
    group: 'Розібратись',
    hint: 'Побачити закономірність, а не окрему угоду',
    items: [
      {
        to: '/reviews', icon: BrainCircuit, title: 'Розбори', hue: HUE.violet,
        text: 'Зібрати тиждень і вирішити, що змінити',
        badge: (s) => {
          const n = daysSince(s.lastReviewTo);
          if (n === null) return 'ще жодного';
          return n <= 1 ? 'свіжий' : `${n} днів тому`;
        },
        alert: (s) => {
          const n = daysSince(s.lastReviewTo);
          return n === null || n > 7;
        },
        big: true,
        resize: true,
      },
      {
        to: '/analytics', icon: BarChart2, title: 'Аналітика', hue: HUE.ice,
        text: 'Статистика по сесіях, активах і психології',
        resize: true,
      },
      {
        to: '/analyses', icon: FileText, title: 'Архів планів', hue: HUE.sky,
        text: 'Усі минулі плани й наскільки вони справдились',
      },
      {
        to: '/backtest', icon: History, title: 'Бектести', hue: HUE.mint,
        text: 'Перевірити ідею на історії',
        badge: (s) => (s.backtests ? `${s.backtests} прогонів` : 'ще жодного'),
      },
      {
        to: '/20-trades', icon: Activity, title: '20 угод', hue: HUE.lime,
        text: 'Вправа на дисципліну, а не на прибуток',
      },
      {
        to: '/accounts', icon: Users, title: 'Рахунки', hue: HUE.peach,
        text: 'Депозити й проп-акаунти',
        resize: true,
      },
    ],
  },
];

/* Плоский реєстр: розкладка зберігає тільки список адрес, а все
   інше — іконка, колір, підпис — лишається тут. Так додати новий
   розділ можна без міграції збережених розкладок. */
const TILES = {};
SECTIONS.forEach((sec) => sec.items.forEach((it) => { TILES[it.to] = it; }));
const KNOWN = Object.keys(TILES);

/* ---------- плитка ---------- */

/* Ховер без жодного руху блоку. Рух завжди дає відчуття затримки:
   framer чекає на рендер, потім розганяє пружину — між курсором і
   реакцією зʼявляється пауза. Тут натомість світло, яке йде рівно
   за курсором. Координати пишемо прямо в CSS-змінні на DOM-вузлі,
   повз React, тому реакція миттєва навіть на слабкій машині. */
function Tile({ item, state, index, onGo, edit, onHide, size, onSize }) {
  const Icon = item.icon;
  const badge = item.badge?.(state) || null;
  const alert = item.alert?.(state) || false;
  const hue = alert ? T.warnRgb : (item.hue || T.accRgb);

  /* Крім координат рахуємо кут від центру до курсора. Саме він
     обертає грані — камінь відблискує з того боку, з якого на нього
     дивишся, а не крутиться сам по собі. */
  const track = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const ang = (Math.atan2(y - r.height / 2, x - r.width / 2) * 180) / Math.PI;

    el.style.setProperty('--mx', `${x}px`);
    el.style.setProperty('--my', `${y}px`);
    el.style.setProperty('--ang', ang.toFixed(1));
    /* чим далі від центру — тим різкіший відблиск */
    const d = Math.min(1, Math.hypot(x - r.width / 2, y - r.height / 2) / (r.width / 2));
    el.style.setProperty('--edge', d.toFixed(3));
  };

  /* Поки миша не заходила — світло тримаємо в центрі, щоб перший
     кадр ховера не стрибав з кута */
  const center = (e) => {
    const el = e.currentTarget;
    el.style.setProperty('--mx', `${el.offsetWidth / 2}px`);
    el.style.setProperty('--my', `${el.offsetHeight / 2}px`);
  };

  /* У режимі налаштування плитка перестає бути кнопкою: всередині
     зʼявляється своя кнопка «сховати», а кнопка в кнопці ламає і
     розмітку, і навігацію з клавіатури. */
  const Root = edit ? motion.div : motion.button;

  return (
    <Root
      {...(edit ? {} : { onClick: () => onGo(item.to) })}
      onPointerEnter={center}
      onPointerMove={track}
      initial={{ opacity: 0, filter: 'blur(6px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, delay: Math.min(index, 10) * 0.03, ease: EASE }}
      whileTap={edit ? undefined : { scale: 0.994 }}
      className={`hub-tile group relative flex h-full w-full flex-col overflow-hidden p-5 text-left ${
        edit ? 'hub-jiggle cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{
        '--hue': hue,
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 16,
        /* своя фаза тремтіння: дюжина плиток, що коливаються в такт,
           виглядає як збій, а не як живий інтерфейс */
        ...(edit ? {
          animationDelay: `-${((index * 37) % 55) / 100}s`,
          animationDuration: `${0.58 + ((index * 13) % 9) / 100}s`,
        } : null),
      }}
    >
      {/* Керування розкладкою. Живе поверх усього, зʼявляється тільки
          в режимі налаштування. */}
      {edit && (
        <span className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text4 }}
            title="Перетягни, щоб переставити"
          >
            <GripVertical size={14} strokeWidth={2.2} />
          </span>

          {/* Ширина. Тільки там, де широкій плитці є чим зайняти
              місце — решта живе в одному розмірі, як і частина
              віджетів на телефоні. Кнопка на межі не зникає, а
              гасне: зникаючі кнопки змушують шукати їх заново. */}
          {item.resize && (
            <span
              className="flex h-8 items-center rounded-lg"
              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            >
              {[['-', 1], ['+', 2]].map(([k, n]) => {
                const off = size === n;
                const Ico = k === '-' ? Minimize2 : Maximize2;
                return (
                  <button
                    key={k}
                    disabled={off}
                    onClick={(e) => { e.stopPropagation(); onSize(item.to, n); }}
                    className="grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200"
                    style={{ color: off ? T.line : T.text3, cursor: off ? 'default' : 'pointer' }}
                    onMouseEnter={(e) => { if (!off) e.currentTarget.style.color = T.text; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = off ? (T.line) : T.text3; }}
                    title={k === '-' ? 'Вужча плитка' : 'Ширша плитка'}
                  >
                    <Ico size={14} strokeWidth={2.2} />
                  </button>
                );
              })}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onHide(item.to); }}
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.35)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
            title="Сховати розділ"
          >
            <EyeOff size={14} strokeWidth={2.2} />
          </button>
        </span>
      )}

      {/* Огранка: ледь помітні площини, видні завжди */}
      <span aria-hidden className="hub-cut" />

      {/* Внутрішнє світло каменя */}
      <span aria-hidden className="hub-glow" />

      {/* Грані — розходяться з точки, де курсор */}
      <span aria-hidden className="hub-facets" />

      {/* Дисперсія: холодний і теплий край променя */}
      <span aria-hidden className="hub-prism" />

      {/* Різкий відблиск під самим курсором */}
      <span aria-hidden className="hub-spark" />

      {/* Кант, що ловить світло */}
      <span aria-hidden className="hub-ring" />

      <div className="relative mb-3.5 flex items-start gap-3">
        <span
          className="hub-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{
            background: `rgba(${hue},0.09)`,
            border: `1px solid rgba(${hue},0.20)`,
          }}
        >
          <Icon size={17} strokeWidth={2.1} style={{ color: `rgb(${hue})` }} />
        </span>

        {/* У режимі налаштування підпис ховаємо: керування розкладкою
            сидить у тому ж куті й на вузькій плитці накриває його. */}
        {badge && !edit && (
          <span
            className="ml-auto shrink-0 rounded-lg px-2 py-1 text-[12px] font-bold"
            style={{
              fontFamily: T.sans,
              color: alert ? T.warn : T.text3,
              background: alert ? `rgba(${T.warnRgb},0.09)` : T.sunken,
              border: `1px solid ${alert ? `rgba(${T.warnRgb},0.22)` : T.line}`,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      <h3
        className="relative mb-1.5 text-[16.5px] font-bold"
        style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}
      >
        {item.title}
      </h3>

      {/* Висота плитки фіксована, тому підпис обрізаємо на двох
          рядках: довший текст інакше виліз би за нижню межу. */}
      <p
        className="relative line-clamp-2 text-[13.5px]"
        style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}
      >
        {item.text}
      </p>

      <ArrowRight
        size={15}
        strokeWidth={2.4}
        className="hub-arrow absolute bottom-5 right-5"
        style={{ color: `rgb(${hue})` }}
      />
    </Root>
  );
}

/* Вміст плитки не залежить від того, куди вона переїхала. Тому при
   перестановці React його навіть не торкається — рухаються тільки
   координати обгортки. */
const TileM = memo(Tile);

/* ---------- рядок стану дня ---------- */

/* Кожен показник — це вхід у свій розділ, тому він поводиться як
   кнопка: те саме світло за курсором, що й на плитках, тільки тихіше.
   Смуга вгорі не має перетягувати увагу на себе. */
function DayStat({ label, value, tone, done, hue, to, onGo, tour }) {
  const track = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <button
      onClick={() => to && onGo(to)}
      onPointerMove={track}
      data-tour={tour}
      className="hub-stat group relative flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left"
      style={{ '--hue': hue || T.accRgb }}
    >
      <span aria-hidden className="hub-stat-glow" />
      <span aria-hidden className="hub-stat-ring" />

      <span
        className="hub-stat-icon relative grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{
          background: done ? `rgba(${T.okRgb},0.10)` : T.sunken,
          border: `1px solid ${done ? `rgba(${T.okRgb},0.24)` : T.line}`,
        }}
      >
        {done
          ? <Check size={13} strokeWidth={3.2} style={{ color: T.ok }} />
          : <Circle size={9} strokeWidth={3} style={{ color: T.text4 }} />}
      </span>

      <span className="relative min-w-0">
        <span
          className="hub-stat-label block truncate text-[12px] font-semibold uppercase tracking-[0.1em]"
          style={{ fontFamily: T.sans, color: T.text4 }}
        >
          {label}
        </span>
        <span
          className="block truncate text-[14px] font-bold"
          style={{ fontFamily: T.sans, color: tone || T.text2 }}
        >
          {value}
        </span>
      </span>

      <ArrowRight
        size={13}
        strokeWidth={2.5}
        className="hub-stat-arrow relative ml-auto shrink-0"
        style={{ color: `rgb(${hue || T.accRgb})` }}
      />
    </button>
  );
}

/* ================================================================== */

export default function Hub() {
  useEdgeFonts();

  const navigate = useNavigate();
  const { user } = useAuth();
  const { nickname, goal } = useSettings();

  /* Палітра з термінала — на цій сторінці й у світлій темі */
  useTerminalSkin();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    loadHubState(user.id)
      .then((s) => { if (alive) setState(s); })
      .catch(() => { /* стартова сторінка не має падати через цифри */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  const s = state || {
    plansToday: 0, diagDone: false, diagCount: 0, tradesWeek: 0, netRWeek: 0,
    mistakesWeek: 0, cleanDaysWeek: 0, tradingDaysWeek: 0,
    tasksToday: 0, tasksOverdue: 0, tasksOpen: 0,
    lastReviewTo: null, backtests: 0,
  };

  /* ---------- тиждень проти цілі ----------

     Без цілі плашка чесно каже, що вона підсумок, а не прогрес. З
     ціллю показує «зроблено з потрібного» і зеленіє тільки коли
     ціль справді закрита — напівдорозі зелений колір збиває
     орієнтир сильніше, ніж його відсутність. */
  const week = useMemo(() => {
    const type = goal?.type || 'none';
    const need = Number(goal?.value) || 0;

    if (type === 'none' || !need) {
      return {
        value: s.tradesWeek
          ? `${s.tradesWeek} угод · ${s.netRWeek > 0 ? '+' : ''}${s.netRWeek}R`
          : 'без угод',
        done: false,
        tone: s.tradesWeek ? (s.netRWeek >= 0 ? T.ok : T.bad) : T.text3,
      };
    }

    const have = type === 'clean' ? s.cleanDaysWeek
      : type === 'trades' ? s.tradesWeek
        : Math.max(0, Math.round(s.netRWeek * 10) / 10);

    const g = goalById(type);
    const done = have >= need;

    return {
      value: `${have} з ${need} ${g.unit}`.trim(),
      done,
      /* Мінусовий тиждень при ціллі в R — окремий випадок: людина має
         бачити, що вона не просто «не дійшла», а пішла в інший бік. */
      tone: done ? T.ok : (type === 'r' && s.netRWeek < 0) ? T.bad : T.text2,
    };
  }, [goal, s.tradesWeek, s.netRWeek, s.cleanDaysWeek]);

  /* Одна головна підказка — те, чого бракує найбільше */
  const nudge = useMemo(() => {
    if (!s.diagDone) return { text: 'Почни з діагностики стану — це дві хвилини', to: '/plan' };
    if (!s.plansToday) return { text: 'Плану на сьогодні ще немає', to: '/plan' };
    if (s.tasksOverdue) return { text: `${s.tasksOverdue} прострочених завдань чекають`, to: '/todo' };
    const n = daysSince(s.lastReviewTo);
    if (n === null || n > 7) return { text: 'Час зробити розбір тижня', to: '/reviews' };
    return { text: 'Підготовка закрита — можна працювати', to: null };
  }, [s]);

  /* Нікнейм із налаштувань, інакше — початок пошти. Звертання
     «edge95944» замість імені щодня нагадує, що ти рядок у базі. */
  const name = nickname || (user?.email || '').split('@')[0];

  /* ---------- своя розкладка ----------
     Ярослав сформулював це точно: розділів багато, більшістю він би
     не користувався, і комфортніше, коли людина складає інтерфейс
     під себе. Тому порядок і список схованих живуть у користувача,
     а не в коді. */
  const [savedLayout, setLayout] = useCloudState('launchpad', DEFAULT_LAYOUT, {
    normalize: (v) => normalizeLayout(v, KNOWN),
  });
  const layout = useMemo(() => normalizeLayout(savedLayout, KNOWN), [savedLayout]);

  const [edit, setEdit] = useState(false);
  const [dragId, setDragId] = useState(null);

  /* Поки плитку тягнуть, порядок живе тут, а не в хмарному стані.
     Інакше кожен рух миші писав би в localStorage і піднімав запис у
     базу — звідси й лаги з мерехтінням: сітка перемальовувалась
     десятки разів на секунду. У хмару віддаємо один раз, на відпусканні. */
  const [dragOrder, setDragOrder] = useState(null);

  const activeOrder = dragOrder || layout.order;

  const visible = useMemo(
    () => activeOrder.filter((id) => !layout.hidden.includes(id) && TILES[id]),
    [activeOrder, layout.hidden],
  );
  const hiddenTiles = useMemo(
    () => layout.hidden.filter((id) => TILES[id]),
    [layout],
  );

  /* Обробники стабільні за посиланням — інакше кожна перестановка
     перемальовувала б і вміст усіх плиток, хоча в ньому нічого не
     змінилось. Рухатись мають координати, а не текст. */
  const hide = useCallback((id) =>
    setLayout((l) => {
      const cur = normalizeLayout(l, KNOWN);
      return { ...cur, hidden: [...cur.hidden, id] };
    }), [setLayout]);

  const show = useCallback((id) =>
    setLayout((l) => {
      const cur = normalizeLayout(l, KNOWN);
      return { ...cur, hidden: cur.hidden.filter((x) => x !== id) };
    }), [setLayout]);

  const reset = () => setLayout(DEFAULT_LAYOUT);

  /* Розмір: у стані лежить тільки те, що людина міняла руками,
     решта бере значення з коду. */
  const sizeOf = (id) => layout.sizes?.[id] ?? (TILES[id]?.big ? 2 : 1);

  const setSize = useCallback((id, n) =>
    setLayout((l) => {
      const cur = normalizeLayout(l, KNOWN);
      return { ...cur, sizes: { ...cur.sizes, [id]: n } };
    }), [setLayout]);

  /* ---------- геометрія ----------
     Ширину міряємо самі: від неї залежить і кількість колонок, і
     розмір комірки, і координати кожної плитки. */
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const read = () => setWidth(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = colsFor(width || 1200);
  const cellW = width ? (width - GAP * (cols - 1)) / cols : 0;

  const { slots, height } = useMemo(
    () => pack(visible, (id) => sizeOf(id), cols, cellW),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [visible, cols, cellW, layout.sizes],
  );

  /* Комірки порожньої сітки — рівно стільки рядків, скільки зайнято */
  const mesh = useMemo(() => {
    if (!cellW) return [];
    const rows = Math.max(1, Math.round((height + GAP) / (ROW + GAP)));
    const out = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        out.push({ r, c, x: c * (cellW + GAP), y: r * (ROW + GAP) });
      }
    }
    return out;
  }, [cols, cellW, height]);

  /* ---------- перетягування ----------

     Тут була справжня причина, чому плитки розбігались, і вона не в
     частоті рендерів.

     Порядок — це список, а розкладка — щільна укладка цього списку.
     Одне не дорівнює іншому: посунув елемент на позицію сусіда — і
     пакувальник міг покласти в ту комірку зовсім іншу плитку, бо
     вона краще влазить. Курсор одразу опинявся над новою плиткою,
     ми міняли порядок ще раз, укладка знову їхала — і так щокадру.
     Класична петля зворотного звʼязку: розкладка міняє те, що ми
     міряємо, а виміряне міняє розкладку.

     Розриваємо її запамʼятовуванням не плитки, а комірки. Поки
     курсор у тій самій комірці, порядок не чіпаємо взагалі — хай під
     ним хоч усе переїде. Плюс невелика пауза між перестановками:
     на телефоні іконки теж розступаються не миттєво, і саме ця
     пауза читається як спокій, а не як гальмо. */

  const cellRef = useRef('');       /* комірка, в якій курсор востаннє щось змінив */
  const atRef = useRef(0);          /* коли це було */
  const boxRef = useRef(null);      /* рамка контейнера, знята один раз */

  const startDrag = (id) => {
    const el = wrapRef.current;
    const r = el ? el.getBoundingClientRect() : null;
    /* рамку памʼятаємо, а не питаємо щокадру: під час перетягування
       все одно рухаються тільки трансформи, а зайвий вимір змушує
       браузер перераховувати стилі */
    boxRef.current = r ? { left: r.left, top: r.top, scroll: window.scrollY } : null;
    cellRef.current = '';
    atRef.current = 0;
    setDragOrder(layout.order);
    setDragId(id);
  };

  const onDragMove = (e) => {
    const box = boxRef.current;
    if (!dragId || !box || !cellW) return;

    const px = e.clientX - box.left;
    const py = e.clientY - box.top + (window.scrollY - box.scroll);

    const c = Math.floor(px / (cellW + GAP));
    const r = Math.floor(py / (ROW + GAP));
    if (c < 0 || c >= cols || r < 0) return;

    /* мертва зона по краях комірки: на межі двох плиток намір
       людини ще не визначений, і вгадувати його не треба */
    const inX = px - c * (cellW + GAP);
    const inY = py - r * (ROW + GAP);
    if (inX < cellW * 0.18 || inX > cellW * 0.82) return;
    if (inY < ROW * 0.18 || inY > ROW * 0.82) return;

    const cell = `${r}:${c}`;
    if (cell === cellRef.current) return;

    const now = performance.now();
    if (now - atRef.current < 140) return;

    const over = visible.find((id) => {
      const sl = slots[id];
      return sl && sl.r === r && c >= sl.c && c < sl.c + sl.span;
    });
    if (!over || over === dragId) return;

    cellRef.current = cell;
    atRef.current = now;

    setDragOrder((cur) => {
      const base = cur || layout.order;
      return move(base, base.indexOf(dragId), base.indexOf(over));
    });
  };

  const endDrag = () => {
    const next = dragOrder;
    cellRef.current = '';
    boxRef.current = null;
    setDragId(null);
    setDragOrder(null);
    if (next) setLayout((l) => ({ ...normalizeLayout(l, KNOWN), order: next }));
  };

  return (
    <div className="relative min-h-full">

      {/* Ховер зроблено на CSS, а не на JS: браузер малює його на
          композиторі, тому світло встигає за курсором піксель у піксель.
          Жодного руху самої плитки — тільки світло, рамка й блиск. */}
      <style>{`
        /* ==========================================================
           Ефект каменя.
           Раніше тут крутився один конічний градієнт — виглядало як
           радар: рух сам по собі, незалежно від курсора. Тепер грані
           розходяться з точки, де курсор, а їхній нахил задає кут
           від центру плитки. Тому камінь відблискує з того боку, з
           якого на нього дивишся.

           Усе на CSS-змінних і композиторі: React у цьому не бере
           участі, тому світло не відстає від миші.
        ========================================================== */
        .hub-tile {
          --mx: 50%;
          --my: 50%;
          --ang: 0;
          --edge: 0;
          isolation: isolate;
          transition: background-color .45s ease, box-shadow .45s ease;
        }

        /* Тремтіння в режимі розкладки. Амплітуда навмисно крихітна:
           жест має читатись боковим зором як «зараз можна тягнути», а
           не смикати текст. Кожна плитка отримує свою фазу, інакше
           дюжина однакових коливань виглядає як брак кадрів. */
        @keyframes hub-jiggle {
          0%   { transform: rotate(-0.16deg); }
          50%  { transform: rotate(0.16deg); }
          100% { transform: rotate(-0.16deg); }
        }
        .hub-jiggle {
          animation: hub-jiggle .62s ease-in-out infinite;
          transform-origin: 50% 50%;
          will-change: transform;
        }

        /* Тремтіння — прикраса. Кому воно шкодить, той його не бачить. */
        @media (prefers-reduced-motion: reduce) {
          .hub-jiggle { animation: none; }
        }
        .hub-tile:hover {
          background-color: ${T.surfaceHi} !important;
          box-shadow:
            0 0 0 1px rgba(var(--hue), 0.12),
            0 30px 70px -38px rgba(var(--hue), 0.6),
            0 18px 40px -30px rgba(0,0,0,0.92);
        }

        /* ---------- плитки на папері ----------

           Уся огранка нижче побудована на білому світлі: грані,
           відблиски й ореол — це шари rgba(255,255,255,…) поверх
           темного. На світлому тлі білий по світлому не видно взагалі,
           тому плитка перетворювалась на плаский прямокутник.

           На папері працює протилежне: не світло, а тінь. Тому в
           світлій темі декоративні шари гасимо майже до нуля, а обʼєм
           дає мʼяка тінь під карткою — так само, як лежить аркуш на
           столі. */
        :root.edge-light .hub-tile {
          box-shadow: 0 1px 2px rgba(60,45,20,0.05), 0 6px 16px -12px rgba(60,45,20,0.22);
        }
        :root.edge-light .hub-tile:hover {
          box-shadow:
            0 0 0 1px rgba(var(--hue), 0.30),
            0 2px 4px rgba(60,45,20,0.06),
            0 18px 36px -22px rgba(var(--hue), 0.40);
        }
        :root.edge-light .hub-facets,
        :root.edge-light .hub-prism,
        :root.edge-light .hub-spark,
        :root.edge-light .hub-cut {
          opacity: 0 !important;
        }
        /* Ореол лишаємо, але тепер він кольоровий, а не білий:
           підсвітка кольором розділу читається й на папері. */
        :root.edge-light .hub-glow {
          background: radial-gradient(
            220px circle at var(--mx) var(--my),
            rgba(var(--hue), 0.14),
            transparent 70%
          );
        }
        :root.edge-light .hub-ring {
          box-shadow: inset 0 0 0 1px rgba(var(--hue), 0.16);
        }

        .hub-cut, .hub-glow, .hub-facets, .hub-prism, .hub-spark, .hub-ring {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        /* Огранка. Видна завжди, дуже слабко — саме вона робить
           поверхню каменем, а не склом. */
        .hub-cut {
          background:
            linear-gradient(128deg, rgba(255,255,255,.030) 0 21%, transparent 21.4%),
            linear-gradient(218deg, rgba(255,255,255,.020) 0 32%, transparent 32.4%),
            linear-gradient(310deg, rgba(255,255,255,.016) 0 17%, transparent 17.4%);
          opacity: .8;
        }

        /* Внутрішнє світло — те, що камінь пропускає крізь себе */
        .hub-glow {
          background: radial-gradient(
            300px circle at var(--mx) var(--my),
            rgba(var(--hue), 0.16),
            rgba(var(--hue), 0.05) 40%,
            transparent 70%
          );
          opacity: 0;
          transition: opacity .4s ease;
        }
        .hub-tile:hover .hub-glow { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Грані. Промені різної ширини й яскравості — рівні спиці
           виглядають як механізм, нерівні як огранка. */
        .hub-facets {
          background: conic-gradient(
            from calc(var(--ang) * 1deg) at var(--mx) var(--my),
            transparent 0deg,
            rgba(255,255,255,.16) 3deg,
            rgba(var(--hue), .30) 7deg,
            transparent 15deg,
            transparent 48deg,
            rgba(255,255,255,.07) 53deg,
            transparent 60deg,
            transparent 128deg,
            rgba(var(--hue), .20) 133deg,
            rgba(255,255,255,.10) 137deg,
            transparent 145deg,
            transparent 196deg,
            rgba(255,255,255,.05) 200deg,
            transparent 207deg,
            transparent 268deg,
            rgba(var(--hue), .14) 273deg,
            transparent 281deg,
            transparent 322deg,
            rgba(255,255,255,.08) 326deg,
            transparent 333deg,
            transparent 360deg
          );
          mix-blend-mode: screen;
          opacity: 0;
          transition: opacity .3s ease;
        }
        .hub-tile:hover .hub-facets { opacity: calc((.55 + var(--edge) * .45) * var(--edge-fx, 1)); }

        /* Дисперсія. Один край променя холодніший, другий тепліший —
           через це відблиск читається як заломлення, а не як підсвітка. */
        .hub-prism {
          background: conic-gradient(
            from calc(var(--ang) * 1deg + 9deg) at var(--mx) var(--my),
            transparent 0deg,
            rgba(120,200,255,.20) 4deg,
            transparent 13deg,
            transparent 130deg,
            rgba(255,150,210,.16) 136deg,
            transparent 144deg,
            transparent 270deg,
            rgba(150,255,220,.12) 275deg,
            transparent 283deg,
            transparent 360deg
          );
          filter: blur(7px);
          mix-blend-mode: screen;
          opacity: 0;
          transition: opacity .35s ease;
        }
        .hub-tile:hover .hub-prism { opacity: calc((.5 + var(--edge) * .5) * var(--edge-fx, 1)); }

        /* Точка, де світло входить у камінь */
        .hub-spark {
          background:
            radial-gradient(58px circle at var(--mx) var(--my),
              rgba(255,255,255,.26), rgba(255,255,255,.07) 32%, transparent 62%),
            radial-gradient(14px circle at var(--mx) var(--my),
              rgba(255,255,255,.55), transparent 70%);
          mix-blend-mode: screen;
          opacity: 0;
          transition: opacity .25s ease;
        }
        .hub-tile:hover .hub-spark { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Кант ловить світло рівно там, де курсор */
        .hub-ring {
          border-radius: 16px;
          padding: 1px;
          background: radial-gradient(
            240px circle at var(--mx) var(--my),
            rgba(255,255,255,.55),
            rgba(var(--hue), 0.75) 18%,
            rgba(var(--hue), 0.16) 48%,
            transparent 72%
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: 0;
          transition: opacity .35s ease;
        }
        .hub-tile:hover .hub-ring { opacity: calc(1 * var(--edge-fx, 1)); }

        /* іконка трохи оживає */
        .hub-icon {
          transition: transform .45s cubic-bezier(0.22,1,0.36,1), box-shadow .45s ease;
        }
        .hub-tile:hover .hub-icon {
          transform: scale(1.06);
          box-shadow: 0 0 22px -6px rgba(var(--hue), 0.55);
        }

        /* стрілка виїжджає */
        .hub-arrow {
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity .35s ease, transform .45s cubic-bezier(0.22,1,0.36,1);
        }
        .hub-tile:hover .hub-arrow { opacity: 1; transform: translateX(0); }

        /* ---------- показники стану дня ----------
           Той самий принцип, що на плитках, але тихіший: смуга вгорі
           не має конкурувати з сіткою розділів. */
        .hub-stat {
          --mx: 50%;
          --my: 50%;
          isolation: isolate;
          transition: background-color .35s ease;
        }
        .hub-stat:hover { background-color: rgba(255,255,255,0.022); }
        /* На папері підсвічування робиться затемненням, а не білим */
        :root.edge-light .hub-stat:hover { background-color: rgba(40,30,16,0.035); }
        :root.edge-light .hub-stat-glow { opacity: 0 !important; }

        /* ---------- палітра термінала ----------
           Колір розділу лежить у --hue прямо на плитці, тому
           перебиваємо його тут: у палітрі з чотирьох сірих кольорів
           вісім різних відтінків іконок виглядали б як чужі наклейки.
           Розділ упізнається за іконкою й підписом, цього досить. */
        :root.edge-tw .hub-tile,
        :root.edge-tw .hub-stat,
        :root.edge-tw .hub-icon,
        :root.edge-tw .hub-stat-icon { --hue: 62,67,79 !important; }

        :root.edge-tw .hub-tile:hover {
          box-shadow:
            0 0 0 1px rgba(62,67,79,0.34),
            0 10px 22px -16px rgba(62,67,79,0.45);
        }

        .hub-stat-glow, .hub-stat-ring {
          position: absolute; inset: 0; pointer-events: none;
          border-radius: 12px;
        }

        .hub-stat-glow {
          background: radial-gradient(
            160px circle at var(--mx) var(--my),
            rgba(var(--hue), 0.14),
            transparent 68%
          );
          opacity: 0;
          transition: opacity .35s ease;
        }
        .hub-stat:hover .hub-stat-glow { opacity: calc(1 * var(--edge-fx, 1)); }

        .hub-stat-ring {
          padding: 1px;
          background: radial-gradient(
            130px circle at var(--mx) var(--my),
            rgba(255,255,255,.35),
            rgba(var(--hue), 0.55) 22%,
            transparent 68%
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: 0;
          transition: opacity .35s ease;
        }
        .hub-stat:hover .hub-stat-ring { opacity: calc(1 * var(--edge-fx, 1)); }

        .hub-stat-icon {
          transition: transform .4s cubic-bezier(0.22,1,0.36,1), box-shadow .4s ease;
        }
        .hub-stat:hover .hub-stat-icon {
          transform: scale(1.08);
          box-shadow: 0 0 18px -6px rgba(var(--hue), 0.5);
        }

        .hub-stat-label { transition: color .3s ease; }
        .hub-stat:hover .hub-stat-label { color: rgb(var(--hue)); }

        .hub-stat-arrow {
          opacity: 0;
          transform: translateX(-3px);
          transition: opacity .3s ease, transform .4s cubic-bezier(0.22,1,0.36,1);
        }
        .hub-stat:hover .hub-stat-arrow { opacity: .9; transform: translateX(0); }

        @media (prefers-reduced-motion: reduce) {
          .hub-tile, .hub-icon, .hub-arrow,
          .hub-glow, .hub-ring, .hub-facets, .hub-prism, .hub-spark,
          .hub-stat, .hub-stat-glow, .hub-stat-ring, .hub-stat-icon,
          .hub-stat-label, .hub-stat-arrow {
            transition-duration: .01ms;
          }
        }
      `}</style>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-10">

        {/* ─────────── Привітання ─────────── */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="mb-7"
        >
          <div
            className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.22em]"
            style={{ fontFamily: T.sans, color: T.acc }}
          >
            {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          <h1
            className="text-[30px] font-bold leading-none sm:text-[42px] lg:text-[50px]"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}
          >
            {greeting()}{name ? `, ${name}` : ''}
          </h1>

          <AnimatePresence mode="wait">
            <motion.button
              key={nudge.text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: EASE }}
              onClick={() => nudge.to && navigate(nudge.to)}
              className="group mt-4 flex items-center gap-2 text-[15px]"
              style={{ fontFamily: T.sans, color: T.text3, cursor: nudge.to ? 'pointer' : 'default' }}
            >
              {nudge.text}
              {nudge.to && (
                <ArrowRight
                  size={14}
                  strokeWidth={2.4}
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                  style={{ color: T.acc }}
                />
              )}
            </motion.button>
          </AnimatePresence>
        </motion.header>

        {/* ─────────── Стан дня ─────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
          className="mb-9 grid grid-cols-1 gap-1.5 rounded-2xl p-2.5 sm:grid-cols-2 xl:grid-cols-4"
          style={{
            background: `linear-gradient(120deg, rgba(${T.accRgb},0.045), ${T.surface} 55%)`,
            border: `1px solid ${T.line}`,
          }}
        >
          {loading ? (
            <div className="col-span-full flex items-center gap-2.5 py-1">
              <Loader2 size={15} className="animate-spin" style={{ color: T.text4 }} />
              <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                дивлюсь, як минає день…
              </span>
            </div>
          ) : (
            <>
              <DayStat
                label="Діагностика"
                value={s.diagDone ? 'пройдена' : `${s.diagCount} з 4`}
                done={s.diagDone}
                tone={s.diagDone ? T.ok : T.warn}
                hue={HUE.mint}
                to="/plan"
                onGo={navigate}
              />
              <DayStat
                label="План на сьогодні"
                value={s.plansToday ? `${s.plansToday} ${s.plansToday === 1 ? 'актив' : 'активи'}` : 'немає'}
                done={s.plansToday > 0}
                tone={s.plansToday ? T.text : T.warn}
                hue={HUE.ice}
                to="/plan"
                onGo={navigate}
              />
              <DayStat
                tour="week"
                label={goal?.type && goal.type !== 'none' ? goalById(goal.type).label : 'Тиждень'}
                value={week.value}
                done={week.done}
                tone={week.tone}
                hue={HUE.lime}
                to="/journal"
                onGo={navigate}
              />
              <DayStat
                label="Завдання"
                value={s.tasksOverdue
                  ? `${s.tasksOverdue} прострочено`
                  : s.tasksToday ? `${s.tasksToday} на сьогодні` : 'усе закрито'}
                done={!s.tasksOverdue && !s.tasksToday}
                tone={s.tasksOverdue ? T.bad : T.text2}
                hue={HUE.amber}
                to="/todo"
                onGo={navigate}
              />
            </>
          )}
        </motion.section>

        {/* ─────────── Розділи ─────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2
            className="text-[19px] font-bold"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
          >
            Розділи
          </h2>
          <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
            {edit ? 'Перетягни, щоб переставити · сховай зайве' : `${visible.length} на екрані`}
          </span>

          <span className="ml-auto flex items-center gap-2">
            {edit && (
              <button
                onClick={reset}
                className="flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-colors duration-200"
                style={{ fontFamily: T.sans, background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.warn; e.currentTarget.style.borderColor = `rgba(${T.warnRgb},0.3)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
              >
                <RotateCcw size={13} strokeWidth={2.3} /> Як було
              </button>
            )}
            <button
              onClick={() => { setEdit((v) => !v); setDragId(null); }}
              className="flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold transition-colors duration-200"
              style={{
                fontFamily: T.sans,
                background: edit ? T.acc : T.surface,
                border: `1px solid ${edit ? 'transparent' : T.line}`,
                color: edit ? 'var(--edge-bg, #0A0A0C)' : T.text2,
              }}
              onMouseEnter={(e) => { if (!edit) e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { if (!edit) e.currentTarget.style.borderColor = T.line; }}
            >
              {edit ? <><Check size={14} strokeWidth={3} /> Готово</> : <><SlidersHorizontal size={13} strokeWidth={2.3} /> Налаштувати</>}
            </button>
          </span>
        </div>

        <motion.div
          ref={wrapRef}
          data-tour="grid"
          className="relative w-full"
          animate={{ height }}
          initial={false}
          transition={SPRING}
        >
          {/* Порожня сітка під плитками. Зʼявляється тільки в режимі
              розкладки: коли елемент відірвався від місця, має бути
              видно, куди він може лягти. */}
          <AnimatePresence>
            {edit && width > 0 && (
              <motion.div
                key="mesh"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="pointer-events-none absolute inset-0"
              >
                {mesh.map((cell) => (
                  <span
                    key={`${cell.r}:${cell.c}`}
                    className="absolute"
                    style={{
                      left: cell.x,
                      top: cell.y,
                      width: cellW,
                      height: ROW,
                      borderRadius: 16,
                      border: `1px dashed ${T.line}`,
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {width > 0 && visible.map((id) => (
            <Slot
              key={id}
              slot={slots[id]}
              drag={edit}
              bounds={wrapRef}
              dragging={dragId === id}
              onStart={() => startDrag(id)}
              onMove={onDragMove}
              onEnd={endDrag}
            >
              <TileM
                item={TILES[id]}
                state={s}
                index={KNOWN.indexOf(id)}
                onGo={navigate}
                edit={edit}
                onHide={hide}
                size={sizeOf(id)}
                onSize={setSize}
              />
            </Slot>
          ))}
        </motion.div>

        {/* Сховане. Показуємо тільки в режимі налаштування — інакше
            «прибрані» розділи повертались би на екран щодня і сенс
            приховування зникав би. */}
        <AnimatePresence>
          {edit && hiddenTiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div className="mt-9 pt-6" style={{ borderTop: `1px solid ${T.line}` }}>
                <div className="mb-3.5 flex items-baseline gap-3">
                  <h3
                    className="text-[13px] font-bold uppercase tracking-[0.16em]"
                    style={{ fontFamily: T.sans, color: T.text4 }}
                  >
                    Сховано
                  </h3>
                  <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {hiddenTiles.length} — натисни, щоб повернути
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {hiddenTiles.map((id) => {
                    const it = TILES[id];
                    const Icon = it.icon;
                    return (
                      <button
                        key={id}
                        onClick={() => show(id)}
                        className="flex h-11 items-center gap-2.5 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
                        style={{
                          fontFamily: T.sans,
                          background: T.surface,
                          border: `1px dashed ${T.lineHi}`,
                          color: T.text3,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = `rgba(${it.hue},0.5)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.lineHi; }}
                      >
                        <Icon size={15} strokeWidth={2.1} style={{ color: `rgb(${it.hue})` }} />
                        {it.title}
                        <Plus size={13} strokeWidth={2.8} style={{ color: T.text4 }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Усе сховано — не лишаємо порожній екран без виходу */}
        {visible.length === 0 && !edit && (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center"
            style={{ background: T.surface, border: `1px dashed ${T.lineHi}` }}
          >
            <EyeOff size={22} strokeWidth={1.8} style={{ color: T.text4 }} />
            <p className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Усі розділи сховані.
            </p>
            <button
              onClick={() => setEdit(true)}
              className="mt-1 flex h-11 items-center gap-2 rounded-xl px-4 text-[13.5px] font-bold"
              style={{ fontFamily: T.sans, background: T.acc, color: 'var(--edge-bg, #0A0A0C)' }}
            >
              <Eye size={14} strokeWidth={2.6} /> Повернути
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
