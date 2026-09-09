import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, useDraggable, useSensor, useSensors,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { SortableContext, rectSwappingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check, Cog, GripVertical, Plus, RotateCcw, X,
} from 'lucide-react';
import { A, CSS_SPRING, F, LAYOUT, P, POP, en, hairline, lightLayer, trackLight } from './theme';
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
                letterSpacing: '-0.1px', color: on ? '#fff' : P.text5,
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
                    borderRadius: 2, background: tone, boxShadow: `0 0 8px ${tone}99`,
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
                background: on ? `${tone}2e` : '#ffffff08',
                border: `1px solid ${n === value ? `${tone}8c` : on ? `${tone}3d` : 'transparent'}`,
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
function HeightPicker({ value, tone, onPick }) {
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
          return (
            <button
              key={n}
              type="button"
              aria-label={`Height ${HEIGHT_LABEL[n]}`}
              data-state={n === value ? 'active' : on ? 'filled' : 'idle'}
              onClick={() => onPick(n)}
              style={{
                flex: 1, height: 24, borderRadius: 7, cursor: 'pointer',
                background: on ? `${tone}2e` : '#ffffff08',
                border: `1px solid ${n === value ? `${tone}8c` : on ? `${tone}3d` : 'transparent'}`,
                transition: 'all .18s',
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

function SettingsPanel({ id, item, onChange, onClose }) {
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
        border: '1px solid #ffffff14', borderRadius: 16,
        padding: '15px 16px 17px', display: 'flex', flexDirection: 'column', gap: 17,
        boxShadow: '0 24px 60px -18px rgba(0,0,0,.85)',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: 99, background: tone, flexShrink: 0 }} />
        <span style={{ flex: 1, fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: '#fff', letterSpacing: '-0.1px' }}>
          {en(spec.title)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, border: 0, background: 'transparent', cursor: 'pointer', color: P.dim }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = P.dim; }}
        >
          <X size={13} />
        </button>
      </div>

      <WidthPicker value={item.w} tone={tone} onPick={(n) => set({ w: n })} />
      <HeightPicker value={item.h} tone={tone} onPick={(n) => set({ h: n })} />

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
  setHover, onRemove, onToggleSettings, onChange,
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
        border: `1px solid ${overlay || dropTarget || hover ? `${tone}59` : P.line}`,
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
          ? `0 40px 80px -28px #000000e6, 0 0 0 1px ${tone}3d`
          : dropTarget ? `0 0 0 2px ${tone}66, 0 0 34px -6px ${tone}4d` : 'none',
        cursor: overlay || lifted ? 'grabbing' : edit ? 'grab' : 'default',
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
          {(edit || overlay) && (
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
              fontFamily: F.mono, fontSize: 9.5, letterSpacing: '.8px', color: `${tone}e6`,
              background: `${tone}1f`, border: `1px solid ${tone}3d`, borderRadius: 999,
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
              <IconBtn title="Remove" danger onClick={onRemove}>
                <X size={13} />
              </IconBtn>
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      {/* Вміст живе всередині плитки, а не навпаки.

          `minHeight: 0` обовʼязковий: без нього flex-елемент не має
          права стати меншим за свій вміст, і висока картка просто
          вилізла б за межі плитки замість того, щоб віддати графіку
          рівно те місце, яке лишилось.

          Прокрутка тут — запобіжник, а не спосіб дивитись віджет:
          якщо людина поставила плитці висоту S, а всередині список на
          сім правил, краще дати прокрутку, ніж обрізати текст. */}
      <div
        className="ov-body"
        style={{
          position: 'relative', flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          overflowY: 'auto', overflowX: 'hidden',
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
          w: item.w,
          hover: !!hover || !!overlay,
        })}
      </div>

      <AnimatePresence>
        {openSettings && !overlay && (
          <SettingsPanel id={item.id} item={item} onChange={onChange} onClose={onToggleSettings} />
        )}
      </AnimatePresence>
    </div>
  );
}

