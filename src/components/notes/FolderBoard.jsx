import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Pin, X, Plus, Sparkles, Smile } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { FOLDER_COLORS, NO_FOLDER } from '../../lib/foldersStore';
import EmojiPicker from '../ui/EmojiPicker';

/* ==================================================================
   Полиця з папками.

   Розкладка, розміри й ховери — з макета, один в один. Від проєкту
   тут лишились шрифти й тло сторінки.

   Дві принципові речі, перш ніж щось міняти.

   Перше: сітка — звичайний CSS grid, а не абсолютні координати.
   Попередня версія рахувала позицію кожної картки вручну й
   доїжджала до неї анімацією. Коли анімація не відбувалась — рух
   вимкнено в налаштуваннях, вкладка не в фокусі, розкладка
   змінилась двічі поспіль — картки лишались там, де їх застав
   кадр: у сітці зяяли діри, а сусіди накладались одне на одного.
   Тепер розкладку рахує браузер, і зламати її анімацією неможливо.

   Друге: перетягування — рідне браузерне, як у макеті. Порядок
   переставляється, поки картка йде над сусідами, і зберігається на
   відпусканні. Жодних ручних координат і застряглих трансформів:
   кінець жесту гарантує браузер.
================================================================== */

const ICON_PATHS = {
  folder: ['M3.4 7.2a2 2 0 012-2h3.3l1.7 2h6.2a2 2 0 012 2v7.6a2 2 0 01-2 2H5.4a2 2 0 01-2-2V7.2z'],
  book: ['M5 4.5h9.4a2 2 0 012 2v13H7a2 2 0 01-2-2v-13z', 'M5 17.5a2 2 0 012-2h9.4'],
  chart: ['M4.5 19.5V9M10 19.5V4.5M15.5 19.5v-7M21 19.5v-4'],
  tray: [
    'M3.6 13.4h4l1.2 2.2h6.4l1.2-2.2h4',
    'M3.6 13.4l2.6-7a1.8 1.8 0 011.7-1.2h8.2a1.8 1.8 0 011.7 1.2l2.6 7v3.6a1.8 1.8 0 01-1.8 1.8H5.4a1.8 1.8 0 01-1.8-1.8v-3.6z',
  ],
};

/* Іконка не зберігається в базі, але випадковою бути не має: одна й
   та сама папка повинна виглядати однаково між заходами. Тому
   виводимо її з id — стабільно й без міграції. */
const ICON_KEYS = ['folder', 'book', 'chart', 'tray'];
const iconOf = (id) => {
  const s = String(id);
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) % 997;
  return ICON_KEYS[n % ICON_KEYS.length];
};

