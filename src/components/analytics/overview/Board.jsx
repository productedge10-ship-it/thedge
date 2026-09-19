import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useSensor, useSensors,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check, Cog, GripVertical, Lock, Plus, RotateCcw, X,
} from 'lucide-react';
import { A, CSS_SPRING, F, LAYOUT, P, POP, en, hairline, lightLayer, mix, trackLight } from './theme';
import { DEFAULT_LAYOUT, WIDGETS, optionsFor } from './widgets';
import Preview from './Preview';

/* Реєстр віджетів приходить ззовні.

   Дошка нічого не знає про те, що саме на ній лежить: «Огляд» і
   «Перформанс» — це та сама механіка з різними наборами карток.
   Передавати реєстр пропсом через шість рівнів було б безглуздо, тож
   він живе в контексті. */
const RegistryCtx = createContext(WIDGETS);
const useRegistry = () => useContext(RegistryCtx);

/* ==================================================================
   Дошка огляду.

   Три речі, які тут вирішені й через які такі дошки зазвичай
   виглядають зламаними.

   1. Привид під курсором малюється в портал до body.

      DragOverlay за замовчуванням лишається там, де стоїть у дереві.
      А сторінка аналітики має анімацію появи з transform — і будь-який
      transform у предка робить його новим початком координат для
      position: fixed. Через це картка їхала не за пальцем, а поруч,
      зі зсувом на висоту шапки. Портал прибирає предків узагалі.

   2. Віджет можна не тільки додати кнопкою, а й перетягнути з
      бібліотеки просто на місце.

      Тому DndContext обгортає і бібліотеку, і сітку: це один жест, а
      не два різні механізми.

   3. Видалення анімоване вручну, без AnimatePresence.

      framer-motion пише в transform, dnd-kit пише в transform — і
      разом вони б'ються за одну властивість. Тому картка, яку
      прибирають, спершу зменшується власним CSS-переходом і лише за
      220 мілісекунд зникає з масиву.
================================================================== */

export const PERIODS = [
  ['inherit', 'Page'],
  ['7', 'Week'],
  ['30', '30 days'],
  ['90', 'Quarter'],
  ['all', 'All time'],
];

const WIDTH_LABEL = { 1: '¼', 2: '½', 3: '¾', 4: 'Full' };
const REMOVE_MS = 220;

/* ------------------------------------------------------------------
   Плитка

   Дошка з карток, кожна з яких заввишки рівно під свій вміст, не
   працює. Це перевірено двічі: спершу всіх розтягувало під найвищого
   в рядку (число зависало посеред порожнечі), потім кожен отримав
   власну висоту (під короткими зяяли дірки). Обидва рази проблема та
   сама — висоту диктував вміст.

   Правильно навпаки: висоту диктує сітка, а вміст під неї
   підлаштовується. Це модель домашнього екрана iOS, з якої дошка й
   починалась: плитки бувають кількох розмірів, усі кратні одній
   клітинці, і саме тому екран ніколи не виглядає рваним. Віджет
   різниться наповненням, а не габаритом.

   Отже, у віджета тепер два розміри: w — скільки колонок, h —
   скільки рядів. Обидва вибирає людина, обидва зберігаються. Дірок
   не буває: усе кратне клітинці, а `row dense` заповнює те, що
   лишилось, наступною плиткою, яка пасує.
------------------------------------------------------------------ */
const ROW_H = 180;
const GAP = 14;
/* Крок рядка сітки. Картка без графіка міряє свій вміст і
   округлюється вгору до цілих клітинок по 90px. Попіксельна висота
   давала сусідам низи, що розходились на кілька пікселів, — і через
   цю щілину графік поруч уже не міг розширитись у вільну колонку.
   Кратні клітинки знову дають рівні краї, а отже й щільне укладання. */
const CELL = 90;
const unitsOf = (px) => Math.max(1, Math.ceil((px + GAP) / (CELL + GAP)));
/* Графік справді заповнює будь-яку висоту — він і тримає розмір
   з реєстру, і може дорости вниз у дірку. Список чи число — ні:
   таким картка рівно по вмісту, без порожнечі під ним. */
const growsWith = (spec = {}) => spec.shape === 'curve' || spec.shape === 'bars' || (spec.shape === 'dip' && (spec.defaultH || 1) >= 2);
const tilePx = (h) => h * ROW_H + (h - 1) * GAP;

const HEIGHT_LABEL = { 1: 'S', 2: 'M', 3: 'L', 4: 'XL' };

/* ------------------------------------------------------------------
   Панель налаштувань

   Переписана з нуля. Була сітка з рамками навколо кожної групи й
   кожної кнопки — двадцять прямокутників на п'ять рішень. Тепер
   рамок немає взагалі: підпис, під ним варіанти простим текстом, під
   активним — тонка риска, яка переїжджає. Читається як зміст, а не
   як панель приладів.
------------------------------------------------------------------ */