function SortableCard({ item, edit, removing, ...rest }) {
  const [hover, setHover] = useState(false);
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging, isOver,
  } = useSortable({ id: item.id, disabled: !edit });


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
      ref={setNodeRef}
      {...(edit ? attributes : {})}
      {...(edit ? listeners : {})}
      style={{
        gridColumn: `span ${item.w}`,
        gridRow: `span ${item.h}`,
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

function IconBtn({ children, onClick, title, danger, active, tone = P.acc }) {
  const [hover, setHover] = useState(false);
  const color = danger && hover ? P.bad : active ? tone : hover ? '#fff' : P.text5;

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
        cursor: 'pointer', color, border: `1px solid ${active ? `${tone}4d` : 'transparent'}`,
        background: active ? `${tone}24` : hover ? (danger ? '#ff7b7b1f' : '#ffffff14') : 'transparent',
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

function AddPanel({ hidden, onAdd, onClose }) {
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
          <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-0.2px' }}>
            Бібліотека
          </span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: P.dim }}>
            клікни, щоб додати в кінець, або перетягни на потрібне місце
          </span>
          <span style={{ height: 1, flex: 1, background: 'linear-gradient(90deg,#26262f,transparent)' }} />
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
            {hidden.map((id) => <LibCard key={id} id={id} onAdd={onAdd} />)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function LibCard({ id, onAdd }) {
  const WIDGETS = useRegistry();
  const [hover, setHover] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib:${id}`,
    data: { lib: id },
  });

  const w = WIDGETS[id];
  const tone = w.tone || P.acc;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      title={w.hint}
      data-state={isDragging ? 'dragging' : hover ? 'hover' : 'idle'}
      onClick={() => onAdd(id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(id); } }}
      onMouseMove={trackLight}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: 'grab',
        display: 'flex', flexDirection: 'column', gap: 11, padding: 13,
        width: 214, flexShrink: 0, borderRadius: 16, touchAction: 'none',
        background: hover ? P.cardHi : '#ffffff05',
        border: `1px solid ${hover ? `${tone}59` : P.lineSoft}`,
        /* Без підйому: у горизонтальному ряду картка, що вилазить
           угору, читається як збій прокрутки. */
        opacity: isDragging ? 0.35 : 1,
        transition: CSS_SPRING,
      }}
    >
      <span aria-hidden style={lightLayer(tone, hover && !isDragging, 200)} />

      <span
        style={{
          position: 'relative', display: 'block', padding: '11px 12px', borderRadius: 11,
          background: '#00000047', border: `1px solid ${hover ? `${tone}2e` : '#ffffff0a'}`,
          transition: 'border-color .2s',
        }}
      >
        <Preview shape={w.shape} tone={tone} id={id} />
      </span>

      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
        <w.icon size={13} color={tone} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {w.title}
        </span>
        <Plus
          size={14}
          color={hover ? tone : P.dim}
          style={{ flexShrink: 0, transform: hover ? 'rotate(90deg)' : 'none', transition: 'all .28s' }}
        />
      </span>

      <span style={{ position: 'relative', fontFamily: F.sans, fontSize: 11.5, lineHeight: 1.45, color: P.text5, minHeight: 33 }}>
        {w.hint}
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
        background: P.cardHi, border: `1px solid ${tone}8c`,
        boxShadow: `0 30px 60px -24px #000, 0 0 0 1px ${tone}3d`,
        transform: 'rotate(-1.4deg)',
      }}
    >
      <span style={{ display: 'block', padding: '11px 12px', borderRadius: 11, background: '#00000047', border: `1px solid ${tone}2e` }}>
        <Preview shape={w.shape} tone={tone} id={`${id}-ghost`} />
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <w.icon size={13} color={tone} />
        <span style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{w.title}</span>
      </span>
    </div>
  );
}

/* ==================================================================
   ДОШКА
================================================================== */