const FolderIcon = ({ name, color, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {(ICON_PATHS[name] || ICON_PATHS.folder).map((d) => (
      <path key={d} d={d} stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </svg>
);

/* Акцент у темі — CSS-змінна, а не hex. Тому альфу до неї не можна
   дописати рядком: `var(--edge-acc)8c` браузер просто викидає, і
   замість напівпрозорого бордера виходить його відсутність. Саме так
   зникав ховер на пошуку й на картці «Нова папка». */
const A = (a) => `rgba(${T.accRgb}, ${a})`;

/* Вікно стоїть по центру робочої області, а не екрана: зліва бічна
   панель застосунку, і центр екрана — не той центр, який видно. */
function useContentBox() {
  const [box, setBox] = useState(null);

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return undefined;

    const measure = () => {
      const r = main.getBoundingClientRect();
      setBox({ left: r.left, width: r.width });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(main);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  return box;
}

const SPRING = 'transform .34s cubic-bezier(.22,1.2,.36,1), border-color .2s, background .2s, box-shadow .28s, opacity .2s';


const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

const metaOf = (count) => (count ? `${count} ${plural(count, 'запис', 'записи', 'записів')}` : 'Порожня');

const move = (arr, from, to) => {
  if (from === to || from < 0 || to < 0) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/* ---------- дії на картці ---------- */

const PATHS = {
  pin: 'M9 4h6M12 4v7M12 11l-4 4.4V17h8v-1.6L12 11zM12 17v3',
  pencil: 'M16.4 4.6l3 3-9.6 9.6-3.8.8.8-3.8L16.4 4.6z',
  trash: 'M4.5 7h15M9.5 7V5.4A1.4 1.4 0 0110.9 4h2.2A1.4 1.4 0 0114.5 5.4V7M7 7l.8 12.1A1.5 1.5 0 009.3 20.5h5.4a1.5 1.5 0 001.5-1.4L17 7',
};

const Grip = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
  </svg>
);

/* Небезпечна дія червоніє, решта світлішає: колір тут єдине, що
   відрізняє «перейменувати» від «видалити», поки іконку ще не
   роздивились. */
function ActionBtn({ title, onClick, danger, active, d }) {
  const [hov, setHov] = useState(false);
  const on = active || hov;

  return (
    <div
      role="button"
      tabIndex={-1}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: 31,
        height: 31,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all .16s',
        background: danger && hov ? '#ff8f8f24' : active ? `${A(0.19)}` : on ? '#ffffff1a' : '#ffffff0d',
        border: `1px solid ${danger && hov ? '#ff8f8f66' : active ? `${A(0.50)}` : on ? '#42424f' : '#2c2c38'}`,
        color: danger && hov ? '#ff9d9d' : active ? '#b3a8ff' : on ? '#ffffff' : '#a5a3b3',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d={d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Actions({ pinned, onPin, onEdit, onDelete, style }) {
  return (
    <div style={style}>
      <ActionBtn title={pinned ? 'Відкріпити' : 'Закріпити'} onClick={onPin} active={pinned} d={PATHS.pin} />
      <ActionBtn title="Перейменувати" onClick={onEdit} d={PATHS.pencil} />
      <ActionBtn title="Видалити" onClick={onDelete} danger d={PATHS.trash} />
      <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f5d6c', cursor: 'grab' }} title="Перетягнути">
        <Grip />
      </div>
    </div>
  );
}

/* ---------- картка в плитці ---------- */

function Card({ folder, count, preview, updated, color, dragging, plain, onOpen, onPin, onEdit, onDelete, dnd }) {
  const [hov, setHov] = useState(false);
  const c = color;
  const empty = !count;

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex' }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div
        draggable={!plain}
        onClick={onOpen}
        title={plain ? 'Це не папка, а місце для записів без папки. Зникне сама, щойно розкладеш їх по папках.' : undefined}
        {...dnd}
        style={{
          position: 'relative',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: '20px 22px',
          borderRadius: 20,
          background: `linear-gradient(165deg, ${hov ? '#16151f' : '#121218'}, #0b0b10)`,
          border: `1px solid ${hov ? `${c}70` : '#20202a'}`,
          cursor: 'pointer',
          transition: SPRING,
          boxShadow: hov ? `0 28px 54px -24px ${c}80, 0 0 0 1px ${c}1f` : '0 14px 30px -22px #000000cc',
          transform: dragging ? 'scale(.96) rotate(-1.4deg)' : hov ? 'translateY(-6px)' : 'none',
          opacity: dragging ? 0.5 : 1,
        }}
      >
        {/* язичок кольору — те, за чим папку впізнають боковим зором */}
        <div
          style={{
            position: 'absolute',
            left: 22,
            top: 0,
            width: 52,
            height: 4,
            borderRadius: '0 0 5px 5px',
            background: c,
            boxShadow: `0 0 16px 2px ${c}${hov ? 'aa' : '44'}`,
            opacity: hov ? 1 : 0.7,
            transition: 'all .24s',
          }}
        />
        <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 1, background: 'linear-gradient(90deg,transparent,#ffffff2e 30%,#ffffff2e 70%,transparent)' }} />
        <div
          style={{
            position: 'absolute',
            left: -50,
            top: -80,
            width: 240,
            height: 200,
            borderRadius: '50%',
            background: c,
            filter: 'blur(62px)',
            opacity: hov ? 0.2 : 0.06,
            transition: 'opacity .26s',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 46,
              height: 46,
              borderRadius: 14,
              background: hov ? `${c}26` : '#ffffff0a',
              border: `1px solid ${hov ? `${c}5e` : '#26262f'}`,
              boxShadow: hov ? `inset 0 1px 0 ${c}55` : 'inset 0 1px 0 #ffffff0f',
              transition: 'all .22s',
            }}
          >
            {folder.icon
              ? <span className="text-[20px]">{folder.icon}</span>
              : <FolderIcon name={iconOf(folder.id)} color={hov ? c : '#8f8da0'} />}
          </div>

          {/* «Без папки» — не папка, а місце для решти записів: її
              нема за що видаляти й нема куди перетягувати. Раніше на
              ній просто нічого не зʼявлялось на ховері, і це читалось
              як «кнопки зламались». Тепер на тому ж місці стоїть
              пояснення. */}
          {plain ? (
            <span
              className="text-[10.5px] font-bold uppercase"
              style={{
                fontFamily: T.mono,
                letterSpacing: '1.4px',
                color: '#7d7b8e',
                opacity: hov ? 1 : 0,
                transition: 'opacity .22s',
              }}
            >
              системна
            </span>
          ) : (
            <Actions
              pinned={folder.pinned}
              onPin={onPin}
              onEdit={onEdit}
              onDelete={onDelete}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: hov ? 1 : 0,
                transform: `translateY(${hov ? '0' : '-6px'})`,
                transition: 'all .22s',
                pointerEvents: hov ? 'auto' : 'none',
              }}
            />
          )}
        </div>

        <div style={{ position: 'relative', marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 23 }}>
            <div
              style={{
                fontFamily: T.mono,
                fontSize: 9.5,
                letterSpacing: '1.7px',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: empty ? '#56545f' : `${c}ee`,
                textShadow: empty ? 'none' : `0 0 14px ${c}55`,
              }}
            >
              {metaOf(count)}
            </div>
            {folder.pinned && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, background: `${A(0.14)}`, border: `1px solid ${A(0.30)}` }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="#a99cff"><path d="M10 3h4v8l3 4v2H7v-2l3-4V3z" /></svg>
                <span style={{ fontFamily: T.mono, fontSize: 8.5, letterSpacing: '1.2px', color: '#b3a8ff', textTransform: 'uppercase', fontWeight: 700 }}>Закріплено</span>
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 10,
              fontFamily: T.display,
              fontSize: 21,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-0.6px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {folder.name}
          </div>
          <div style={{ marginTop: 9, fontSize: 12.5, color: '#75738a', lineHeight: 1.5, height: 38, overflow: 'hidden', fontFamily: T.sans }}>
            {preview}
          </div>

          {/* Смуга «заповненості» пішла: вона міряла папку відносно
              вигаданої стелі у двадцять записів, тобто показувала не
              стан справ, а те, наскільки далеко до числа, якого ніхто
              не задавав. Дата й лічильник кажуть про папку все. */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
            <div
              style={{
                flex: 'none',
                fontFamily: hov ? T.sans : T.mono,
                fontSize: hov ? 11.5 : 10.5,
                fontWeight: hov ? 700 : 400,
                color: hov ? c : '#5b5967',
                transition: 'color .2s',
              }}
            >
              {hov ? 'Відкрити →' : updated}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- рядок у списку ---------- */

function Row({ folder, count, preview, updated, color, dragging, plain, onOpen, onPin, onEdit, onDelete, dnd }) {
  const [hov, setHov] = useState(false);
  const c = color;
  const empty = !count;

  return (
    <div
      draggable={!plain}
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={plain ? 'Це не папка, а місце для записів без папки. Зникне сама, щойно розкладеш їх по папках.' : undefined}
      {...dnd}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '14px 18px',
        borderRadius: 15,
        background: `linear-gradient(90deg, ${hov ? '#15141d' : '#101016'}, #0b0b10)`,
        border: `1px solid ${hov ? `${c}5e` : '#1c1c25'}`,
        cursor: 'pointer',
        transition: SPRING,
        boxShadow: hov ? `0 16px 34px -22px ${c}99` : 'none',
        transform: dragging ? 'scale(.995)' : hov ? 'translateX(4px)' : 'none',
        opacity: dragging ? 0.5 : 1,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${c}, ${c}33)`, opacity: hov ? 1 : 0.4, transition: 'opacity .2s' }} />

      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 12,
          background: hov ? `${c}26` : '#ffffff0a',
          border: `1px solid ${hov ? `${c}5e` : '#26262f'}`,
          transition: 'all .2s',
        }}
      >
        {folder.icon
          ? <span style={{ fontSize: 18 }}>{folder.icon}</span>
          : <FolderIcon name={iconOf(folder.id)} color={hov ? c : '#8f8da0'} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ fontFamily: T.display, fontSize: 15.5, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folder.name}
          </div>
          {folder.pinned && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#a99cff" style={{ flex: 'none' }}><path d="M10 3h4v8l3 4v2H7v-2l3-4V3z" /></svg>
          )}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#6d6b80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>
          {preview}
        </div>
      </div>

      <div style={{ flex: 'none', width: 96, textAlign: 'right', fontFamily: T.mono, fontSize: 10.5, letterSpacing: '1.2px', textTransform: 'uppercase', fontWeight: 700, color: empty ? '#56545f' : `${c}ee` }}>
        {metaOf(count)}
      </div>

      <div style={{ flex: 'none', width: 64, textAlign: 'right', fontFamily: T.mono, fontSize: 10.5, color: '#5b5967' }}>{updated}</div>

      {plain ? (
        <div
          style={{
            flex: 'none',
            width: 131,
            textAlign: 'right',
            fontFamily: T.mono,
            fontSize: 10.5,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: '#7d7b8e',
            opacity: hov ? 1 : 0,
            transition: 'opacity .22s',
          }}
        >
          системна
        </div>
      ) : (
        <Actions
          pinned={folder.pinned}
          onPin={onPin}
          onEdit={onEdit}
          onDelete={onDelete}
          style={{
            flex: 'none',
            width: 131,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 6,
            opacity: hov ? 1 : 0,
            transition: 'opacity .2s',
            pointerEvents: hov ? 'auto' : 'none',
          }}
        />
      )}
    </div>
  );
}

/* ---------- «Нова папка» ---------- */

function NewCard({ onClick, compact }) {
  const [hov, setHov] = useState(false);

  if (compact) {
    return (
      <div
        onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          borderRadius: 15,
          border: `1.5px dashed ${hov ? `${A(0.55)}` : '#24242f'}`,
          background: hov ? `${A(0.07)}` : 'transparent',
          cursor: 'pointer',
          transition: 'all .2s',
        }}
      >
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 12,
            background: hov ? `${A(0.17)}` : '#ffffff0a',
            border: `1px solid ${hov ? `${A(0.44)}` : '#26262f'}`,
            color: hov ? '#b3a8ff' : '#7c7a8a',
            transition: 'all .2s',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </div>
        <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 600, color: '#9694a6' }}>Нова папка</div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 228,
        borderRadius: 20,
        border: `1.5px dashed ${hov ? `${A(0.55)}` : '#24242f'}`,
        background: hov ? `${A(0.07)}` : '#ffffff03',
        cursor: 'pointer',
        transition: SPRING,
        transform: `translateY(${hov ? '-4px' : '0'})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 15,
          background: hov ? `${A(0.17)}` : '#ffffff0a',
          border: `1px solid ${hov ? `${A(0.44)}` : '#26262f'}`,
          color: hov ? '#b3a8ff' : '#7c7a8a',
          boxShadow: 'inset 0 1px 0 #ffffff12',
          transition: 'all .22s',
        }}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
      </div>
      <div style={{ marginTop: 15, fontFamily: T.display, fontSize: 15, fontWeight: 600, color: '#9694a6' }}>Нова папка</div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: '#54525f', fontFamily: T.sans }}>або перетягни записи сюди</div>
    </div>
  );
}

/* ---------- вікно зміни папки ---------- */

/* ---------- вікно папки ----------

   Одне вікно на створення й на зміну: різниця між ними в двох
   словах у шапці й підписі кнопки, а не в наборі полів. Тримати два
   майже однакові екрани означало б правити кожну дрібницю двічі.

   Головне тут — прев'ю справа. Колір, іконка й назва живуть не
   заради форми, а заради того, як папка виглядатиме на полиці, і
   побачити це треба до збереження, а не після.
---------------------------------------------------------------- */

const PRESETS = [
  { name: 'Розбори тижня', icon: '📊' },
  { name: 'Ідеї', icon: '💡' },
  { name: 'Психологія', icon: '🧠' },
  { name: 'Сетапи', icon: '📈' },
];

const NAME_MAX = 32;

/* Шість найчастіших — рукою, решта за «смайликом». Ряд швидкого
   вибору існує не заради економії кліка, а щоб було видно: іконку
   тут взагалі можна поставити. */
const QUICK_ICONS = ['📈', '💡', '🧠', '📊', '🔥', '📚'];

export function FolderDialog({ folder, fresh, onSave, onClose }) {
  /* Щойно створеній папці підставлене «Нова папка» стирати
     доводиться самому — це слово там технічне, а не запропоноване.
     Тому в неї поле відкривається порожнім. */
  const [name, setName] = useState(fresh ? '' : folder.name);
  const [color, setColor] = useState(folder.color || FOLDER_COLORS[0]);
  const [pinned, setPinned] = useState(!!folder.pinned);
  const [icon, setIcon] = useState(folder.icon || '');
  const [nameFocus, setNameFocus] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ref = useRef(null);
  const contentBox = useContentBox();

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const named = name.trim();
  const custom = !!color && !FOLDER_COLORS.includes(color);
  const canSave = !!named;

  const save = () => { if (canSave) onSave({ name, color, pinned, icon }); };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Enter' && !emojiOpen) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed bottom-0 top-0 z-[220] overflow-y-auto"
      style={{
        left: contentBox ? contentBox.left : 0,
        width: contentBox ? contentBox.width : '100%',
        background: 'rgba(4,4,7,0.62)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex min-h-full items-center justify-center px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.985 }}
          transition={{ duration: 0.26, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className="relative w-full rounded-[24px]"
          style={{
            maxWidth: 880,
            background: `linear-gradient(170deg, ${color}14, #0e0e13 24%, #0b0b10)`,
            border: '1px solid #23232e',
            boxShadow: `0 50px 110px -40px #000, 0 0 0 1px ${color}14`,
          }}
        >
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ borderRadius: '24px 24px 0 0', background: `linear-gradient(90deg,transparent,${color}cc 30%,#8b7cffcc 70%,transparent)` }}
          />

          {/* ─── шапка ─── */}
          <div className="flex items-center justify-between gap-5 py-4 pl-[22px] pr-[18px]" style={{ borderBottom: '1px solid #1c1c25' }}>
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] text-[16px]"
                style={{ background: `${color}1f`, border: `1px solid ${color}4d`, boxShadow: `inset 0 1px 0 ${color}55`, color }}
              >
                {icon || <FolderIcon name="folder" color={color} size={16} />}
              </span>
              <div className="min-w-0">
                <div className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '2.2px', color }}>
                  {fresh ? 'Нова папка' : 'Папка'}
                </div>
                <div className="mt-1 truncate text-[12px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>
                  {named ? 'зʼявиться в списку папок одразу' : 'дай назву, решта — за бажанням'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
              style={{ background: '#ffffff08', border: '1px solid #23232e', color: '#b3b1c0', transition: 'all .16s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff16'; e.currentTarget.style.borderColor = '#3d3d4c'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.borderColor = '#23232e'; }}
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 268px' }}>

            {/* ─────────── поля ─────────── */}
            <div className="min-w-0 px-[22px] pb-5 pt-[22px]" style={{ borderRight: '1px solid #1c1c25' }}>
              <DialogLabel>Назва</DialogLabel>

              <div
                className="relative mt-2.5 flex h-14 items-center gap-3 rounded-[14px] px-4"
                style={{
                  background: nameFocus ? '#ffffff0d' : '#ffffff06',
                  border: `1px solid ${nameFocus ? `${color}8c` : '#1e1e27'}`,
                  boxShadow: nameFocus ? `0 0 0 4px ${color}1f` : 'none',
                  transition: 'all .2s',
                }}
              >
                {/* Іконка стоїть у самому полі назви: це не окреме
                    рішення, а частина того самого — як папку назвали
                    і як її впізнають. */}
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[16px]"
                  style={{ background: `${color}20`, border: `1px solid ${color}5e` }}
                >
                  {icon || <FolderIcon name="folder" color={color} size={15} />}
                </span>

                <input
                  ref={ref}
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                  onFocus={() => setNameFocus(true)}
                  onBlur={() => setNameFocus(false)}
                  placeholder="Розбори тижня"
                  className="min-w-0 flex-1 border-none bg-transparent outline-none"
                  style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700, letterSpacing: '-0.7px', color: '#ffffff' }}
                />

                <span className="shrink-0 text-[11px]" style={{ fontFamily: T.mono, color: named.length >= NAME_MAX ? '#ff9d9d' : '#6f6d7d' }}>
                  {named ? `${named.length}/${NAME_MAX}` : ''}
                </span>

              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-[7px]">
                <span className="mr-0.5 text-[10px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.6px', color: '#7d7b8e' }}>
                  Швидко
                </span>
                {PRESETS.map((p) => {
                  const on = named === p.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => { setName(p.name); setIcon(p.icon); }}
                      className="flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[12px] font-semibold"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `${color}2b` : '#ffffff08',
                        border: `1px solid ${on ? `${color}80` : '#21212b'}`,
                        color: on ? '#ffffff' : '#a9a7b8',
                        transition: 'all .16s',
                      }}
                    >
                      <span className="text-[12px]">{p.icon}</span>
                      {p.name}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5"><DialogLabel>Колір</DialogLabel></div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                {FOLDER_COLORS.map((col) => {
                  const on = color === col;
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setColor(col)}
                      className="h-[30px] w-[30px] rounded-[10px]"
                      style={{
                        background: `linear-gradient(160deg, ${col}, ${col}b3)`,
                        border: `2px solid ${on ? '#ffffff' : 'transparent'}`,
                        boxShadow: on ? `0 0 0 3px ${col}44, 0 6px 16px -6px ${col}cc` : 'none',
                        transform: `scale(${on ? 1 : 0.88})`,
                        transition: 'all .18s',
                      }}
                    />
                  );
                })}

                <label
                  className="relative grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[10px]"
                  title="Свій колір"
                  style={{
                    background: custom ? `${color}2b` : '#ffffff08',
                    border: custom ? `1px solid ${color}cc` : '1px dashed #2d2d3a',
                    color: custom ? color : '#6f6d7d',
                    boxShadow: custom ? `0 0 0 3px ${color}33` : 'none',
                    transition: 'all .18s',
                  }}
                >
                  <Plus size={13} strokeWidth={2.6} />
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>

                {custom && (
                  <span className="text-[11px] uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.6px', color: '#a3a1b2' }}>{color}</span>
                )}
              </div>

              <div className="mt-5"><DialogLabel>Іконка</DialogLabel></div>
              {/* Швидкий ряд плюс повний вибір за «плюсом». Ховати
                  іконку тільки в полі назви було помилкою: те, чого не
                  видно в формі, для людини не існує. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIcon('')}
                  title="Без емодзі"
                  className="grid h-9 w-9 place-items-center rounded-[10px]"
                  style={{
                    background: icon ? '#ffffff08' : `${color}24`,
                    border: `1px solid ${icon ? '#22222c' : `${color}80`}`,
                    transition: 'all .16s',
                  }}
                >
                  <FolderIcon name="folder" color={icon ? '#8b8998' : color} size={16} />
                </button>

                {QUICK_ICONS.map((e) => {
                  const on = icon === e;
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setIcon(e)}
                      className="grid h-9 w-9 place-items-center rounded-[10px] text-[17px]"
                      style={{
                        background: on ? `${color}24` : '#ffffff08',
                        border: `1px solid ${on ? `${color}80` : '#22222c'}`,
                        boxShadow: on ? `0 0 18px -8px ${color}cc` : 'none',
                        transition: 'all .16s',
                      }}
                    >
                      {e}
                    </button>
                  );
                })}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setEmojiOpen((v) => !v)}
                    title="Усі емодзі"
                    className="grid h-9 w-9 place-items-center rounded-[10px]"
                    style={{
                      background: emojiOpen ? `${color}2b` : '#ffffff08',
                      border: emojiOpen ? `1px solid ${color}cc` : '1px dashed #2d2d3a',
                      color: emojiOpen ? color : '#8b8998',
                      transition: 'all .16s',
                    }}
                  >
                    <Smile size={16} strokeWidth={1.9} />
                  </button>

                  {emojiOpen && (
                    <div className="absolute left-0 top-full z-50 mt-2">
                      <EmojiPicker
                        value={icon}
                        color={color}
                        /* Після вибору повертаємо курсор у назву:
                           емодзі обирають мимохідь, а писати все одно
                           далі назву. */
                        onPick={(e) => { setIcon(e); setEmojiOpen(false); requestAnimationFrame(() => ref.current?.focus()); }}
                        onClear={() => { setIcon(''); setEmojiOpen(false); requestAnimationFrame(() => ref.current?.focus()); }}
                        onClose={() => setEmojiOpen(false)}
                      />
                    </div>
                  )}
                </div>

                {icon && (
                  <span className="text-[12px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>
                    {icon} — так папку буде видно в списку
                  </span>
                )}
              </div>

              <div className="mt-5"><DialogLabel>Налаштування</DialogLabel></div>
              <button
                type="button"
                onClick={() => setPinned((v) => !v)}
                className="mt-2.5 flex h-[38px] w-full items-center gap-2.5 rounded-[11px] px-3"
                style={{
                  background: pinned ? `${color}14` : '#ffffff08',
                  border: `1px solid ${pinned ? `${color}4d` : '#21212b'}`,
                  color: pinned ? color : '#a3a1b2',
                  transition: 'all .16s',
                }}
              >
                <Pin size={13} strokeWidth={1.9} style={{ flex: 'none' }} />
                <span className="flex-1 text-left text-[12.5px] font-semibold" style={{ fontFamily: T.sans }}>Закріпити зверху</span>
                <span
                  className="shrink-0 rounded-md px-1.5 py-[3px] text-[9.5px] font-bold uppercase"
                  style={{
                    fontFamily: T.mono,
                    letterSpacing: '0.8px',
                    background: pinned ? `${color}24` : '#ffffff0a',
                    border: `1px solid ${pinned ? `${color}4d` : '#26262f'}`,
                    color: pinned ? color : '#8b8998',
                  }}
                >
                  {pinned ? 'так' : 'ні'}
                </span>
              </button>
            </div>

            {/* ─────────── прев'ю ─────────── */}
            <div className="flex min-w-0 flex-col px-[18px] pb-5 pt-[22px]">
              <div className="flex items-baseline justify-between gap-2">
                <DialogLabel>Прев&apos;ю</DialogLabel>
                <span className="text-[11px]" style={{ fontFamily: T.sans, color: '#6f6d7d' }}>як у списку</span>
              </div>

              <div
                className="relative mt-2.5 overflow-hidden rounded-[20px] px-5 py-[18px]"
                style={{
                  background: 'linear-gradient(165deg,#141420,#0b0b10)',
                  border: `1px solid ${color}5e`,
                  boxShadow: `0 24px 48px -24px ${color}80`,
                  transition: 'all .24s',
                }}
              >
                <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${color}, ${color}33)` }} />
                <span
                  className="absolute left-5 top-0 h-1 w-[52px]"
                  style={{ borderRadius: '0 0 5px 5px', background: color, boxShadow: `0 0 16px 2px ${color}aa` }}
                />
                <span
                  className="pointer-events-none absolute rounded-full"
                  style={{ left: -50, top: -80, width: 240, height: 200, background: color, filter: 'blur(62px)', opacity: 0.18 }}
                />

                <div className="relative flex items-start justify-between gap-2.5">
                  <span
                    className="grid h-11 w-11 place-items-center rounded-[14px] text-[20px]"
                    style={{ background: `${color}26`, border: `1px solid ${color}5e`, boxShadow: `inset 0 1px 0 ${color}55` }}
                  >
                    {icon || <FolderIcon name="folder" color={color} size={20} />}
                  </span>

                  {pinned && (
                    <span
                      className="flex items-center gap-1.5 rounded-full px-2 py-[3px]"
                      style={{ background: `${color}24`, border: `1px solid ${color}4d`, color }}
                    >
                      <Pin size={9} strokeWidth={2.6} />
                      <span className="text-[8.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.2px' }}>Закріплено</span>
                    </span>
                  )}
                </div>

                <div className="relative mt-[22px]">
                  <div className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.7px', color: '#7d7b8e' }}>
                    Порожня
                  </div>
                  <div
                    className="mt-2 truncate"
                    style={{ fontFamily: T.display, fontSize: 19, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.5px' }}
                  >
                    {named || 'Назва папки'}
                  </div>
                  <div className="mt-2 overflow-hidden text-[12px]" style={{ fontFamily: T.sans, color: '#8b8998', lineHeight: 1.5, height: 36 }}>
                    {named ? 'Порожня папка. Додай перший запис.' : 'Тут зʼявиться прев\u2019ю перших нотаток.'}
                  </div>
                  <div className="mt-3.5 flex items-center justify-end">
                    <span className="text-[11px]" style={{ fontFamily: T.mono, color: '#7d7b8e' }}>щойно</span>
                  </div>
                </div>
              </div>

              <div
                className="mt-3.5 flex items-start gap-2.5 rounded-[13px] px-3 py-3"
                style={{ background: '#ffffff05', border: '1px solid #1e1e27' }}
              >
                <Sparkles size={14} strokeWidth={1.8} style={{ color, flex: 'none', marginTop: 1 }} />
                <span className="min-w-0 flex-1 text-[12px]" style={{ fontFamily: T.sans, color: '#a3a1b2', lineHeight: 1.5 }}>
                  {pinned
                    ? 'Закріплена папка завжди перша в списку, незалежно від сортування.'
                    : 'Колір і іконка визначають, як папка виглядає в списку та на картках її нотаток.'}
                </span>
              </div>
            </div>
          </div>

          {/* ─── дії ─── */}
          <div
            className="flex items-center justify-between gap-5 py-3.5 pl-[22px] pr-[18px]"
            style={{ borderTop: '1px solid #1c1c25', background: '#0a0a0e', borderRadius: '0 0 24px 24px' }}
          >
            <div className="hidden items-center gap-3.5 sm:flex">
              {[{ k: 'esc', t: 'закрити' }].map(({ k, t }) => (
                <span key={k} className="flex items-center gap-[7px] text-[12px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
                  <span
                    className="rounded-md px-1.5 py-[3px]"
                    style={{ fontFamily: T.mono, background: '#ffffff0d', border: '1px solid #26262f', color: '#a3a1b2' }}
                  >
                    {k}
                  </span>
                  {t}
                </span>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex h-[42px] items-center rounded-xl px-[18px] text-[13px] font-semibold"
                style={{ background: '#ffffff08', border: '1px solid #23232e', color: '#b3b1c0', fontFamily: T.sans, transition: 'all .16s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff14'; e.currentTarget.style.color = '#ffffff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.color = '#b3b1c0'; }}
              >
                Скасувати
              </button>

              <DialogCta onClick={save} disabled={!canSave} label={fresh ? 'Створити папку' : 'Зберегти'} fresh={fresh} />
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

const DialogLabel = ({ children }) => (
  <span className="text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.6px', color: '#9a98ab' }}>
    {children}
  </span>
);

/* Кнопка гасне, поки папка без назви: створювати «Без назви» вона не
   має права — саме так на полиці й з'являлись безіменні папки. */
function DialogCta({ onClick, disabled, label, fresh }) {
  const [hov, setHov] = useState(false);
  const on = hov && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Спершу дай назву' : undefined}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative flex h-[42px] items-center gap-[9px] overflow-hidden rounded-xl px-5"
      style={{
        background: `linear-gradient(180deg, ${on ? '#6355ff, #4a3bf5' : '#5546f8, #3f30e8'})`,
        boxShadow: on
          ? `0 18px 40px -12px ${A(0.85)}, inset 0 1px 0 #ffffff4d`
          : `0 12px 30px -12px ${A(0.7)}, inset 0 1px 0 #ffffff33`,
        transform: `translateY(${on ? '-2px' : '0'})`,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: SPRING,
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,#ffffff99,transparent)' }} />
      {fresh ? <Plus size={15} strokeWidth={2.4} style={{ color: '#fff' }} /> : <Check size={15} strokeWidth={2.3} style={{ color: '#fff' }} />}
      <span className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: '#ffffff' }}>{label}</span>
    </button>
  );
}