function Choice({ label, value, choices, tone, onPick, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.035, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
    >
      <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, letterSpacing: '.2px', color: P.dim }}>
        {label}
      </span>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {choices.map(([v, l]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              data-state={on ? 'active' : 'idle'}
              onClick={() => onPick(v)}
              style={{
                position: 'relative', padding: '1px 0 5px', border: 0, background: 'transparent',
                cursor: 'pointer', fontFamily: F.sans, fontSize: 13, fontWeight: on ? 600 : 500,
                letterSpacing: '-0.1px', color: on ? 'var(--edge-text)' : P.text5,
                transition: 'color .18s',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = P.text2; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = P.text5; }}
            >
              {l}
              {on && (
                <motion.span
                  layoutId={`u-${label}`}
                  transition={POP}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5,
                    borderRadius: 2, background: tone, boxShadow: `0 0 8px ${mix(tone, 60)}`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

/* Ширина — не список слів, а чотири смужки, що заповнюються.
   «¾» текстом треба перекласти в голові на розмір картки; заповнена
   на три чверті шкала — це вже і є розмір. */
function WidthPicker({ value, tone, onPick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: P.dim }}>Width</span>
        <span style={{ fontFamily: F.mono, fontSize: 11, color: tone }}>{WIDTH_LABEL[value]}</span>
      </span>

      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map((n) => {
          const on = n <= value;
          return (
            <button
              key={n}
              type="button"
              aria-label={`Width ${WIDTH_LABEL[n]}`}
              data-state={n === value ? 'active' : on ? 'filled' : 'idle'}
              onClick={() => onPick(n)}
              style={{
                flex: 1, height: 24, borderRadius: 7, cursor: 'pointer',
                background: on ? mix(tone, 18) : 'rgba(var(--edge-hair-rgb),0.03)',
                border: `1px solid ${n === value ? mix(tone, 55) : on ? mix(tone, 24) : 'transparent'}`,
                transition: 'all .18s',
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

/* Той самий вигляд, що у вибору ширини, і це навмисно: два розміри
   однієї плитки мають читатись як пара, а не як дві різні настройки. */
function HeightPicker({ value, tone, min = 1, onPick }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.07, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: 'flex', flexDirection: 'column', gap: 9 }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 500, color: P.dim }}>Height</span>
        <span style={{ fontFamily: F.mono, fontSize: 11, color: tone }}>{HEIGHT_LABEL[value]}</span>
      </span>

      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4].map((n) => {
          const on = n <= value;
          /* Нижче за minH клітинка не влазить власний вміст, тому ці
             сходинки просто вимкнені, а не приховані — видно, що вони
             були б менші, і чому їх не можна вибрати. */
          const disabled = n < min;
          return (
            <button
              key={n}
              type="button"
              aria-label={`Height ${HEIGHT_LABEL[n]}`}
              disabled={disabled}
              data-state={n === value ? 'active' : on ? 'filled' : 'idle'}
              onClick={() => !disabled && onPick(n)}
              style={{
                flex: 1, height: 24, borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
                background: on ? mix(tone, 18) : '#ffffff08',
                border: `1px solid ${n === value ? mix(tone, 55) : on ? mix(tone, 24) : 'transparent'}`,
                opacity: disabled ? 0.35 : 1,
                transition: 'all .18s',
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

function SettingsPanel({ id, item, onChange, onClose, resizable = true }) {
  const WIDGETS = useRegistry();
  const spec = WIDGETS[id];
  const opts = optionsFor(spec, item.o);
  const tone = spec.tone || P.acc;
  const boxRef = useRef(null);

  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const set = (patch) => onChange({ ...item, ...patch });
  const setOpt = (key, value) => onChange({ ...item, o: { ...opts, [key]: value } });

  return (
    <motion.div
      ref={boxRef}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14 } }}
      transition={POP}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 46, right: 12, zIndex: 70, width: 250,
        transformOrigin: 'top right',
        background: 'rgba(14,14,19,.92)',
        backdropFilter: 'blur(28px) saturate(140%)',
        WebkitBackdropFilter: 'blur(28px) saturate(140%)',
        border: '1px solid rgba(var(--edge-hair-rgb),0.08)', borderRadius: 16,
        padding: '15px 16px 17px', display: 'flex', flexDirection: 'column', gap: 17,
        boxShadow: '0 24px 60px -18px rgba(0,0,0,.85)',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: 99, background: tone, flexShrink: 0 }} />
        <span style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: 'var(--edge-text)', letterSpacing: '-0.1px' }}>
          {en(spec.title)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, border: 0, background: 'transparent', cursor: 'pointer', color: P.dim }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--edge-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = P.dim; }}
        >
          <X size={13} />
        </button>
      </div>

      {resizable && (
        <>
          <WidthPicker value={item.w} tone={tone} onPick={(n) => set({ w: n })} />
          <HeightPicker value={item.h} tone={tone} min={spec.minH || 1} onPick={(n) => set({ h: n })} />
        </>
      )}

      <Choice
        label="Period" index={2} tone={tone}
        value={item.p || 'inherit'}
        choices={PERIODS}
        onPick={(v) => set({ p: v })}
      />

      {Object.entries(spec.options || {}).map(([key, def], i) => (
        <Choice
          key={key}
          label={en(def.label)}
          index={i + 3}
          tone={tone}
          choices={def.choices.map(([v, l]) => [v, en(l)])}
          value={opts[key]}
          onPick={(v) => setOpt(key, v)}
        />
      ))}
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   Картка
------------------------------------------------------------------ */

function CardShell({
  item, stats, edit, hover, lifted, overlay, removing, openSettings, dropTarget,
  setHover, onRemove, onToggleSettings, onChange, renderW, fit,
  /* resizable вимкнено за замовчуванням: розмір плитки — рішення
     дизайну (реєстр), не людини. Довільні W/H одної картки ламали
     сітку сусідніх — «Очікування» одного разу розтягнули в 3×2, і
     решта рядка попливла під неї. Board.jsx тепер і не читає
     збережені w/h для розміру (див. рендер нижче), а це — щоб панель
     налаштувань більше не пропонувала їх міняти. */
  draggable = true, removable = true, resizable = false,
}) {
  const WIDGETS = useRegistry();
  const spec = WIDGETS[item.id];
  if (!spec) return null;

  const opts = optionsFor(spec, item.o);
  const tone = spec.tone || P.acc;
  const Icon = spec.icon;
  const state = overlay ? 'overlay' : removing ? 'removing' : lifted ? 'lifted' : dropTarget ? 'drop-target' : edit ? 'edit' : hover ? 'hover' : 'idle';

  return (
    <div
      data-state={state}
      onMouseMove={overlay ? undefined : trackLight}
      onMouseEnter={setHover ? () => setHover(true) : undefined}
      onMouseLeave={setHover ? () => setHover(false) : undefined}
      style={{
        /* overflow не ховаємо: панель налаштувань лежить усередині й
           виходить за межі картки. */
        position: 'relative', height: '100%',
        display: 'flex', flexDirection: 'column',
        background: P.card,
        border: `1px solid ${overlay || dropTarget || hover ? mix(tone, 35) : P.line}`,
        borderRadius: 20,
        padding: 18,
        opacity: removing ? 0 : lifted ? 0.26 : 1,
        /* Ховер більше не піднімає картку. Рух блоку під мишею
           перетворює дошку з шістнадцяти карток на щось, що постійно
           ворушиться; світло за курсором дає ту саму реакцію, нічого
           не зсуваючи. */
        transform: removing ? 'scale(.96)' : overlay ? 'rotate(-1.2deg)' : 'none',
        /* Ціль, над якою тримають картку, обводиться кільцем зовні —
           box-shadow, не border: рамка змінила б внутрішній розмір і
           вміст смикнувся б на піксель. */
        boxShadow: overlay
          ? `0 40px 80px -28px var(--edge-panel, rgba(0,0,0,0.9)), 0 0 0 1px ${mix(tone, 24)}`
          : dropTarget ? `0 0 0 2px ${mix(tone, 40)}, 0 0 34px -6px ${mix(tone, 30)}` : 'none',
        cursor: overlay || lifted ? 'grabbing' : edit && draggable ? 'grab' : 'default',
        transition: overlay ? 'none' : `opacity ${REMOVE_MS}ms ease, ${CSS_SPRING}`,
      }}
    >
      <span aria-hidden style={lightLayer(tone, hover && !overlay)} />
      <span style={hairline(hover || overlay)} />

      <span
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: 20, width: 36, height: 3,
          borderRadius: '0 0 4px 4px', background: tone,
          opacity: hover || overlay ? 1 : 0.55, transition: 'opacity .2s',
        }}
      />

      <header style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, minHeight: 22 }}>
        <AnimatePresence initial={false} mode="popLayout">
          {(edit || overlay) && draggable && (
            <motion.span
              key="grip"
              initial={{ opacity: 0, width: 0, marginRight: -8 }}
              animate={{ opacity: 1, width: 15, marginRight: 0 }}
              exit={{ opacity: 0, width: 0, marginRight: -8 }}
              transition={POP}
              aria-hidden
              /* Крапки лишились як позначка «це можна тягнути», але
                 тягнути тепер можна за всю картку, тож вони не ловлять
                 подій і не мають власного курсора. */
              style={{
                color: hover || overlay ? P.text4 : P.text5, display: 'flex',
                flexShrink: 0, pointerEvents: 'none', transition: 'color .2s',
              }}
            >
              <GripVertical size={14} />
            </motion.span>
          )}
        </AnimatePresence>

        <Icon size={13} color={hover || overlay ? tone : P.text5} style={{ flexShrink: 0, transition: 'color .2s' }} />

        <span
          style={{
            fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '1.6px',
            textTransform: 'uppercase', color: hover || overlay ? P.text2 : P.text4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            transition: 'color .2s',
          }}
        >
          {spec.title}
        </span>

        {item.p && item.p !== 'inherit' && (
          <span
            style={{
              fontFamily: F.mono, fontSize: 9.5, letterSpacing: '.8px', color: mix(tone, 90),
              background: mix(tone, 12), border: `1px solid ${mix(tone, 24)}`, borderRadius: 999,
              padding: '2px 7px', flexShrink: 0,
            }}
          >
            {(PERIODS.find(([v]) => v === item.p) || [, ''])[1]}
          </span>
        )}

        <span style={{ flex: 1 }} />

        <AnimatePresence initial={false}>
          {edit && !overlay && (
            <motion.span
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={POP}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ display: 'flex', gap: 3, flexShrink: 0 }}
            >
              <IconBtn title="Settings" active={openSettings} tone={tone} onClick={onToggleSettings}>
                <Cog size={13} />
              </IconBtn>
              {removable && (
                <IconBtn title="Remove" danger onClick={onRemove}>
                  <X size={13} />
                </IconBtn>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      {/* Вміст живе всередині плитки, а не навпаки.

          `minHeight: 0` обовʼязковий: без нього flex-елемент не має
          права стати меншим за свій вміст, і висока картка просто
          вилізла б за межі плитки замість того, щоб віддати графіку
          рівно те місце, яке лишилось.

          Прокрутки нема свідомо, а не auto з запобіжником: розмір
          тепер завжди задає реєстр, людина його не чіпає (нижче —
          resizable вимкнено), тож і рятувати нема від чого. auto
          лише вмикав скролбар на ховері там, де вміст ліг на
          піксель за декоративний хвіст спарклайна, хоч насправді
          обрізати не було чого. */}
      <div
        className="ov-body"
        style={{
          position: 'relative', flex: fit ? '0 0 auto' : 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          justifyContent: fit ? 'flex-start' : 'safe center',
          overflow: 'hidden',
        }}
      >
        {/* Віджет знає, якої він зараз ширини й чи на ньому курсор.
            Перше — щоб широка картка не стояла порожньою: місце,
            яке зʼявилось, має чимось наповнитись. Друге — щоб
            всередині було на що навести, а не тільки на саму рамку. */}
        {spec.render({
          s: stats,
          o: opts,
          id: item.id + (overlay ? '-ov' : ''),
          w: renderW ?? item.w,
          hover: !!hover || !!overlay,
        })}
      </div>

      <AnimatePresence>
        {openSettings && !overlay && (
          <SettingsPanel id={item.id} item={item} onChange={onChange} onClose={onToggleSettings} resizable={resizable} />
        )}
      </AnimatePresence>
    </div>
  );
}

function SortableCard({ item, edit, removing, place, fit, onMeasure, ...rest }) {
  const [hover, setHover] = useState(false);
  const bodyRef = useRef(null);
  /* Картка без графіка міряє свою природну висоту й віддає її дошці.

     Шапку й вміст шукаємо в момент виміру, а не один раз при монтуванні:
     на першому кадрі їх ще може не бути (реєстр, анімація появи), і тоді
     разовий ефект мовчки нічого не міряв — дошка вічно брала висоту з
     реєстру. Картка сама тягнеться на всю плитку, тому природна висота —
     це шапка + відступ + вміст (flex: none, не розтягується) + падінги й
     рамка. */
  const measure = useCallback(() => {
    const root = bodyRef.current;
    if (!fit || !root || !onMeasure) return;
    const head = root.querySelector('header');
    const body = root.querySelector('.ov-body');
    if (!head || !body || !body.offsetHeight) return;
    onMeasure(item.id, Math.ceil(head.offsetHeight + 14 + body.offsetHeight + 36 + 2));
  }, [fit, onMeasure, item.id]);
  /* Спостерігач вішається через callback ref на звичайний DOM-вузол
     плитки, а не в useEffect через ref на motion.div: у ефекті той ref
     бував порожнім, ефект виходив і більше не запускався — жодного
     виміру, дошка вічно брала висоту з реєстру. Callback ref спрацьовує
     рівно тоді, коли вузол зʼявився в DOM. */
  const roRef = useRef(null);
  const attachMeasure = useCallback((node) => {
    roRef.current?.disconnect();
    roRef.current = null;
    bodyRef.current = node;
    if (!node || !fit) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(node);
    node.querySelectorAll('header, .ov-body').forEach((n) => ro.observe(n));
    roRef.current = ro;
    measure();
  }, [fit, measure]);
  /* Після кожного рендеру — ще раз, на наступному кадрі: вміст міг
     змінитись (інші дані, період) без зміни розміру самої плитки.
     reportHeight ігнорує різницю до 2px, тож циклу не буде. */
  useEffect(() => {
    if (!fit) return undefined;
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  });
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging, isOver,
  } = useSortable({ id: item.id, disabled: !edit });
  const w = place?.w || item.w;
  /* Один стабільний ref замість стрілки в JSX: нова функція на кожен
     рендер змушувала React перепідключати спостерігач щоразу, зокрема
     на кожен кадр перетягування. */
  const tileRef = useCallback((node) => { setNodeRef(node); attachMeasure(node); }, [setNodeRef, attachMeasure]);


  /* Тягнеться вся картка, а не ручка.

     Крапки в кутку були єдиною зоною захвату, і це помилка: ціль
     розміром 15 на 14 пікселів у картці на пів-екрана. Людина бачить,
     що дошку можна переставляти, хапає віджет за середину — і нічого
     не відбувається. Тепер слухачі висять на всьому вузлі, а кнопки в
     шапці й панель налаштувань гасять pointerdown у себе, тож клік по
     шестерні лишається кліком.

     Другий шар — layout="position", і саме "position", а не звичайний
     layout. Різниця вирішальна. Звичайний layout анімує й розмір теж:
     коробка їде до нової ширини пружиною, а весь вміст масштабується
     разом із нею й вирівнюється лише в кінці — це те повзання, через
     яке шар довелось знімати минулого разу. Варіант "position" анімує
     тільки координати: розмір міняється миттєво, вміст не спотворю-
     ється, зате картка, яка переїжджає на місце видаленої, доїжджає
     плавно, а не стрибає.

     Без цього шару видалення виглядало неанімованим: сама картка
     чесно згасала, але решта сітки в ту ж мить перестрибувала на нові
     місця, і око читало саме стрибок. */
  return (
    <div
      ref={tileRef}
      {...(edit ? attributes : {})}
      {...(edit ? listeners : {})}
      style={{
        gridColumn: place ? `${place.c + 1} / span ${w}` : `span ${w}`,
        gridRow: place ? `${place.r + 1} / span ${place.h}` : `span ${unitsOf(tilePx(item.h))}`,
        /* Тільки зсув. Масштаб із трансформу викидаємо: картки різної
           ширини, і при обміні місцями бібліотека інакше розтягує
           вузьку під розмір широкої — віджет на мить роздувається. */
        transform: CSS.Translate.toString(transform),
        transition: transition || undefined,
        touchAction: edit ? 'none' : undefined,
        outline: 'none',
        zIndex: isDragging ? 0 : rest.openSettings ? 40 : 1,
        willChange: isDragging ? 'transform' : undefined,
      }}
    >
      <motion.div
        /* Поки картку тягнуть, layout вимкнено: інакше framer почне
           анімувати її до місця, яке щойно порахував dnd-kit, і вони
           будуть тягнути картку в різні боки. */
        layout={isDragging ? false : 'position'}
        transition={LAYOUT}
        style={{ height: '100%' }}
      >
        <CardShell
          item={item}
          fit={fit}
          renderW={w}
          edit={edit}
          removing={removing}
          hover={hover && !isDragging}
          lifted={isDragging}
          dropTarget={isOver && !isDragging}
          setHover={setHover}
          {...rest}
        />
      </motion.div>
    </div>
  );
}

/* Закріплена картка — та сама CardShell, але без dnd-kit: рядок унизу
   не сортується й не змінює розмір, тож тягнути й ресайзити тут
   нічого. */
function PinnedCard({ item, stats, edit, openSettings, onToggleSettings, onChange }) {
  const [hover, setHover] = useState(false);

  return (
    <CardShell
      item={item}
      stats={stats}
      edit={edit}
      hover={hover}
      setHover={setHover}
      openSettings={openSettings}
      onToggleSettings={onToggleSettings}
      onChange={onChange}
      draggable={false}
      removable={false}
      resizable={false}
    />
  );
}

function IconBtn({ children, onClick, title, danger, active, tone = P.acc }) {
  const [hover, setHover] = useState(false);
  const color = danger && hover ? P.bad : active ? tone : hover ? 'var(--edge-text)' : P.text5;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-state={active ? 'active' : hover ? 'hover' : 'idle'}
      style={{
        display: 'grid', placeItems: 'center', width: 27, height: 27, borderRadius: 9,
        cursor: 'pointer', color, border: `1px solid ${active ? mix(tone, 30) : 'transparent'}`,
        background: active ? mix(tone, 14) : hover ? (danger ? 'rgba(var(--edge-bad-rgb),0.12)' : 'rgba(var(--edge-hair-rgb),0.08)') : 'transparent',
        transition: 'all .16s',
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------
   Бібліотека

   Кожна картка тут одночасно кнопка й ручка: клік по ній додає
   віджет у кінець, перетягування — кладе на конкретне місце. Два
   способи, бо вони про різне: «хочу цей віджет» і «хочу цей віджет
   ось тут».
------------------------------------------------------------------ */

function AddPanel({ hidden, onAdd, onClose, stats }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 34, opacity: { duration: 0.18 } }}
      style={{ overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'relative', background: P.card, border: `1px solid ${P.line}`,
          borderRadius: 18, padding: '16px 0 18px', marginBottom: 14,
        }}
      >
        <span style={hairline()} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px', marginBottom: 14 }}>
          <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: 'var(--edge-text)', letterSpacing: '-0.2px' }}>
            Бібліотека
          </span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: P.dim }}>
            клікни, щоб додати в кінець, або перетягни на потрібне місце
          </span>
          <span style={{ height: 1, flex: 1, background: 'linear-gradient(90deg,var(--edge-line),transparent)' }} />
          <IconBtn title="Згорнути" onClick={onClose}><X size={14} /></IconBtn>
        </div>

        {!hidden.length ? (
          <p style={{ margin: 0, padding: '0 18px', fontFamily: F.sans, fontSize: 13, color: P.text5 }}>
            Усі віджети вже на дошці. Щоб звільнити місце, прибери зайві хрестиком.
          </p>
        ) : (
          <div
            className="ov-lib"
            style={{
              display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden',
              padding: '2px 18px 8px',
            }}
          >
            {hidden.map((id) => <LibCard key={id} id={id} onAdd={onAdd} stats={stats} />)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function LibCard({ id, onAdd, stats }) {
  const WIDGETS = useRegistry();
  const [hover, setHover] = useState(false);

  const w = WIDGETS[id];
  const tone = w.tone || P.acc;

  /* Готовність рахується від статистики «за весь час», а не від
     поточного фільтра дошки: якщо сетапи заповнені за минулий
     квартал, а зараз обраний «цей тиждень», картку не варто замикати
     через тимчасово порожній період. */
  const ready = w.ready ? w.ready(stats || {}) : true;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${id}`,
    data: { lib: id },
    disabled: !ready,
  });

  return (
    <div
      ref={setNodeRef}
      {...(ready ? listeners : {})}
      {...(ready ? attributes : {})}
      role="button"
      aria-disabled={!ready}
      tabIndex={0}
      title={ready ? w.hint : w.lockedHint || w.hint}
      data-state={!ready ? 'locked' : isDragging ? 'dragging' : hover ? 'hover' : 'idle'}
      onClick={() => { if (ready) onAdd(id); }}
      onKeyDown={(e) => { if (ready && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAdd(id); } }}
      onMouseMove={ready ? trackLight : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: ready ? 'grab' : 'not-allowed',
        display: 'flex', flexDirection: 'column', gap: 11, padding: 13,
        width: 214, flexShrink: 0, borderRadius: 16, touchAction: 'none',
        background: !ready ? 'rgba(var(--edge-hair-rgb),0.015)' : hover ? P.cardHi : 'rgba(var(--edge-hair-rgb),0.02)',
        border: `1px solid ${!ready ? P.lineSoft : hover ? mix(tone, 35) : P.lineSoft}`,
        /* Без підйому: у горизонтальному ряду картка, що вилазить
           угору, читається як збій прокрутки. */
        opacity: isDragging ? 0.35 : !ready ? 0.6 : 1,
        transition: CSS_SPRING,
      }}
    >
      <span aria-hidden style={lightLayer(tone, ready && hover && !isDragging, 200)} />

      <span
        style={{
          position: 'relative', display: 'block', padding: '11px 12px', borderRadius: 11,
          background: 'var(--edge-panel-glow, rgba(0,0,0,0.28))', border: `1px solid ${ready && hover ? mix(tone, 18) : 'rgba(var(--edge-hair-rgb),0.04)'}`,
          transition: 'border-color .2s',
          filter: !ready ? 'grayscale(0.6)' : 'none',
        }}
      >
        <Preview shape={w.shape} tone={tone} id={id} />
      </span>

      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        <w.icon size={13} color={!ready ? P.text5 : tone} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: !ready ? P.text3 : 'var(--edge-text)', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {w.title}
        </span>
        {!ready ? (
          <Lock size={12} color={P.text5} style={{ flexShrink: 0 }} />
        ) : (
          <Plus
            size={14}
            color={hover ? tone : P.dim}
            style={{ flexShrink: 0, transform: hover ? 'rotate(90deg)' : 'none', transition: 'all .28s' }}
          />
        )}
      </span>

      {/* Для заблокованої картки тут не опис віджета, а причина, чому
          його не можна додати, — те саме, що інакше зустріло б людину
          вже на дошці, порожнім блоком. */}
      <span
        style={{
          position: 'relative', fontFamily: F.sans, fontSize: 11.5, lineHeight: 1.45,
          color: !ready ? mix('var(--edge-warn)', 75) : P.text5, minHeight: 33,
        }}
      >
        {!ready ? w.lockedHint || w.hint : w.hint}
      </span>
    </div>
  );
}

/* Привид картки з бібліотеки — той самий вигляд, що й у списку. */
function LibGhost({ id }) {
  const WIDGETS = useRegistry();
  const w = WIDGETS[id];
  const tone = w.tone || P.acc;

  return (
    <div
      style={{
        width: 214, padding: 13, borderRadius: 16, cursor: 'grabbing',
        display: 'flex', flexDirection: 'column', gap: 11,
        background: P.cardHi, border: `1px solid ${mix(tone, 55)}`,
        boxShadow: `0 30px 60px -24px var(--edge-panel-glow, rgba(0,0,0,0.5)), 0 0 0 1px ${mix(tone, 24)}`,
        transform: 'rotate(-1.4deg)',
      }}
    >
      <span style={{ display: 'block', padding: '11px 12px', borderRadius: 11, background: 'var(--edge-panel-glow, rgba(0,0,0,0.28))', border: `1px solid ${mix(tone, 18)}` }}>
        <Preview shape={w.shape} tone={tone} id={`${id}-ghost`} />
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <w.icon size={13} color={tone} />
        <span style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: 'var(--edge-text)' }}>{w.title}</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------
   Розтягування самотніх плиток

   `row dense` чудово латає дірки посеред сітки — але не бачить наперед
   і нічим не заповнить те, що лишилось ПІСЛЯ останньої картки: там
   просто нікого поставити. Саме це й лишало порожні клітинки поруч із
   щойно доданим віджетом чи біля картки, в якої забрали сусіда.

   Тому та сама dense-розкладка рахується тут ще раз, наперед, у JS —
   і кожній картці, з якою в її власних рядках нікому ділити клітинку,
   віддається вся сусідня вільна ширина, а потім і висота до низу
   дошки — щоб розкладка лягала щільно, як тетріс, без порожніх
   клітинок під короткими плитками.

   Рахується наново з поточного layout на кожен рендер, тож щойно
   зʼявляється сусід — картка сама повертається до свого розміру. */

/* Розмір картки — завжди з реєстру, ніколи зі збереженої розкладки:
   людина його більше не обирає (SettingsPanel resizable=false), тож
   довіряти x.w/x.h із бази — довіряти випадковому числу з часів, коли
   резайз ще існував. cols обмежує ширину видимим числом колонок на
   вузькому екрані — інакше w:3 картка на телефоні (1 колонка) ніколи
   не знайшла б собі місця. */
function sizeOf(id, registry, cols = 4) {
  const spec = registry[id] || {};
  return {
    w: Math.min(Math.max(spec.defaultW || 1, 1), cols),
    h: Math.min(Math.max(spec.defaultH || 2, spec.minH || 1), 4),
  };
}

function computeStretch(boardLayout, registry, cols, heights = {}) {
  const items = boardLayout.map((item) => {
    const size = sizeOf(item.id, registry, cols);
    const spec = registry[item.id];
    /* Графік ставимо з мінімальною висотою (3 клітинки ≈ 300px), а
       не з повною: він однаково дотягнеться вниз до сусідів. Інакше
       висока колонка графіків задавала низ дошки, і короткий список
       поруч (серії, сетапи) доводилось роздувати на пів екрана. */
    const chart = growsWith(spec);
    const h = chart
      ? Math.max(3, unitsOf(tilePx(size.h)) - 1)
      : unitsOf(heights[item.id] ?? tilePx(size.h));
    return { id: item.id, w: size.w, h, base: h };
  });

  const rows = [];
  const ensure = (r) => { while (rows.length <= r) rows.push(new Array(cols).fill(null)); };
  const fits = (r, c, w, h) => {
    if (c + w > cols) return false;
    for (let rr = r; rr < r + h; rr++) {
      ensure(rr);
      for (let cc = c; cc < c + w; cc++) if (rows[rr][cc]) return false;
    }
    return true;
  };
  const place = (id, r, c, w, h) => {
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) rows[rr][cc] = id;
  };

  /* Куди класти плитку. Не просто найперше вільне місце: список чи
     число, покладене просто під графік, забирає в графіка право рости
     вниз — і порожнеча переїжджає під сусідній список, який потім
     доводиться роздувати. Тож для такої плитки місце під графіком
     «дорожче» на півтора ряду: якщо поруч є місце під іншим списком
     трохи нижче, вона стане туди, а графік лишиться вільним. */
  const isChart = (id) => growsWith(registry[id]);
  const placed = [];
  for (const it of items) {
    const chart = isChart(it.id);
    let best = null;
    const limit = Math.max(rows.length, 0) + it.h + 8;
    for (let r = 0; r < limit; r++) {
      if (best && r > best.score) break;
      for (let c = 0; c <= cols - it.w; c++) {
        if (!fits(r, c, it.w, it.h)) continue;
        let score = r;
        if (!chart && r > 0) {
          const above = new Set();
          for (let cc = c; cc < c + it.w; cc++) if (rows[r - 1]?.[cc]) above.add(rows[r - 1][cc]);
          if ([...above].some(isChart)) score += 1.5;
        }
        if (!best || score < best.score) best = { r, c, score };
      }
    }
    place(it.id, best.r, best.c, it.w, it.h);
    placed.push({ ...it, r: best.r, c: best.c });
  }

  /* Тетріс: після dense-розкладки кожна плитка забирає сусідні
     порожні клітинки — спершу вшир (вся її висота мусить бути
     вільною), потім униз, до низу дошки. Повторюємо, доки щось
     змінюється: розширення однієї відкриває місце для іншої. Низ —
     останній зайнятий ряд, тож дошка не росте, а лише закриває дірки.
     Позиції віддаються явно (row/col), а не span: інакше CSS dense
     переклав би розтягнуті плитки по-своєму й дірки повернулись би. */
  const total = placed.reduce((m, it) => Math.max(m, it.r + it.h), 0);
  ensure(total - 1);
  const free = (r, c) => r < total && !!rows[r] && rows[r][c] === null;
  const claim = (it, r0, r1, c0, c1) => { for (let rr = r0; rr < r1; rr++) for (let cc = c0; cc < c1; cc++) rows[rr][cc] = it.id; };

  const canGrow = (id) => growsWith(registry[id]);

  /* Два проходи. Перший: вшир усі, униз графіки без меж і решта на
     одну клітинку. Другий — лише для того, що лишилось: будь-яка
     плитка дотягується до низу, бо дірка в дошці гірша за трохи
     повітря під списком. */
  for (const pass of [1, 2]) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of placed) {
      const rowsOf = () => Array.from({ length: it.h }, (_, i) => it.r + i);
      while (it.c > 0 && rowsOf().every((r) => free(r, it.c - 1))) {
        claim(it, it.r, it.r + it.h, it.c - 1, it.c); it.c -= 1; it.w += 1; changed = true;
      }
      while (it.c + it.w < cols && rowsOf().every((r) => free(r, it.c + it.w))) {
        claim(it, it.r, it.r + it.h, it.c + it.w, it.c + it.w + 1); it.w += 1; changed = true;
      }
      /* Униз ростуть лише графіки: вони справді заповнюють висоту.
         Список із двох рядків чи одне число в картці на три ряди — це
         гігантська коробка з порожнечею, тож такі плитки лишаються
         свого розміру, а дірку під ними забирає сусід-графік. */
      /* Графік росте скільки завгодно; список чи число — щонайбільше
         на одну клітинку понад свій вміст, щоб закрити дрібну щілину,
         але не стати коробкою з порожнечею. */
      const maxH = canGrow(it.id) || pass === 2 ? Infinity : it.base + 1;
      const colsOf = () => Array.from({ length: it.w }, (_, i) => it.c + i);
      while (it.h < maxH && it.r + it.h < total && colsOf().every((c) => free(it.r + it.h, c))) {
        claim(it, it.r + it.h, it.r + it.h + 1, it.c, it.c + it.w); it.h += 1; changed = true;
      }
    }
  }

  }

  /* Підрізання низу. Заповнення могло дотягнути все до низу найвищої
     колонки — і тоді список поруч роздувався. Якщо в останньому ряду
     КОЖНА плитка має зайву висоту понад свій мінімум (графік — 3
     клітинки, решта — свій вміст), цей ряд зайвий: знімаємо його всім
     разом. Дірок не зʼявляється, бо зникає ряд цілком. */
  let bottom = placed.reduce((m, it) => Math.max(m, it.r + it.h), 0);
  while (bottom > 1) {
    const inRow = placed.filter((it) => it.r < bottom && it.r + it.h >= bottom);
    const coversAll = Array.from({ length: cols }, (_, c) => inRow.some((it) => c >= it.c && c < it.c + it.w)).every(Boolean);
    if (!coversAll || inRow.some((it) => it.h <= it.base)) break;
    inRow.forEach((it) => { it.h -= 1; });
    bottom -= 1;
  }

  const stretch = {};
  for (const it of placed) stretch[it.id] = { r: it.r, c: it.c, w: it.w, h: it.h };
  return stretch;
}

/* `--ov-cols` уже живе в CSS (media query нижче) — тут лише те саме
   правило дублюється для JS, бо розрахунку розтягування треба знати
   живу кількість колонок, а не саму лише формулу з span. */
function useCols() {
  const read = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return 4;
    if (window.matchMedia('(max-width: 719px)').matches) return 1;
    if (window.matchMedia('(max-width: 1279px)').matches) return 2;
    return 4;
  };
  const [cols, setCols] = useState(read);
  useEffect(() => {
    const mqNarrow = window.matchMedia('(max-width: 719px)');
    const mqMid = window.matchMedia('(max-width: 1279px)');
    const update = () => setCols(read());
    mqNarrow.addEventListener('change', update);
    mqMid.addEventListener('change', update);
    return () => {
      mqNarrow.removeEventListener('change', update);
      mqMid.removeEventListener('change', update);
    };
  }, []);
  return cols;
}

/* ==================================================================
   ДОШКА
================================================================== */

export default function Board({
  layout, setLayout, statsFor, saving,
  registry = WIDGETS, defaults = DEFAULT_LAYOUT, hint,
  /* Психологія малює цю дошку двічі: зліва — повний конструктор,
     справа — вузька приклеєна колонка з тим самим АІ-психологом,
     вердиктом і чек-листом, яка й не мала бути дошкою для
     перетягувань. editable=false ховає всю панель керування —
     без кнопки «Налаштувати» edit ніколи не стає true, і решта
     (drag, «Додати віджет», хрестики на картках) вимикається сама,
     бо вже й так висить на цьому самому стані. */
  editable = true,
  /* showGear=false ховає лише саму кнопку-шестерню з рядка керування
     (решта — «Додати віджет», «Скинути», підказка — лишається). Разом
     з controlled edit/onEditChange це дозволяє Психології винести
     кнопку з рядка над лівою дошкою нагору сторінки, над обома
     колонками, а не ховати редагування, як робить editable. */
  showGear = true,
  edit: controlledEdit,
  onEditChange,
}) {
  const [internalEdit, setInternalEdit] = useState(false);
  const edit = controlledEdit ?? internalEdit;
  const setEdit = onEditChange ?? setInternalEdit;
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const timer = useRef(0);

  const sensors = useSensors(
    /* Вісім пікселів, а не шість: тягнеться вся картка, і всередині
       неї є що натиснути. Менший поріг перетворював неточний клік по
       шестерні на початок перетягування. */
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  /* Закріплені віджети (План/Емоції/Звички в огляді) виходять із
     загальної сітки — не пропонуємо додати те, що й так завжди на
     місці. Позначені `pinned: true` на самому віджеті в ЦЬОМУ
     реєстрі, а не окремим списком id: список id, спільний для всіх
     дощок, одного разу вже зіткнувся з тим, що інший реєстр
     (perf/widgets.jsx) має свій widget з тим самим ключем 'emotions'
     і випадково ховав його з бібліотеки Перформансу. */
  const pinnedIds = useMemo(
    () => Object.keys(registry).filter((id) => registry[id]?.pinned),
    [registry],
  );

  const hidden = useMemo(
    () => Object.keys(registry).filter((id) => !pinnedIds.includes(id) && !layout.some((x) => x.id === id)),
    [layout, registry, pinnedIds],
  );

  const boardLayout = useMemo(() => layout.filter((x) => !pinnedIds.includes(x.id)), [layout, pinnedIds]);
  const pinnedLayout = useMemo(
    () => pinnedIds.map((id) => layout.find((x) => x.id === id)).filter(Boolean),
    [layout, pinnedIds],
  );

  const ids = useMemo(() => boardLayout.map((x) => x.id), [boardLayout]);
  const libId = typeof activeId === 'string' && activeId.startsWith('lib:') ? activeId.slice(4) : null;
  const activeItem = activeId && !libId ? layout.find((x) => x.id === activeId) : null;

  const cols = useCols();
  const [heights, setHeights] = useState({});
  /* Дрібні коливання (субпіксельне округлення, ховер-рамка) не мають
     перекладати дошку — лише справжня зміна вмісту. */
  const reportHeight = useCallback((id, px) => {
    setHeights((prev) => (Math.abs((prev[id] || 0) - px) <= 2 ? prev : { ...prev, [id]: px }));
  }, []);
  const stretch = useMemo(
    () => computeStretch(boardLayout, registry, cols, heights),
    [boardLayout, registry, cols, heights],
  );

  useEffect(() => {
    if (!edit) { setAdding(false); setOpenId(null); setActiveId(null); }
  }, [edit]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const patchById = (id, item) => setLayout((prev) => prev.map((x) => (x.id === id ? item : x)));

  /* Спершу картка згасає власним переходом, і лише потім зникає з
     масиву. Миттєве видалення виглядало так, ніби сітка смикнулась
     сама по собі. */
  const remove = (id) => {
    if (registry[id]?.pinned) return;
    setOpenId(null);
    setRemovingId(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLayout((prev) => prev.filter((x) => x.id !== id));
      setRemovingId(null);
    }, REMOVE_MS);
  };

  const add = (id, at) => {
    if (registry[id]?.pinned) return;
    /* Друга лінія оборони: LibCard сама не віддає drag/click для
       заблокованої картки, але перетягування — окремий, асинхронний
       шлях (onDragEnd), і краще перевірити ще раз тут, ніж довіряти
       тому, що подія просто не мала статись. */
    if (registry[id]?.ready && !registry[id].ready(statsFor('all'))) return;
    setLayout((prev) => {
      if (prev.some((x) => x.id === id)) return prev;
      const item = { id, w: registry[id].defaultW || 1, h: registry[id].defaultH || 2 };
      if (at == null || at < 0) return [...prev, item];
      const next = [...prev];
      next.splice(at, 0, item);
      return next;
    });
  };

  const onDragEnd = ({ active: a, over }) => {
    setActiveId(null);
    if (!over) return;

    /* Прийшло з бібліотеки — вставляємо на місце тієї картки, над
       якою відпустили. */
    const fromLib = a.data.current?.lib;
    if (fromLib) {
      const at = layout.findIndex((x) => x.id === over.id);
      add(fromLib, at);
      return;
    }

    /* Переставляємо, а не міняємо місцями.
       Обмін двох плиток різного розміру змушував dense перекласти
       половину сітки навколо різниці в розмірі — саме це й виглядало
       «криво». Вставлення на місце — той самий жест, що в звичайному
       сортованому списку: картка встає туди, куди її кинули, а решта
       лише зсувається, звільняючи місце. */
    if (a.id === over.id) return;
    setLayout((prev) => {
      const from = prev.findIndex((x) => x.id === a.id);
      const to = prev.findIndex((x) => x.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  };

  return (
    <RegistryCtx.Provider value={registry}>
    <div>
      <style>{`
        .ov-board{ --ov-cols: 4 }
        @media (max-width: 1279px){ .ov-board{ --ov-cols: 2 } }
        @media (max-width: 719px){ .ov-board{ --ov-cols: 1 } }

        /* Закріплена трійка — рівні третини на всю ширину, незалежно
           від сітки над нею: чверть на три картки не ділиться. */
        .ov-pinned{ grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(260px, auto) }
        @media (max-width: 1279px){ .ov-pinned{ grid-template-columns: 1fr } }

        .ov-body::-webkit-scrollbar{ width: 5px }
        .ov-body::-webkit-scrollbar-track{ background: transparent }
        .ov-body::-webkit-scrollbar-thumb{ background: transparent; border-radius: 99px }
        .ov-body:hover::-webkit-scrollbar-thumb{ background: #2a2a35 }

        .ov-lib::-webkit-scrollbar{ height: 6px }
        .ov-lib::-webkit-scrollbar-track{ background: transparent }
        .ov-lib::-webkit-scrollbar-thumb{ background: var(--edge-line); border-radius: 99px }
        .ov-lib:hover::-webkit-scrollbar-thumb{ background: var(--edge-line-hi) }
      `}</style>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToWindowEdges]}
        onDragStart={({ active: a }) => { setActiveId(a.id); setOpenId(null); }}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* ---------- рядок керування ----------
            Без гвинтика й поза редагуванням рядку нема чого показати:
            «Додати віджет»/«Скинути» самі ховаються без edit, і 44px
            висоти лишались би порожньою смугою над картками
            (Психологія ховає саме гвинтик, кнопка стоїть нагорі
            сторінки, над обома колонками). */}
        {editable && (showGear || edit) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16, flexWrap: 'wrap', minHeight: 44 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {edit && (
              <motion.div
                key="tools"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={POP}
                style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}
              >
                <ToolButton icon={Plus} onClick={() => setAdding((v) => !v)} active={adding}>
                  Додати віджет
                  {hidden.length > 0 && (
                    <span style={{ fontFamily: F.mono, fontSize: 11, color: P.accSoft, marginLeft: 2 }}>
                      {hidden.length}
                    </span>
                  )}
                </ToolButton>

                <ToolButton icon={RotateCcw} onClick={() => setLayout(defaults)}>
                  Скинути
                </ToolButton>

                <span style={{ fontFamily: F.sans, fontSize: 12.5, color: P.dim }}>
                  Тягни картку на потрібне місце
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <span style={{ flex: 1 }} />

          <AnimatePresence>
            {saving && (
              <motion.span
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ fontFamily: F.sans, fontSize: 12, color: P.dim }}
              >
                зберігаю…
              </motion.span>
            )}
          </AnimatePresence>

          {/* Кнопка без підпису.

              «Налаштувати» — слово, яке пояснює шестерню, а шестерня
              не потребує пояснення: це найвпізнаваніша іконка в
              інтерфейсах узагалі. Підпис займав місце в рядку, який і
              так тісний, і тягнув на себе увагу нарівні з даними —
              хоча відкривають цю дошку не заради нього. */}
          {showGear && (
            <ToolButton
              icon={edit ? Check : Cog}
              title={edit ? 'Готово' : 'Налаштувати дошку'}
              onClick={() => setEdit((v) => !v)}
              primary={edit}
              iconOnly
            />
          )}
        </div>
        )}

        <AnimatePresence>
          {edit && adding && <AddPanel hidden={hidden} onAdd={(id) => add(id)} onClose={() => setAdding(false)} stats={statsFor('all')} />}
        </AnimatePresence>

        {/* ---------- сітка ---------- */}
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div
            className="ov-board"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(var(--ov-cols, 4), minmax(0, 1fr))',
              gridAutoRows: `${CELL}px`,
              /* dense — те, заради чого все це. Без нього плитка, яка
                 не влізла поруч, чекає кінця найвищої сусідки, і під
                 короткими лишаються дірки. З ним вона заповзає в
                 найближчу вільну щілину, бо всі розміри кратні одній
                 клітинці й будь-яка щілина комусь пасує. */
              gridAutoFlow: 'row dense',
              gap: GAP,
            }}
          >
            {boardLayout.map((item) => (
              <SortableCard
                key={item.id}
                item={{
                  ...item,
                  /* Не item.w/item.h — сам реєстр. Розмір більше не
                     людське рішення (settings resizable=false вище),
                     тож і читати збережене число нема сенсу: стара
                     розкладка могла тримати випадкове w:4 чи h:3 із
                     часів, коли резайз ще існував. */
                  ...sizeOf(item.id, registry, cols),
                }}
                place={stretch[item.id]}
                fit={!growsWith(registry[item.id])}
                onMeasure={reportHeight}
                stats={statsFor(item.p)}
                edit={edit}
                removing={removingId === item.id}
                openSettings={openId === item.id}
                onRemove={() => remove(item.id)}
                onToggleSettings={() => setOpenId((v) => (v === item.id ? null : item.id))}
                onChange={(next) => patchById(item.id, next)}
              />
            ))}
          </div>
        </SortableContext>

        {/* ---------- закріплена трійка ---------- */}
        <div className="ov-pinned" style={{ display: 'grid', gap: GAP, marginTop: GAP }}>
          {pinnedLayout.map((item) => (
            <PinnedCard
              key={item.id}
              item={item}
              stats={statsFor(item.p)}
              edit={edit}
              openSettings={openId === item.id}
              onToggleSettings={() => setOpenId((v) => (v === item.id ? null : item.id))}
              onChange={(next) => patchById(item.id, next)}
            />
          ))}
        </div>

        {/* Портал до body: сторінка аналітики має анімацію появи з
            transform, а будь-який transform у предка робить його новим
            початком координат для position: fixed — і привид їхав не
            за пальцем, а зі зсувом. */}
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }}>
            {libId && <LibGhost id={libId} />}
            {activeItem && (
              <CardShell
                item={activeItem}
                renderW={sizeOf(activeItem.id, registry, cols).w}
                stats={statsFor(activeItem.p)}
                edit
                overlay
              />
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      {!layout.length && (
        <div
          style={{
            display: 'grid', placeItems: 'center', padding: '72px 20px', borderRadius: 20,
            border: `1px dashed ${P.line}`, textAlign: 'center',
          }}
        >
          <span style={{ fontFamily: F.display, fontSize: 19, fontWeight: 700, color: P.text2, marginBottom: 8 }}>
            Дошка порожня
          </span>
          <p style={{ margin: '0 0 18px', fontFamily: F.sans, fontSize: 13.5, color: P.text5, maxWidth: 380 }}>
            Прибрано все. Додай віджети назад або поверни початкову розкладку.
          </p>
          <ToolButton icon={RotateCcw} onClick={() => setLayout(defaults)} primary>
            Повернути як було
          </ToolButton>
        </div>
      )}
    </div>
    </RegistryCtx.Provider>
  );
}

export function ToolButton({ icon: Icon, children, onClick, active, primary, iconOnly, title }) {
  const [hover, setHover] = useState(false);

  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        data-state={hover ? 'hover' : 'idle'}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center',
          justifyContent: 'center', gap: iconOnly ? 0 : 9,
          height: 42, width: iconOnly ? 42 : undefined,
          padding: iconOnly ? 0 : '0 20px', borderRadius: 13, border: 0, cursor: 'pointer',
          overflow: 'hidden', whiteSpace: 'nowrap',
          background: `linear-gradient(180deg, ${hover ? 'var(--edge-acc), var(--edge-acc)' : 'var(--edge-acc), var(--edge-acc)'})`,
          boxShadow: hover
            ? `0 18px 40px -14px ${A(0.85)}, inset 0 1px 0 rgba(var(--edge-text-rgb),0.3)`
            : `0 12px 30px -14px ${A(0.7)}, inset 0 1px 0 rgba(var(--edge-text-rgb),0.2)`,
          transform: `translateY(${hover ? '-2px' : '0'})`,
          transition: CSS_SPRING,
        }}
      >
        <span style={{ position: 'absolute', insetInline: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(var(--edge-text-rgb),0.6),transparent)' }} />
        <Icon size={iconOnly ? 16 : 14} strokeWidth={2.4} color="var(--edge-text)" />
        {!iconOnly && (
          <span style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: 'var(--edge-text)', letterSpacing: '-0.1px' }}>
            {children}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-state={active ? 'active' : hover ? 'hover' : 'idle'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: iconOnly ? 0 : 8, cursor: 'pointer',
        height: 42, width: iconOnly ? 42 : undefined,
        padding: iconOnly ? 0 : '0 15px', borderRadius: 13, whiteSpace: 'nowrap',
        fontFamily: F.sans, fontSize: 13, fontWeight: 600,
        color: active || hover ? 'var(--edge-text)' : P.text3,
        background: active ? A(0.17) : hover ? 'rgba(var(--edge-hair-rgb),0.08)' : 'rgba(var(--edge-hair-rgb),0.04)',
        border: `1px solid ${active ? A(0.5) : hover ? P.lineHover : 'var(--edge-line)'}`,
        transition: 'all .16s',
      }}
    >
      {/* Шестерня повільно докручується під курсором — рівно
          настільки, щоб було помітно, що кнопка жива, і не настільки,
          щоб на це відволікатись. */}
      <Icon
        size={iconOnly ? 16 : 14}
        strokeWidth={2.2}
        style={iconOnly ? { transform: hover ? 'rotate(45deg)' : 'none', transition: 'transform .4s cubic-bezier(.22,1,.36,1)' } : undefined}
      />
      {!iconOnly && children}
    </button>
  );
}