export default function Board({
  layout, setLayout, statsFor, saving,
  registry = WIDGETS, defaults = DEFAULT_LAYOUT, hint,
}) {
  const [edit, setEdit] = useState(false);
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

  const hidden = useMemo(
    () => Object.keys(registry).filter((id) => !layout.some((x) => x.id === id)),
    [layout, registry],
  );

  const ids = useMemo(() => layout.map((x) => x.id), [layout]);
  const libId = typeof activeId === 'string' && activeId.startsWith('lib:') ? activeId.slice(4) : null;
  const activeItem = activeId && !libId ? layout.find((x) => x.id === activeId) : null;

  useEffect(() => {
    if (!edit) { setAdding(false); setOpenId(null); setActiveId(null); }
  }, [edit]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const patch = (index, item) => setLayout((prev) => prev.map((x, i) => (i === index ? item : x)));

  /* Спершу картка згасає власним переходом, і лише потім зникає з
     масиву. Миттєве видалення виглядало так, ніби сітка смикнулась
     сама по собі. */
  const remove = (id) => {
    setOpenId(null);
    setRemovingId(id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLayout((prev) => prev.filter((x) => x.id !== id));
      setRemovingId(null);
    }, REMOVE_MS);
  };

  const add = (id, at) => {
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

    if (a.id === over.id) return;
    setLayout((prev) => {
      const from = prev.findIndex((x) => x.id === a.id);
      const to = prev.findIndex((x) => x.id === over.id);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  return (
    <RegistryCtx.Provider value={registry}>
    <div>
      <style>{`
        .ov-board{ --ov-cols: 4 }
        @media (max-width: 1279px){ .ov-board{ --ov-cols: 2 } }
        @media (max-width: 719px){ .ov-board{ --ov-cols: 1 } }

        .ov-body::-webkit-scrollbar{ width: 5px }
        .ov-body::-webkit-scrollbar-track{ background: transparent }
        .ov-body::-webkit-scrollbar-thumb{ background: transparent; border-radius: 99px }
        .ov-body:hover::-webkit-scrollbar-thumb{ background: #2a2a35 }

        .ov-lib::-webkit-scrollbar{ height: 6px }
        .ov-lib::-webkit-scrollbar-track{ background: transparent }
        .ov-lib::-webkit-scrollbar-thumb{ background: #23232e; border-radius: 99px }
        .ov-lib:hover::-webkit-scrollbar-thumb{ background: #33333f }
      `}</style>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToWindowEdges]}
        onDragStart={({ active: a }) => { setActiveId(a.id); setOpenId(null); }}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* ---------- рядок керування ---------- */}
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
                  Тягни картку — віджети поміняються місцями
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
          <ToolButton
            icon={edit ? Check : Cog}
            title={edit ? 'Готово' : 'Налаштувати дошку'}
            onClick={() => setEdit((v) => !v)}
            primary={edit}
            iconOnly
          />
        </div>

        <AnimatePresence>
          {edit && adding && <AddPanel hidden={hidden} onAdd={(id) => add(id)} onClose={() => setAdding(false)} />}
        </AnimatePresence>

        {/* ---------- сітка ---------- */}
        <SortableContext items={ids} strategy={rectSwappingStrategy}>
          <div
            className="ov-board"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(var(--ov-cols, 4), minmax(0, 1fr))',
              gridAutoRows: `${ROW_H}px`,
              /* dense — те, заради чого все це. Без нього плитка, яка
                 не влізла поруч, чекає кінця найвищої сусідки, і під
                 короткими лишаються дірки. З ним вона заповзає в
                 найближчу вільну щілину, бо всі розміри кратні одній
                 клітинці й будь-яка щілина комусь пасує. */
              gridAutoFlow: 'row dense',
              gap: GAP,
            }}
          >
            {layout.map((item, i) => (
              <SortableCard
                key={item.id}
                item={{
                  ...item,
                  w: Math.min(Math.max(item.w || 1, 1), 4),
                  h: Math.min(Math.max(item.h || registry[item.id]?.defaultH || 2, 1), 4),
                }}
                stats={statsFor(item.p)}
                edit={edit}
                removing={removingId === item.id}
                openSettings={openId === item.id}
                onRemove={() => remove(item.id)}
                onToggleSettings={() => setOpenId((v) => (v === item.id ? null : item.id))}
                onChange={(next) => patch(i, next)}
              />
            ))}
          </div>
        </SortableContext>

        {/* Портал до body: сторінка аналітики має анімацію появи з
            transform, а будь-який transform у предка робить його новим
            початком координат для position: fixed — і привид їхав не
            за пальцем, а зі зсувом. */}
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }}>
            {libId && <LibGhost id={libId} />}
            {activeItem && <CardShell item={activeItem} stats={statsFor(activeItem.p)} edit overlay />}
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

function ToolButton({ icon: Icon, children, onClick, active, primary, iconOnly, title }) {
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
          background: `linear-gradient(180deg, ${hover ? '#6355ff, #4a3bf5' : '#5546f8, #3f30e8'})`,
          boxShadow: hover
            ? `0 18px 40px -14px ${A(0.85)}, inset 0 1px 0 #ffffff4d`
            : `0 12px 30px -14px ${A(0.7)}, inset 0 1px 0 #ffffff33`,
          transform: `translateY(${hover ? '-2px' : '0'})`,
          transition: CSS_SPRING,
        }}
      >
        <span style={{ position: 'absolute', insetInline: 0, top: 0, height: 1, background: 'linear-gradient(90deg,transparent,#ffffff99,transparent)' }} />
        <Icon size={iconOnly ? 16 : 14} strokeWidth={2.4} color="#fff" />
        {!iconOnly && (
          <span style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: '#fff', letterSpacing: '-0.1px' }}>
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
        color: active || hover ? '#fff' : P.text3,
        background: active ? A(0.17) : hover ? '#ffffff14' : '#ffffff0a',
        border: `1px solid ${active ? A(0.5) : hover ? P.lineHover : '#21212b'}`,
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