/* ================================================================== */

export default function FolderBoard({
  folders, countOf, looseCount, onOpen, onCreate, onRename, onDelete, onReorder,
  view = 'grid', sortable = true,
  previewOf = () => '', updatedOf = () => '',
}) {
  /* Порядок під час жесту тримаємо окремо від справжнього: поки
     картка йде над сусідами, переставляється саме він, а в базу їде
     один раз, на відпусканні. */
  const [dragOrder, setDragOrder] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [editId, setEditId] = useState(null);
  const movedRef = useRef(false);

  /* Рядок без id або той самий id двічі — не папка, а збій читання.
     Далі id це і ключ React, і адреса в порядку: такий рядок з'їдає
     клітинку, лишаючи на полиці діру. */
  const shelf = [];
  const seen = new Set();
  for (const f of folders) {
    if (!f || f.id == null || f.id === '' || seen.has(f.id)) continue;
    seen.add(f.id);
    shelf.push(f);
  }

  const byId = Object.fromEntries(shelf.map((f) => [f.id, f]));
  const baseOrder = shelf.map((f) => f.id);
  const list = (dragOrder || baseOrder).filter((id) => byId[id]).map((id) => byId[id]);
  const compact = view === 'list';

  /* ---------- жест ---------- */

  const startDrag = (id) => (e) => {
    if (!sortable) { e.preventDefault(); return; }
    movedRef.current = false;
    setDragId(id);
    setDragOrder(baseOrder);
    /* Без цього Firefox не починає жест узагалі. */
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(id));
    } catch { /* не критично */ }
  };

  const dragOver = (id) => (e) => {
    e.preventDefault();
    if (!dragId || id === dragId) return;

    /* Закріплені й звичайні не змішуються: інакше папку можна було б
       перетягнути вниз, а вона б відскочила назад нагору. Жест без
       результату гірший за заборонений жест. */
    if (!!byId[id]?.pinned !== !!byId[dragId]?.pinned) return;

    movedRef.current = true;
    setDragOrder((cur) => {
      const base = cur || baseOrder;
      return move(base, base.indexOf(dragId), base.indexOf(id));
    });
  };

  const endDrag = () => {
    const next = dragOrder;
    const moved = movedRef.current;
    setDragId(null);
    setDragOrder(null);
    if (next && moved) onReorder(next.map((id) => byId[id]).filter(Boolean));
    /* клік після перетягування не має відкривати папку */
    setTimeout(() => { movedRef.current = false; }, 0);
  };

  const openIf = (id) => { if (!movedRef.current) onOpen(id); };

  const dnd = (id) => ({
    onDragStart: startDrag(id),
    onDragEnter: dragOver(id),
    onDragOver: (e) => e.preventDefault(),
    onDragEnd: endDrag,
    onDrop: (e) => { e.preventDefault(); endDrag(); },
  });

  const editing = editId ? byId[editId] : null;

  /* «Без папки» — не папка: її не перетягують, не перейменовують і
     не видаляють. Тому в неї свій колір і порожні дії. */
  const loose = looseCount > 0
    ? { id: NO_FOLDER, name: 'Без папки', color: '#8a8a94', pinned: false }
    : null;

  const propsOf = (f, plain) => ({
    folder: f,
    plain,
    count: plain ? looseCount : countOf(f.id),
    preview: previewOf(f.id) || (plain ? 'Швидкі думки, які ще не розкладені по темах.' : 'Порожня папка. Додай перший запис.'),
    updated: updatedOf(f.id),
    color: f.color || FOLDER_COLORS[0],
    dragging: dragId === f.id,
    onOpen: () => openIf(f.id),
    onPin: () => onRename(f, { pinned: !f.pinned }),
    onEdit: () => setEditId(f.id),
    onDelete: () => onDelete(f),
    dnd: plain ? {} : dnd(f.id),
  });

  return (
    <>
      {compact ? (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '0 19px 4px' }}>
            <div style={{ flex: 'none', width: 40 }} />
            {[
              { w: 0, t: 'Назва', a: 'left' },
              { w: 96, t: 'Записів', a: 'right' },
              { w: 64, t: 'Зміна', a: 'right' },
            ].map(({ w, t, a }) => (
              <div
                key={t}
                style={{
                  flex: w ? 'none' : 1,
                  width: w || undefined,
                  minWidth: w ? undefined : 0,
                  textAlign: a,
                  fontFamily: T.mono,
                  fontSize: 9,
                  letterSpacing: '1.8px',
                  color: '#5d5b6a',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                {t}
              </div>
            ))}
            <div style={{ flex: 'none', width: 131 }} />
          </div>

          {list.map((f) => <Row key={f.id} {...propsOf(f, false)} />)}
          {loose && <Row key={NO_FOLDER} {...propsOf(loose, true)} />}
          <NewCard onClick={onCreate} compact />
        </div>
      ) : (
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(292px,1fr))', gap: 18 }}>
          {list.map((f) => <Card key={f.id} {...propsOf(f, false)} />)}
          {loose && <Card key={NO_FOLDER} {...propsOf(loose, true)} />}
          <NewCard onClick={onCreate} />
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <FolderDialog
            key="folder-dialog"
            folder={editing}
            onSave={(patch) => { onRename(editing, patch); setEditId(null); }}
            onClose={() => setEditId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
