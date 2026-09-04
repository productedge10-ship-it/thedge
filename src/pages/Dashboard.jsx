import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Plus, ArrowDownUp, LayoutGrid, Rows3, Pencil, Link as LinkIcon, Pin,
  NotebookPen, Trash2, Image as ImageIcon, Loader2, AudioLines,
  Archive, ArchiveRestore, ChevronLeft, Inbox, Clock, Folder as FolderIcon, TrendingUp,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { notify } from '../utils/notify';
import useCloudState from '../hooks/useCloudState';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  DEFAULT_TREE, CAT_COLORS, noteMatchesTag, tagLabel, tagColor,
} from '../lib/noteTags';
import {
  fetchNotes, saveNote as pushNote, removeNote, setNoteArchived, setNoteFolder,
  migrateLegacyNotes, uid, todayISO, cardSupport,
} from '../lib/notesStore';
import {
  fetchFolders, createFolder, updateFolder, removeFolder, reorderFolders,
  createDefaultFolders, FOLDER_COLORS, NO_FOLDER,
} from '../lib/foldersStore';
import { removeImages } from '../lib/imageStore';
import { cardOf, cardColor, coverOf, cardBackground, cardToSave } from '../lib/noteCard';
import { mdPlain } from '../lib/mdLite';
import FolderBoard, { FolderDialog } from '../components/notes/FolderBoard';
import NotesBackdrop from '../components/notes/NotesBackdrop';
import NoteReader from '../components/notes/NoteReader';
import NoteEditor from '../components/notes/NoteEditor';

/* ==================================================================
   THE EDGE — Нотатки.
   Сюди пишеться будь-що: від розбору сетапу до думки про власну
   голову. Тому тут немає полів угоди — тільки текст, теги і скріни.
   Теги дворівневі: Price Action → FVG. Свої додаються на льоту.
================================================================== */

const blankForm = (folderId = null) => ({
  id: null, title: '', description: '', images: [], chart_link: '',
  tags: [], session_date: todayISO(), folder_id: folderId, card: {},
});

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + (String(iso).length <= 10 ? 'T12:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/\sр\./, '');
};

const fmtShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + (String(iso).length <= 10 ? 'T12:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' }).replace(/\sр\./, '');
};




/* Єдина яскрава кнопка в рядку. Тінь навмисно слабша за колишню:
   на темному тлі акцент і так видно першим, а фіолетова заграва
   під кнопкою — рівно той тип ефекту, який тестер назвав зайвим
   («більш стриманий стиль більш підходить»). */
const CtaBtn = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="group inline-flex h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4.5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
    style={{
      background: T.acc,
      color: 'var(--edge-on-acc, #0A0A0C)',
      fontFamily: T.sans,
      paddingLeft: 18,
      paddingRight: 18,
      boxShadow: `0 4px 14px -6px rgba(${T.accRgb},0.5)`,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 8px 20px -6px rgba(${T.accRgb},0.6)`)}
    onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 4px 14px -6px rgba(${T.accRgb},0.5)`)}
  >
    <Plus size={16} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />
    {children}
  </button>
);

/* ================================================================== */

/* Акцент у темі — CSS-змінна, а не hex. Тому альфу до неї не можна
   дописати рядком: `var(--edge-acc)8c` браузер просто викидає, і
   замість напівпрозорого бордера виходить його відсутність. Саме так
   зникав ховер на пошуку й на картці «Нова папка». */
const A = (a) => `rgba(${T.accRgb}, ${a})`;

const SPRING = 'transform .34s cubic-bezier(.22,1.2,.36,1), border-color .2s, background .2s, box-shadow .28s, opacity .2s';

/* Українська рахує до чотирьох: 1 папка, 2 папки, 5 папок — і 0 теж
   папок, а не «0 папки». */
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

/* Кнопка полиці — з макета: градієнт, світлий волосок зверху,
   підйом на два пікселі під курсором. Єдина яскрава пляма в рядку,
   тому дозволено собі більше, ніж решті. */
/* Кнопка панелі: сортування, архів. Тихий прямокутник, який
   світлішає під курсором — на відміну від однієї яскравої дії
   праворуч, ці лише перемикають те, що вже видно. */
function PanelBtn({ onClick, active, children }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex h-11 items-center gap-[9px] rounded-[13px] px-[15px]"
      style={{
        background: active ? A(0.17) : hov ? '#ffffff14' : '#ffffff0a',
        border: `1px solid ${active ? A(0.5) : hov ? '#33333f' : '#21212b'}`,
        transition: 'all .16s',
      }}
    >
      {children}
    </button>
  );
}

function GradientCta({ onClick, children }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative flex h-11 shrink-0 items-center gap-[9px] overflow-hidden rounded-[13px] px-[21px]"
      style={{
        background: `linear-gradient(180deg, ${hov ? '#6355ff, #4a3bf5' : '#5546f8, #3f30e8'})`,
        boxShadow: hov
          ? `0 18px 40px -12px ${A(0.85)}, inset 0 1px 0 #ffffff4d`
          : `0 12px 30px -12px ${A(0.70)}, inset 0 1px 0 #ffffff33`,
        transform: `translateY(${hov ? '-2px' : '0'})`,
        transition: 'transform .34s cubic-bezier(.22,1.2,.36,1), box-shadow .28s, background .2s',
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,#ffffff99,transparent)' }} />
      <Plus size={15} strokeWidth={2.4} style={{ color: '#ffffff' }} />
      <span className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: '#ffffff', letterSpacing: '-0.1px' }}>{children}</span>
    </button>
  );
}

/* Лінійка над секцією: підпис, волосок у нікуди, підказка праворуч. */
const SectionRule = ({ children, hint, right }) => (
  <div className="flex items-center gap-3.5">
    <span className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '2.2px', color: '#84829a' }}>
      {children}
    </span>
    <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,#24242f,transparent)' }} />
    {hint && (
      <span className="flex items-center gap-[7px] text-[12.5px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
        {hint}
      </span>
    )}
    {right}
  </div>
);

/* Картка останнього запису: чипом — папка, праворуч дата, далі
   заголовок і два рядки тексту. Ховер піднімає на три пікселі. */
function RecentCard({ note, folder, onOpen }) {
  const [hov, setHov] = useState(false);
  const c = folder?.color || '#8a8a94';
  const d = new Date(note.updated_at || note.created_at || 0);
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  /* Було `note.body`, якого в нотатці немає, та ще й груба чистка
     регуляркою: у прев'ю летіли пробіли замість слів. */
  const text = mdPlain(note.description).replace(/\s+/g, ' ');

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative cursor-pointer overflow-hidden rounded-[18px]"
      style={{
        padding: '20px 22px 18px',
        background: 'linear-gradient(165deg,#121218,#0c0c11)',
        border: `1px solid ${hov ? '#3a3a4a' : '#1e1e28'}`,
        transform: hov ? 'translateY(-3px)' : 'none',
        transition: 'all .2s',
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,#ffffff1f,transparent)' }} />

      <div className="flex items-center justify-between gap-2.5">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase"
          style={{ background: `${c}1f`, border: `1px solid ${c}42`, fontFamily: T.mono, letterSpacing: '1.3px', color: `${c}f2` }}
        >
          {folder?.name || 'Без папки'}
        </span>
        <span className="text-[11.5px]" style={{ fontFamily: T.mono, color: '#7d7b8e' }}>{date}</span>
      </div>

      <div className="mt-3.5 text-[16px] font-semibold" style={{ fontFamily: T.display, color: '#ffffff', letterSpacing: '-0.3px' }}>
        {(note.title || '').trim() || 'Без назви'}
      </div>
      <div className="mt-2 overflow-hidden text-[13.5px]" style={{ fontFamily: T.sans, color: '#9a98ab', lineHeight: 1.55, maxHeight: 39 }}>
        {text}
      </div>
    </div>
  );
}

/* Кнопка дії на картці запису: 29 пікселів, зʼявляється на ховері
   картки. Небезпечна червоніє, решта світлішає — колір тут єдине, що
   розрізняє їх, поки іконку не роздивились. */
function CardBtn({ title, onClick, danger, accent, children }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      role="button"
      tabIndex={-1}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="grid h-[29px] w-[29px] shrink-0 place-items-center rounded-[9px]"
      style={{
        cursor: 'pointer',
        transition: 'all .16s',
        background: hov ? (danger ? '#ff8f8f24' : accent ? A(0.18) : '#ffffff1a') : '#ffffff0d',
        border: `1px solid ${hov ? (danger ? '#ff8f8f66' : accent ? A(0.5) : '#42424f') : '#2c2c38'}`,
        color: hov ? (danger ? '#ff9d9d' : accent ? '#c4baff' : '#ffffff') : '#a5a3b3',
      }}
    >
      {children}
    </div>
  );
}

/* Плашка тега на картці — колір бере з дерева тегів, тому за нею
   впізнають тему, не читаючи напис. */
const TagPill = ({ name, color, small }) => (
  <span
    className="inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full font-semibold"
    style={{
      padding: small ? '3px 8px' : '4px 9px',
      fontSize: small ? 10 : 10.5,
      letterSpacing: '0.2px',
      fontFamily: T.sans,
      background: `${color}1c`,
      border: `1px solid ${color}3d`,
      color: `${color}ee`,
    }}
  >
    {name}
  </span>
);

/* Картка запису в плитці. Корінець кольору першого тега, світло
   з-за правого верхнього кута, дії на ховері. Мінімальна висота
   тримає сітку рівною, коли в одних записів текст на два рядки, а в
   інших на жоден. */
function NoteTile({ note, color, date, pills, images, voices, icon, cover, tall, bg, trade, pinned, onOpen, onEdit, onArchive, onDelete, onTrade }) {
  const [hov, setHov] = useState(false);
  const c = color;

  return (
    <article
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative flex cursor-pointer flex-col overflow-hidden rounded-[18px]"
      style={{
        gridRow: tall ? 'span 2' : undefined,
        minHeight: tall ? 444 : 214,
        padding: '16px 18px 15px',
        ...cardBackground(bg, c, hov),
        border: `1px solid ${hov ? `${c}66` : '#1d1d26'}`,
        transition: SPRING,
        boxShadow: hov ? `0 24px 48px -24px ${c}80` : '0 10px 24px -20px #000000cc',
        transform: hov ? 'translateY(-4px)' : 'none',
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,#ffffff26 40%,#ffffff26 60%,transparent)' }} />
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${c}, ${c}33)`, opacity: hov ? 1 : 0.4, transition: 'opacity .2s' }} />
      <span
        className="pointer-events-none absolute rounded-full"
        style={{ right: -60, top: -70, width: 200, height: 170, background: c, filter: 'blur(60px)', opacity: hov ? 0.16 : 0.05, transition: 'opacity .26s' }}
      />

      {/* Обкладинка — перший скрін нотатки. Картинка тут не прикраса:
          графік упізнають швидше, ніж заголовок. */}
      {cover && (
        <span
          className="relative -mx-[18px] -mt-4 mb-3.5 block overflow-hidden"
          style={{ height: tall ? 214 : 92, borderBottom: `1px solid ${c}33` }}
        >
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover"
            style={{ transform: hov ? 'scale(1.04)' : 'none', transition: 'transform .5s cubic-bezier(.22,1,.36,1)' }}
          />
          <span className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(8,8,12,0.35), rgba(8,8,12,0.75))' }} />
        </span>
      )}

      <div className="relative flex items-center justify-between gap-2.5" style={{ minHeight: 31 }}>
        <div className="flex items-center gap-2">
          {icon && (
            <span
              className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-[13px]"
              style={{ background: `${c}1f`, border: `1px solid ${c}47` }}
            >
              {icon}
            </span>
          )}
          <span style={{ fontFamily: T.mono, fontSize: 11.5, letterSpacing: '0.6px', color: '#8b8998' }}>{date}</span>
          {pinned && <Pin size={11} strokeWidth={2.4} style={{ color: c }} />}
          {images > 0 && (
            <span className="flex items-center gap-1" style={{ fontFamily: T.mono, fontSize: 11, color: '#7d7b8e' }}>
              <ImageIcon size={11} strokeWidth={2.2} /> {images}
            </span>
          )}
          {voices > 0 && (
            <span className="flex items-center gap-1" style={{ fontFamily: T.mono, fontSize: 11, color: c }}>
              <AudioLines size={11} strokeWidth={2.2} /> {voices}
            </span>
          )}
        </div>

        <div
          className="flex items-center gap-1.5"
          style={{ opacity: hov ? 1 : 0, transform: `translateY(${hov ? '0' : '-5px'})`, transition: 'all .2s', pointerEvents: hov ? 'auto' : 'none' }}
        >
          <CardBtn title="Редагувати" onClick={onEdit} accent><Pencil size={13} strokeWidth={1.9} /></CardBtn>
          <CardBtn title={note.archived ? 'Повернути зі стрічки' : 'В архів'} onClick={onArchive}>
            {note.archived ? <ArchiveRestore size={13} strokeWidth={1.9} /> : <Archive size={13} strokeWidth={1.9} />}
          </CardBtn>
          <CardBtn title="Видалити" onClick={onDelete} danger><Trash2 size={13} strokeWidth={1.9} /></CardBtn>
        </div>
      </div>

      <div
        className="relative mt-3"
        style={{ fontFamily: T.display, fontSize: 18.5, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.4px', lineHeight: 1.25 }}
      >
        {note.title || 'Без назви'}
      </div>
      {/* Коли зверху обкладинка, тексту в звичайній картці лишається
          рівно на нуль рядків — і краще не показати нічого, ніж
          обрізати речення на півслові. */}
      {(!cover || tall) && (
        <div
          className="relative mt-[9px] overflow-hidden"
          style={{ height: tall ? (cover ? 96 : 148) : 42, fontFamily: T.sans, fontSize: 14, color: '#a3a1b2', lineHeight: 1.6, whiteSpace: 'pre-line' }}
        >
          {mdPlain(note.description)}
        </div>
      )}

      <div className="relative mt-auto flex min-w-0 flex-wrap items-center gap-1.5 pt-3.5">
        {pills.map((t) => <TagPill key={t.id} name={t.name} color={t.color} />)}
        {trade && (
          <span
            role="button"
            tabIndex={-1}
            title={`Відкрити бектест: ${trade.name}`}
            onClick={(e) => { e.stopPropagation(); onTrade(trade); }}
            className="inline-flex max-w-full items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ fontFamily: T.mono, letterSpacing: '0.4px', background: A(0.14), border: `1px solid ${A(0.4)}`, color: '#b3a8ff', cursor: 'pointer' }}
          >
            <LinkIcon size={10} strokeWidth={2.4} />
            {trade.name}
          </span>
        )}
      </div>
    </article>
  );
}

/* Той самий запис рядком. Колонки ті самі, що в шапці списку, тому
   ширини тут не випадкові — вони мусять збігатись. */
function NoteLine({ note, color, date, pills, icon, pinned, onOpen, onEdit, onArchive, onDelete }) {
  const [hov, setHov] = useState(false);
  const c = color;

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative flex cursor-pointer items-center gap-[18px] overflow-hidden rounded-[15px]"
      style={{
        padding: '14px 18px',
        background: `linear-gradient(90deg, ${hov ? '#15141d' : '#101016'}, #0b0b10)`,
        border: `1px solid ${hov ? `${c}5e` : '#1c1c25'}`,
        transition: SPRING,
        boxShadow: hov ? `0 16px 34px -22px ${c}99` : 'none',
        transform: hov ? 'translateX(4px)' : 'none',
      }}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${c}, ${c}33)`, opacity: hov ? 1 : 0.4, transition: 'opacity .2s' }} />
      <span className="w-2 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="shrink-0 text-[13px]">{icon}</span>}
          {pinned && <Pin size={11} strokeWidth={2.4} style={{ color: c, flex: 'none' }} />}
          <div
            className="truncate"
            style={{ fontFamily: T.display, fontSize: 15.5, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.3px' }}
          >
            {note.title || 'Без назви'}
          </div>
        </div>
        <div className="mt-1 truncate" style={{ fontFamily: T.sans, fontSize: 13, color: '#8f8da0' }}>
          {mdPlain(note.description)}
        </div>
      </div>

      <div className="flex w-[180px] shrink-0 items-center gap-1.5 overflow-hidden">
        {pills.slice(0, 2).map((t) => <TagPill key={t.id} name={t.name} color={t.color} small />)}
      </div>

      <div className="w-24 shrink-0 text-right" style={{ fontFamily: T.mono, fontSize: 11.5, color: '#8b8998' }}>{date}</div>

      <div
        className="flex w-[104px] shrink-0 items-center justify-end gap-1.5"
        style={{ opacity: hov ? 1 : 0, transition: 'opacity .2s', pointerEvents: hov ? 'auto' : 'none' }}
      >
        <CardBtn title="Редагувати" onClick={onEdit} accent><Pencil size={13} strokeWidth={1.9} /></CardBtn>
        <CardBtn title={note.archived ? 'Повернути зі стрічки' : 'В архів'} onClick={onArchive}>
          {note.archived ? <ArchiveRestore size={13} strokeWidth={1.9} /> : <Archive size={13} strokeWidth={1.9} />}
        </CardBtn>
        <CardBtn title="Видалити" onClick={onDelete} danger><Trash2 size={13} strokeWidth={1.9} /></CardBtn>
      </div>
    </div>
  );
}

/* Швидка нотатка — перша клітинка сітки, а не кнопка десь угорі.
   Пунктир і курсор-каретка кажуть головне: сюди пишуть. Підказка
   «N» — та сама дія з клавіатури, без миші. */
/* Швидка нотатка — рядок над списком, а не картка в ньому.

   Карткою вона займала повноцінну клітинку сітки й через це важила
   стільки ж, скільки справжній запис: на полиці з двох нотаток
   найбільшим об'єктом була кнопка «створити». Рядок робить те саме,
   але не претендує на увагу — його видно, коли шукаєш, і не видно,
   коли читаєш.
---------------------------------------------------------------- */
function QuickNoteBar({ onClick }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="mt-5 flex h-[46px] w-full items-center gap-3 rounded-[14px] px-3.5 text-left"
      style={{
        cursor: 'text',
        border: `1.5px dashed ${hov ? A(0.5) : '#24242f'}`,
        background: hov ? A(0.06) : '#ffffff03',
        transition: 'all .18s',
      }}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px]"
        style={{
          background: hov ? A(0.17) : '#ffffff0a',
          border: `1px solid ${hov ? A(0.4) : '#26262f'}`,
          color: hov ? '#b3a8ff' : '#8b8998',
          transition: 'all .18s',
        }}
      >
        <Pencil size={14} strokeWidth={1.9} />
      </span>

      <span className="min-w-0 flex-1 text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: hov ? '#d9d7e4' : '#a3a1b2' }}>
        Швидка нотатка
        <span className="ml-2 font-normal" style={{ color: '#7d7b8e' }}>почни писати — збережеться сюди</span>
      </span>

      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-[11px]"
        style={{ background: '#ffffff0d', border: '1px solid #2a2a35', fontFamily: T.mono, color: '#8b8998' }}
      >
        N
      </span>
    </button>
  );
}

/* Плашка фільтра по тегах.

   Дві речі, які тут ламались. Перша: у «Всі» кольором стояв акцент
   теми, а це CSS-змінна — `var(--edge-acc)2b` браузер викидає, тому
   плашка лишалась зовсім без фону й рамки й виглядала обрізаною.
   Друга: ховера не було взагалі, тож наведення нічого не робило, а
   клік перемикав стан ривком. */
function FilterPill({ name, count, color, active, onClick }) {
  const [hov, setHov] = useState(false);
  const tint = (a) => (color ? `${color}${a.hex}` : A(a.rgb));

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold"
      style={{
        fontFamily: T.sans,
        background: active ? tint({ hex: '2b', rgb: 0.17 }) : hov ? '#ffffff12' : '#ffffff08',
        border: `1px solid ${active ? tint({ hex: '80', rgb: 0.5 }) : hov ? '#33333f' : '#20202a'}`,
        color: active ? '#ffffff' : hov ? '#e4e2ec' : '#b3b1c0',
        boxShadow: active ? `0 0 20px -8px ${color || A(0.8)}` : 'none',
        transition: 'background .16s, border-color .16s, color .16s, box-shadow .2s',
      }}
    >
      {name}
      <span
        className="text-[12px]"
        style={{ fontFamily: T.mono, color: active ? (color || '#b3a8ff') : '#7d7b8e' }}
      >
        {count}
      </span>
    </button>
  );
}

export default function Notes() {
  useEdgeFonts();
  const { user } = useAuth();

  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  /* Відкрита папка: null — стоїмо на полиці, id/NO_FOLDER — усередині.
     Поки жодної папки немає, полиці не існує взагалі і цей стан
     просто не використовується: показувати екран з однією кнопкою
     «створити папку» замість власних нотаток — гірше, ніж не мати
     папок. */
  const [openId, setOpenId] = useState(null);

  /* Дерево тегів — це налаштування, а не контент, тому живе поруч з
     рештою станів у user_state, а не окремою таблицею. */
  const [tree, setTree] = useCloudState('note_tags', DEFAULT_TREE, {
    legacyKey: 'edge_note_tags_v1',
    normalize: (v) => (Array.isArray(v) && v.length
      ? v.map((c, i) => ({
        name: String(c?.name || '').trim(),
        color: c?.color || CAT_COLORS[i % CAT_COLORS.length],
        children: Array.isArray(c?.children) ? c.children.filter(Boolean).map(String) : [],
      })).filter((c) => c.name)
      : DEFAULT_TREE),
  });

  const [search, setSearch] = useState('');
  /* Полиця має власний пошук і власний вигляд: там шукають папку, а
     не запис, і плитка/список стосуються папок, а не стрічки. */
  const [shelfQuery, setShelfQuery] = useState('');
  const [shelfView, setShelfView] = useState('grid');
  const [shelfFocus, setShelfFocus] = useState(false);
  const [shelfHover, setShelfHover] = useState(false);
  const [feedFocus, setFeedFocus] = useState(false);
  const [feedHover, setFeedHover] = useState(false);
  const [tag, setTag] = useState(null);
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('grid');
  /* 'active' — робоча стрічка, 'archive' — відпрацьоване */
  const [scope, setScope] = useState('active');

  const [editing, setEditing] = useState(null);   // об'єкт форми або null
  const [readId, setReadId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  /* Папка, яку щойно завели і яка ще не має своєї назви */
  const [creating, setCreating] = useState(false);
  /* Про відсутню колонку `card` попереджаємо один раз за сесію */
  const warnedCard = useRef(false);
  const navigate = useNavigate();

  /* ---------- читання з бази ---------- */
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

    (async () => {
      try {
        const [list, dirs] = await Promise.all([
          fetchNotes(user.id),
          /* Папки не критичні для роботи: якщо міграція ще не
             виконана, записник має відкритись плоским списком, а не
             показати помилку на весь екран. */
          fetchFolders(user.id).catch(() => []),
        ]);
        if (!alive) return;

        /* одноразовий перенос того, що лишилось у localStorage */
        const moved = await migrateLegacyNotes(user.id, list.length);
        if (!alive) return;

        const all = moved.length ? [...moved, ...list] : list;

        /* Перший вхід — заводимо полицю замість порожнього екрана.
           Умова навмисно строга: ані папок, ані нотаток. Якщо людина
           свідомо видалила всі свої папки, повертати їх наступного
           разу було б нав'язуванням, а не турботою. */
        let shelf = dirs;
        if (!dirs.length && !all.length) {
          shelf = await createDefaultFolders(user.id).catch(() => []);
          if (!alive) return;
        }

        setFolders(shelf);
        setNotes(all);
      } catch (err) {
        if (alive) notify.error('Не вдалось завантажити нотатки', err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [user?.id]);

  /* Клавіатура: Esc закриває верхній шар, ⌘K веде в пошук, N починає
     нову нотатку. Дві останні працюють тільки тоді, коли жоден шар не
     відкритий і курсор не в полі введення — інакше буква N просто не
     друкувалась би. */
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    };
    const busy = () => lightbox || deleteId != null || creating || editing || readId != null;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (lightbox) return setLightbox(null);
        if (deleteId != null) return setDeleteId(null);
        if (creating) return setCreating(false);
        if (editing) return setEditing(null);
        if (readId != null) return setReadId(null);
        /* останнім шаром — вихід із папки на полицю */
        if (openId != null) return setOpenId(null);
        return undefined;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (busy()) return undefined;
        e.preventDefault();
        const box = document.querySelector('input[placeholder="Пошук у папці"], input[placeholder="Пошук"]');
        box?.focus();
        return undefined;
      }

      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (busy() || typing() || openId == null || scope === 'archive') return undefined;
        e.preventDefault();
        setEditing(blankForm(openId !== NO_FOLDER ? openId : null));
      }
      return undefined;
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, deleteId, creating, editing, readId, openId, scope]);


  /* Архів свідомо не рахується в жодній цифрі поруч з робочою
     стрічкою: сенс архіву в тому, щоб він не маячив перед очима, а
     лічильник тегів з архівними всередині — це те саме маячіння,
     тільки числом. */
  const active = useMemo(() => notes.filter((n) => !n.archived), [notes]);
  const archived = useMemo(() => notes.filter((n) => n.archived), [notes]);

  /* Полиця — головна сторінка записника, а не нагорода за те, що ти
     завів папку. Коли її показ залежав від кількості папок,
     видалення останньої скидало людину в плоский список — на вигляд
     як відкат до старої версії. На порожній полиці лишаються «Без
     папки» і «Нова папка», а це рівно те, чим заводять першу. */
  const onShelf = openId === null;

  const looseCount = useMemo(
    () => active.filter((n) => !n.folder_id).length,
    [active],
  );
  const countOf = (id) => active.filter((n) => n.folder_id === id).length;

  /* Прев'ю папки — перші рядки її записів, не вигадане речення.
     Полиця з чотирьох однакових карток нічого не каже про те, що
     всередині; три заголовки кажуть усе. */
  const previewOf = (id) => {
    const inside = active.filter((n) => (id === NO_FOLDER ? !n.folder_id : n.folder_id === id));
    if (!inside.length) return '';
    return inside
      .slice()
      .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
      .slice(0, 3)
      .map((n) => (n.title || '').trim() || 'Без назви')
      .join(' · ');
  };

  /* «2 год», «вчора», «3 дні» — час тут відносний, бо на полиці
     важливо не коли саме, а наскільки давно. */
  const updatedOf = (id) => {
    const inside = active.filter((n) => (id === NO_FOLDER ? !n.folder_id : n.folder_id === id));
    if (!inside.length) return '—';
    const last = inside.reduce((acc, n) => {
      const t = new Date(n.updated_at || n.created_at || 0).getTime();
      return t > acc ? t : acc;
    }, 0);
    if (!last) return '—';
    const mins = Math.round((Date.now() - last) / 60000);
    if (mins < 1) return 'щойно';
    if (mins < 60) return `${mins} хв`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} год`;
    const days = Math.round(hours / 24);
    if (days === 1) return 'вчора';
    if (days < 31) return `${days} ${plural(days, 'день', 'дні', 'днів')}`;
    const months = Math.round(days / 30);
    return `${months} ${plural(months, 'місяць', 'місяці', 'місяців')}`;
  };

  /* Пошук на полиці шукає і по назвах папок, і по тому, що в них
     лежить: людина частіше памʼятає запис, ніж полицю, на яку його
     поклала. */
  const shelfQ = shelfQuery.trim().toLowerCase();
  const shelfFolders = useMemo(() => {
    if (!shelfQ) return folders;
    return folders.filter((f) => (f.name || '').toLowerCase().includes(shelfQ)
      || active.some((n) => n.folder_id === f.id && (`${n.title || ''} ${n.body || ''}`).toLowerCase().includes(shelfQ)));
  }, [folders, active, shelfQ]);

  /* Записів за тиждень — єдине число на полиці, яке показує рух, а
     не запас. */
  const weekCount = useMemo(() => {
    const edge = Date.now() - 7 * 86400000;
    return active.filter((n) => new Date(n.created_at || 0).getTime() >= edge).length;
  }, [active]);

  const recent = useMemo(() => active
    .slice()
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
    .slice(0, 3), [active]);

  const openFolder = openId && openId !== NO_FOLDER
    ? folders.find((f) => f.id === openId) || null
    : null;


  /* Архів навмисно наскрізний: він показує все відпрацьоване разом,
     незалежно від полиці. Шукати старий запис по папках, коли ти вже
     не памʼятаєш, у якій він лежав, — це та сама проблема, від якої
     папки мали врятувати. */
  const scoped = useMemo(() => {
    const base = scope === 'archive' ? archived : active;
    if (scope === 'archive' || openId === null) return base;
    if (openId === NO_FOLDER) return base.filter((n) => !n.folder_id);
    return base.filter((n) => n.folder_id === openId);
  }, [active, archived, scope, openId]);

  const inScope = scoped;

  /* Шапка папки: назва, колір і теги беруться з того, що зараз
     відкрито. «Без папки» й архів — теж вигляди папки, просто без
     власного запису в базі, тому колір у них нейтральний. */
  const headTitle = scope === 'archive'
    ? 'Архів'
    : openFolder?.name || (openId === NO_FOLDER ? 'Без папки' : 'Записник');
  const headColor = scope === 'archive' || !openFolder ? '#8a8a94' : openFolder.color;

  /* Теги рядком — тільки ті, що справді зустрічаються тут, і одразу
     з кількістю. «Всі» попереду скидає фільтр. */
  const feedTags = useMemo(() => {
    const seen = new Map();
    inScope.forEach((n) => (n.tags || []).forEach((t) => seen.set(t, (seen.get(t) || 0) + 1)));
    if (!seen.size) return [];
    const rest = [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, name: tagLabel(id), count, color: tagColor(id, tree) }));
    /* У «Всі» немає власного кольору: акцент теми — це CSS-змінна,
       і дописати до неї прозорість рядком не можна. Тому колір для
       цієї плашки підставляється окремо, через rgba. */
    return [{ id: null, name: 'Всі', count: inScope.length, color: null }, ...rest];
  }, [inScope, tree]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const r = inScope.filter((n) => {
      const hitSearch = !q
        || (n.title || '').toLowerCase().includes(q)
        || (n.description || '').toLowerCase().includes(q)
        || (n.tags || []).some((t) => t.toLowerCase().includes(q));
      return hitSearch && noteMatchesTag(n.tags, tag);
    });
    r.sort((a, b) => {
      /* Закріплені завжди зверху, і тільки потім обраний порядок:
         людина закріпила запис саме для того, щоб не шукати його. */
      const pin = (cardOf(b).pin ? 1 : 0) - (cardOf(a).pin ? 1 : 0);
      if (pin) return pin;
      if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'uk');
      return sort === 'newest'
        ? new Date(b.created_at) - new Date(a.created_at)
        : new Date(a.created_at) - new Date(b.created_at);
    });
    return r;
  }, [inScope, search, tag, sort]);

  /* Спершу показуємо результат, потім пишемо в базу: людина не має
     чекати на мережу, щоб побачити власну нотатку. Якщо запис не
     пройшов — повертаємо список назад і кажемо про це прямо. */
  const saveNote = async (form) => {
    /* Новизну визначаємо по списку, а не по наявності id: редактор
       вигадує id одразу при відкритті, бо картинки треба кудись
       класти ще до першого збереження. */
    const isNew = !notes.some((n) => n.id === form.id);
    const data = {
      id: form.id || uid(),
      title: form.title.trim() || 'Без назви',
      description: form.description,
      tags: form.tags || [],
      images: form.images || [],
      chart_link: form.chart_link || '',
      created_at: form.session_date || todayISO(),
      archived: !!form.archived,
      /* Нова нотатка потрапляє в ту папку, з якої її почали писати */
      folder_id: form.folder_id ?? (openId && openId !== NO_FOLDER ? openId : null),
      card: form.card || {},
      /* Проставляємо одразу, а не чекаємо відповіді бази: інакше до
         наступного перезавантаження нотатка показувала б стару дату
         зміни — саме ту, від якої ми щойно пішли. */
      updated_at: new Date().toISOString(),
    };

    const before = notes;
    setNotes((list) => (isNew ? [data, ...list] : list.map((n) => (n.id === data.id ? data : n))));
    setEditing(null);

    try {
      await pushNote(user.id, data);
      /* Вигляд картки — єдине, що може не доїхати на відсталій схемі.
         Сказати про це один раз чесніше, ніж мовчки з'їдати вибір і
         показувати ту саму сіру картку. */
      if (!cardSupport.ok && Object.keys(data.card || {}).length && !warnedCard.current) {
        warnedCard.current = true;
        notify.error('Вигляд картки не збережеться', 'У таблиці notes ще немає колонки card — сам запис збережено, оформлення живе до перезавантаження.');
      }
    } catch (err) {
      setNotes(before);
      notify.error('Нотатка не збереглась', err.message);
    }
  };

  const confirmDelete = async () => {
    const id = deleteId;
    const before = notes;
    const doomed = notes.find((n) => n.id === id);

    setNotes((list) => list.filter((n) => n.id !== id));
    if (readId === id) setReadId(null);
    setDeleteId(null);

    try {
      await removeNote(user.id, id);
      /* Файли прибираємо тільки після того, як пішов сам запис:
         інакше зірваний запит лишив би нотатку з порожніми рамками
         замість графіків. Чужі посилання функція не чіпає. */
      removeImages(doomed?.images);
    } catch (err) {
      setNotes(before);
      notify.error('Не вдалось видалити', err.message);
    }
  };

  /* В архів і назад — одна дія в обидва боки. Нотатка не зникає і
     не питає підтвердження: помилкове архівування виправляється
     одним кліком, на відміну від видалення. */
  const toggleArchive = async (n) => {
    const next = !n.archived;
    const before = notes;

    setNotes((list) => list.map((x) => (x.id === n.id ? { ...x, archived: next, updated_at: new Date().toISOString() } : x)));
    if (readId === n.id) setReadId(null);

    try {
      await setNoteArchived(user.id, n.id, next);
      notify.success(
        next ? 'В архіві' : 'Повернуто',
        next ? 'Нотатка прибрана зі стрічки, але залишилась у записнику.' : 'Нотатка знову в основній стрічці.',
      );
    } catch (err) {
      setNotes(before);
      notify.error('Не вдалось перенести', err.message);
    }
  };

  /* Перенести нотатку в іншу папку. Прапорцем, а не збереженням усієї
     форми: інакше «перекласти на полицю» могло б затерти текст,
     виправлений на іншому пристрої. */
  const moveNote = async (n, folderId) => {
    const next = folderId === NO_FOLDER ? null : folderId;
    if ((n.folder_id || null) === next) return;
    const before = notes;

    setNotes((list) => list.map((x) => (x.id === n.id ? { ...x, folder_id: next, updated_at: new Date().toISOString() } : x)));

    try {
      await setNoteFolder(user.id, n.id, next);
    } catch (err) {
      setNotes(before);
      notify.error('Не вдалось перенести', err.message);
    }
  };

  /* ---------- папки ---------- */

  /* «Нова папка» відкриває вікно, а не заводить рядок у базі.

     Досі було навпаки: кнопка одразу створювала папку з технічною
     назвою, а вікно лише пропонувало її перейменувати. Тому кожне
     випадкове натискання — і кожне «передумав, закрию» — лишало на
     полиці порожню «Нову папку». Тепер натискання не має жодних
     наслідків, поки не натиснуто «Створити папку». */
  const addFolder = () => setCreating(true);

  const createFolderFrom = async (patch) => {
    setCreating(false);
    const before = folders;
    try {
      const f = await createFolder(user.id, {
        name: patch.name,
        color: patch.color,
        pinned: patch.pinned,
        icon: patch.icon,
        position: folders.length,
      });
      setFolders((l) => sortFolders([...l, f]));
      return f;
    } catch (err) {
      setFolders(before);
      notify.error('Не вдалось створити папку', err.message);
      return null;
    }
  };

  /* Закріплені завжди першими. Сортуємо тут, а не в дошці: інакше
     після закріплення папка лишалась би на місці до перезавантаження,
     і людина не побачила б результату власної дії. */
  const sortFolders = (l) => [...l].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return (a.position ?? 0) - (b.position ?? 0);
  });

  const renameFolder = async (f, patch) => {
    const before = folders;
    /* Порожня назва — не назва. База підставляє «Без назви» сама, а
       стан на екрані лишався з порожнім рядком: картка виглядала
       безіменною, ніби папка зламалась. */
    const safe = patch.name !== undefined
      ? { ...patch, name: (patch.name || '').trim() || 'Без назви' }
      : patch;
    setFolders((l) => sortFolders(l.map((x) => (x.id === f.id ? { ...x, ...safe } : x))));
    try {
      await updateFolder(user.id, f.id, safe);
    } catch (err) {
      setFolders(before);
      notify.error('Не вдалось зберегти папку', err.message);
    }
  };

  /* Нотатки при цьому не зникають — за них відповідає on delete set
     null у схемі, і вони переїжджають у «Без папки». Тому й підтвердження
     тут коротке: це прибирання полиці, а не втрата написаного. */
  const dropFolder = async (f) => {
    const before = folders;
    const beforeNotes = notes;

    setFolders((l) => l.filter((x) => x.id !== f.id));
    setNotes((l) => l.map((n) => (n.folder_id === f.id ? { ...n, folder_id: null } : n)));
    if (openId === f.id) setOpenId(null);

    try {
      await removeFolder(user.id, f.id);
      notify.success('Папку прибрано', 'Нотатки з неї переїхали в «Без папки».');
    } catch (err) {
      setFolders(before);
      setNotes(beforeNotes);
      notify.error('Не вдалось видалити папку', err.message);
    }
  };

  const saveOrder = async (ordered) => {
    const before = folders;
    /* Дошка знає лише про ті папки, які показує. Якби її список
       ставав усім станом, папка, відфільтрована пошуком, зникала б
       зі сторінки після чужого перетягування. Тому зшиваємо: нові
       позиції беруть ті, кого справді пересували, решта лишається як
       була.

       Позиції перенумеровуємо одразу — інакше наступне закріплення
       сортувало б за старими значеннями і порядок стрибнув би. */
    const moved = new Map(ordered.map((f, i) => [f.id, i]));
    const next = sortFolders(folders.map((f) => (
      moved.has(f.id) ? { ...f, position: moved.get(f.id) } : f
    )));
    setFolders(next);
    try {
      await reorderFolders(user.id, next);
    } catch (err) {
      setFolders(before);
      notify.error('Порядок не зберігся', err.message);
    }
  };

  const openEdit = (n) => {
    setEditing({ ...blankForm(), ...n, session_date: (n.created_at || todayISO()).slice(0, 10) });
    setReadId(null);
  };

  const reading = readId != null ? notes.find((n) => n.id === readId) : null;

  const neighbours = useMemo(() => {
    const i = filtered.findIndex((n) => n.id === readId);
    if (i === -1) return { prev: null, next: null };
    return { prev: filtered[i - 1]?.id || null, next: filtered[i + 1]?.id || null };
  }, [filtered, readId]);

  /* ---------- дрібні блоки ---------- */

  /* ================================================================== */

  return (
    <div className="relative min-h-full">
      <NotesBackdrop />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер полиці ───────────

            Розкладка з макета: підпис із крапкою, велика назва
            градієнтом, смужка з трьома числами, а праворуч — пошук,
            перемикач вигляду й одна яскрава кнопка. */}
        {onShelf ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="flex flex-col gap-6"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-[9px]">
                <span className="h-[5px] w-[5px] rounded-full" style={{ background: '#8b7cff', boxShadow: `0 0 12px 2px ${A(0.67)}` }} />
                <span className="text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '2.6px', color: '#9b8dff' }}>
                  Нотатки
                </span>
              </div>

              <h1
                className="mt-3.5 text-[40px] font-bold sm:text-[52px] lg:text-[58px]"
                style={{
                  fontFamily: T.display,
                  letterSpacing: '-2.4px',
                  lineHeight: 0.96,
                  background: 'linear-gradient(170deg,#ffffff 30%,#a9a5bd)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Записник
              </h1>

            </div>

            {/* Числа й інструменти — один рядок і одна висота.

                Раніше смужка жила в лівій колонці під назвою, а
                кнопки — у правій, і вирівнювались вони по нижньому
                краю блоків різної висоти: на око це читалось як
                «майже на одній лінії», що гірше за явно різні рівні. */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div
                className="flex h-11 items-center overflow-hidden rounded-[14px]"
                style={{
                  background: 'linear-gradient(180deg,#ffffff0d,#ffffff04)',
                  border: '1px solid #1f1f29',
                  boxShadow: 'inset 0 1px 0 #ffffff0d',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {[
                  { v: folders.length, t: plural(folders.length, 'папка', 'папки', 'папок'), c: '#ffffff', icon: FolderIcon },
                  { v: active.length, t: plural(active.length, 'запис', 'записи', 'записів'), c: '#ffffff', icon: NotebookPen },
                  { v: `+${weekCount}`, t: 'за тиждень', c: '#8bf5c0', icon: TrendingUp },
                ].map(({ v, t, c, icon: I }, i) => (
                  <div key={t} className="flex h-full items-center">
                    {i > 0 && <span className="h-5 w-px" style={{ background: '#1f1f29' }} />}
                    <span className="flex items-center gap-2 px-4">
                      <I size={13} strokeWidth={1.9} style={{ color: c === '#ffffff' ? '#8f8da0' : c, flex: 'none' }} />
                      <span className="text-[16px] font-bold leading-none" style={{ fontFamily: T.display, color: c }}>{v}</span>
                      <span className="text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: '#8b8998' }}>{t}</span>
                    </span>
                  </div>
                ))}
              </div>

            <div className="flex items-center gap-2.5">
              <div
                onMouseEnter={() => setShelfHover(true)}
                onMouseLeave={() => setShelfHover(false)}
                className="flex h-11 w-[270px] items-center gap-2.5 rounded-[13px] py-0 pl-[15px] pr-2"
                style={{
                  /* Ховер — той самий стан, що й фокус, тільки в
                     піввсили: поле має відгукнутись на наближення
                     курсора, але не вдавати, що вже приймає текст. */
                  background: shelfFocus ? '#ffffff12' : shelfHover ? '#ffffff0f' : '#ffffff0a',
                  border: `1px solid ${shelfFocus ? `${A(0.55)}` : shelfHover ? '#32323f' : '#21212b'}`,
                  boxShadow: shelfFocus
                    ? `0 0 0 4px ${A(0.13)}, inset 0 1px 0 #ffffff14`
                    : 'inset 0 1px 0 #ffffff0d',
                  cursor: 'text',
                  transition: 'all .2s',
                }}
                onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
              >
                <Search size={15} strokeWidth={1.8} style={{ color: '#8b899a', flex: 'none' }} />
                <input
                  value={shelfQuery}
                  onChange={(e) => setShelfQuery(e.target.value)}
                  onFocus={() => setShelfFocus(true)}
                  onBlur={() => setShelfFocus(false)}
                  placeholder="Пошук"
                  className="w-full border-none bg-transparent text-[13.5px] font-medium outline-none"
                  style={{ fontFamily: T.sans, color: T.text }}
                />
                {shelfQuery && (
                  <button
                    onClick={() => setShelfQuery('')}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
                    style={{ color: '#8b899a' }}
                  >
                    <X size={13} strokeWidth={2.6} />
                  </button>
                )}
              </div>

              {/* Висота та сама, що в решти ряду: 44. Раніше група
                  збиралась із власних відступів і виходила на три
                  пікселі нижчою — рівно стільки, щоб рядок виглядав
                  зібраним недбало. */}
              <div className="flex h-11 items-center rounded-[13px] p-[3px]" style={{ background: '#ffffff0a', border: '1px solid #21212b' }}>
                {[{ k: 'grid', I: LayoutGrid, t: 'Плиткою' }, { k: 'list', I: Rows3, t: 'Списком' }].map(({ k, I, t }) => (
                  <button
                    key={k}
                    onClick={() => setShelfView(k)}
                    title={t}
                    className="grid h-full w-[35px] place-items-center rounded-[10px]"
                    style={{
                      background: shelfView === k ? '#ffffff14' : 'transparent',
                      boxShadow: shelfView === k ? 'inset 0 1px 0 #ffffff1f' : 'none',
                      color: shelfView === k ? '#ffffff' : '#7c7a8a',
                      transition: 'all .16s',
                    }}
                  >
                    <I size={15} strokeWidth={1.8} />
                  </button>
                ))}
              </div>

              <GradientCta onClick={addFolder}>Нова папка</GradientCta>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ─────────── Хедер папки ───────────

             Той самий кістяк, що й на полиці, але предмет інший: тут
             головне не «скільки в тебе папок», а «де я і що всередині».
             Тому назва папки йде поруч зі своєю іконкою в її ж кольорі,
             а під нею — два тихих факти: скільки записів і коли востаннє
             щось міняли. */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <button
              onClick={() => { setOpenId(null); setTag(null); setSearch(''); setScope('active'); }}
              className="inline-flex items-center gap-[7px] text-[13.5px] font-semibold transition-colors"
              style={{ fontFamily: T.sans, color: '#8a889a' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8a889a')}
            >
              <ChevronLeft size={14} strokeWidth={2} />
              до всіх папок
            </button>

            <div className="mt-[18px] flex flex-wrap items-start justify-between gap-9">
              <div className="min-w-0">
                <div className="flex items-center gap-3.5">
                  <span
                    className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl"
                    style={{
                      background: `${headColor}1f`,
                      border: `1px solid ${headColor}4d`,
                      boxShadow: `inset 0 1px 0 ${headColor}55, 0 12px 30px -14px ${headColor}99`,
                      color: headColor,
                    }}
                  >
                    {scope === 'archive'
                      ? <Archive size={22} strokeWidth={1.7} />
                      : openId === NO_FOLDER
                        ? <Inbox size={22} strokeWidth={1.7} />
                        : openFolder?.icon
                          ? <span className="text-[22px]">{openFolder.icon}</span>
                          : <FolderIcon size={22} strokeWidth={1.7} />}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-[9px]">
                      <span className="h-[5px] w-[5px] rounded-full" style={{ background: '#8b7cff', boxShadow: `0 0 12px 2px ${A(0.67)}` }} />
                      <span className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '2.4px', color: '#9b8dff' }}>
                        {scope === 'archive' ? 'Архів' : 'Папка'}
                      </span>
                    </div>
                    <h1
                      className="mt-2 truncate text-[32px] font-bold sm:text-[38px] lg:text-[44px]"
                      style={{
                        fontFamily: T.display,
                        letterSpacing: '-1.8px',
                        lineHeight: 1,
                        background: 'linear-gradient(170deg,#ffffff 34%,#a9a5bd)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      {headTitle}
                    </h1>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  {[
                    { I: NotebookPen, t: `${inScope.length} ${plural(inScope.length, 'запис', 'записи', 'записів')}` },
                    { I: Clock, t: `оновлено ${updatedOf(openId)}` },
                  ].map(({ I, t }) => (
                    <span
                      key={t}
                      className="flex items-center gap-2 rounded-[11px] py-1.5 pl-2.5 pr-3"
                      style={{ background: '#ffffff08', border: '1px solid #1f1f29' }}
                    >
                      <I size={13} strokeWidth={1.7} style={{ color: '#8b899a' }} />
                      <span className="text-[13px] font-semibold" style={{ fontFamily: T.sans, color: '#b9b7c6' }}>{t}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <div
                  onMouseEnter={() => setFeedHover(true)}
                  onMouseLeave={() => setFeedHover(false)}
                  onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
                  className="flex h-11 w-[262px] items-center gap-2.5 rounded-[13px] py-0 pl-[15px] pr-2"
                  style={{
                    background: feedFocus ? '#ffffff12' : feedHover ? '#ffffff0f' : '#ffffff0a',
                    border: `1px solid ${feedFocus ? A(0.55) : feedHover ? '#32323f' : '#21212b'}`,
                    boxShadow: feedFocus ? `0 0 0 4px ${A(0.13)}, inset 0 1px 0 #ffffff14` : 'inset 0 1px 0 #ffffff0d',
                    cursor: 'text',
                    transition: 'all .2s',
                  }}
                >
                  <Search size={15} strokeWidth={1.8} style={{ color: '#8b899a', flex: 'none' }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setFeedFocus(true)}
                    onBlur={() => setFeedFocus(false)}
                    placeholder="Пошук у папці"
                    className="w-full border-none bg-transparent text-[13.5px] font-medium outline-none"
                    style={{ fontFamily: T.sans, color: T.text }}
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ color: '#a3a1b2' }}>
                      <X size={13} strokeWidth={2.6} />
                    </button>
                  )}
                </div>

                <PanelBtn onClick={() => setSort((v) => (v === 'newest' ? 'oldest' : v === 'oldest' ? 'title' : 'newest'))}>
                  <ArrowDownUp size={14} strokeWidth={1.8} style={{ color: '#8b899a' }} />
                  <span className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: '#c2c0ce' }}>
                    {sort === 'newest' ? 'нові' : sort === 'oldest' ? 'старі' : 'за назвою'}
                  </span>
                </PanelBtn>

                {/* Архів зʼявляється тільки коли в ньому щось є: поки
                    людина нічого не архівувала, кнопка їй нічого не
                    каже, а місце в панелі забирає. */}
                {(archived.length > 0 || scope === 'archive') && (
                  <PanelBtn
                    active={scope === 'archive'}
                    onClick={() => { setScope((v) => (v === 'archive' ? 'active' : 'archive')); setTag(null); }}
                  >
                    <Archive size={14} strokeWidth={1.8} style={{ color: scope === 'archive' ? '#c4baff' : '#8b899a' }} />
                    <span className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: scope === 'archive' ? '#ffffff' : '#c2c0ce' }}>
                      {scope === 'archive' ? 'зі стрічки' : `архів ${archived.length}`}
                    </span>
                  </PanelBtn>
                )}

                <div className="flex h-11 items-center rounded-[13px] p-[3px]" style={{ background: '#ffffff0a', border: '1px solid #21212b' }}>
                  {[{ k: 'grid', I: LayoutGrid, t: 'Плиткою' }, { k: 'list', I: Rows3, t: 'Списком' }].map(({ k, I, t }) => (
                    <button
                      key={k}
                      onClick={() => setView(k)}
                      title={t}
                      className="grid h-full w-[35px] place-items-center rounded-[10px]"
                      style={{
                        background: view === k ? '#ffffff14' : 'transparent',
                        boxShadow: view === k ? 'inset 0 1px 0 #ffffff1f' : 'none',
                        color: view === k ? '#ffffff' : '#7c7a8a',
                        transition: 'all .16s',
                      }}
                    >
                      <I size={15} strokeWidth={1.8} />
                    </button>
                  ))}
                </div>

                <GradientCta onClick={() => setEditing(blankForm(openId && openId !== NO_FOLDER ? openId : null))}>
                  Нова нотатка
                </GradientCta>
              </div>
            </div>

            {/* Теги папки — рядком, а не у випадайці.

                Випадайка ховала те, чим фільтрують найчастіше, і при
                цьому не показувала, скільки за кожним тегом стоїть
                записів. Тут видно і те, і те, а зайвого не буде: у
                рядку тільки ті теги, які справді зустрічаються в цій
                папці. */}
            {feedTags.length > 0 && (
              <div className="mt-[30px] flex flex-wrap items-center gap-2.5 pb-0.5">
                <span className="mr-1 text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '2px', color: '#8b8998' }}>
                  Теги
                </span>
                {feedTags.map((t) => (
                  <FilterPill
                    key={t.id || 'all'}
                    name={t.name}
                    count={t.count}
                    color={t.color}
                    active={tag === t.id}
                    onClick={() => setTag(tag === t.id ? null : t.id)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ─────────── Полиця з папками ─────────── */}
        {onShelf && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="mt-[46px]"
          >
            <SectionRule hint={!shelfQ && folders.length > 1 ? 'Перетягни, щоб змінити порядок' : null}>Папки</SectionRule>

            <FolderBoard
              folders={shelfFolders}
              view={shelfView}
              /* Поки список відфільтрований, порядок міняти нічим: на
                 екрані не всі папки, і «перед сусідом» означало б не
                 те, що людина бачить. */
              sortable={!shelfQ}
              countOf={countOf}
              previewOf={previewOf}
              updatedOf={updatedOf}
              looseCount={looseCount}
              onOpen={setOpenId}
              onCreate={addFolder}
              onRename={renameFolder}
              onDelete={dropFolder}
              onReorder={saveOrder}
            />

            {/* Останні записи — щоб з полиці можна було повернутись до
                вчорашнього, не згадуючи, в якій воно папці. */}
            {recent.length > 0 && (
              <>
                <div className="mt-[52px]">
                  <SectionRule
                    right={(
                      <button
                        onClick={() => setOpenId(NO_FOLDER)}
                        className="text-[13px] font-semibold transition-colors"
                        style={{ fontFamily: T.sans, color: '#a99cff' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#c4baff')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#a99cff')}
                      >
                        Всі записи →
                      </button>
                    )}
                  >
                    Останні записи
                  </SectionRule>
                </div>

                <div className="mt-[18px] grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
                  {recent.map((n) => (
                    <RecentCard
                      key={n.id}
                      note={n}
                      folder={folders.find((f) => f.id === n.folder_id) || null}
                      onOpen={() => setReadId(n.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ─────────── Записи ─────────── */}
        {loading ? (
          <div className="flex items-center justify-center gap-2.5 py-28">
            <Loader2 size={18} className="animate-spin" style={{ color: T.acc }} />
            <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              дістаю нотатки…
            </span>
          </div>
        ) : onShelf ? null : filtered.length === 0 ? (
          /* Порожньо буває з двох різних причин, і плутати їх не
             можна: коли в папці ще нічого немає — це запрошення
             написати, коли нічого не знайшлось — підказка змінити
             запит. */
          <div
            className="mt-6 flex flex-col items-center justify-center rounded-[20px] px-6 py-14 text-center"
            style={{ border: '1.5px dashed #24242f', background: '#ffffff03' }}
          >
            <span
              className="grid h-12 w-12 place-items-center rounded-[15px]"
              style={{ background: '#ffffff0a', border: '1px solid #26262f', color: '#7c7a8a' }}
            >
              {inScope.length > 0 ? <Search size={20} strokeWidth={1.8} /> : <NotebookPen size={20} strokeWidth={1.8} />}
            </span>

            <div className="mt-3.5 text-[15px] font-semibold" style={{ fontFamily: T.display, color: '#b3b1c0' }}>
              {inScope.length > 0
                ? 'Нічого не знайшлось'
                : scope === 'archive' ? 'Архів порожній' : 'Тут поки порожньо'}
            </div>
            <div className="mt-1.5 max-w-[420px] text-[13px]" style={{ fontFamily: T.sans, color: '#7d7b8e', lineHeight: 1.7 }}>
              {inScope.length > 0
                ? 'Спробуй інший запит або скинь фільтр по тегах'
                : scope === 'archive'
                  ? 'Сюди потрапляє відпрацьоване: те, що вже зроблено, але викидати шкода.'
                  : 'Записуй усе, що варто памʼятати. Теги допоможуть знайти це через місяць.'}
            </div>

            <div className="mt-5">
              {inScope.length > 0 ? (
                <button
                  onClick={() => { setTag(null); setSearch(''); }}
                  className="h-10 rounded-xl px-4 text-[13px] font-semibold"
                  style={{ background: '#ffffff0a', border: '1px solid #2a2a35', color: '#c2c0ce', fontFamily: T.sans }}
                >
                  Скинути фільтри
                </button>
              ) : scope !== 'archive' && (
                <GradientCta onClick={() => setEditing(blankForm(openId && openId !== NO_FOLDER ? openId : null))}>
                  Написати першу
                </GradientCta>
              )}
            </div>
          </div>
        ) : view === 'grid' ? (
          <>
            {scope !== 'archive' && (
              <QuickNoteBar onClick={() => setEditing(blankForm(openId && openId !== NO_FOLDER ? openId : null))} />
            )}
            <div
            className="mt-5 grid items-stretch gap-4"
            /* Рядок сітки фіксований: інакше «висока» картка тягла б за
               собою всіх сусідів по рядку, і вибір однієї нотатки
               міняв би вигляд решти. */
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gridAutoRows: '214px' }}
          >
            {filtered.map((n) => (
              <NoteTile
                key={n.id}
                note={n}
                color={cardColor(n, (t) => tagColor(t, tree))}
                icon={cardOf(n).icon}
                pinned={cardOf(n).pin}
                cover={coverOf(n)}
                tall={cardOf(n).size === 'tall'}
                bg={cardOf(n).bg}
                trade={cardOf(n).trade}
                onTrade={(t) => navigate(`/backtest/${t.id}`)}
                date={fmtShort(n.created_at)}
                images={(n.images || []).filter((x) => typeof x === 'string').length}
                voices={cardOf(n).voice.length}
                pills={(n.tags || []).slice(0, 3).map((t) => ({ id: t, name: tagLabel(t), color: tagColor(t, tree) }))}
                onOpen={() => setReadId(n.id)}
                onEdit={() => openEdit(n)}
                onArchive={() => toggleArchive(n)}
                onDelete={() => setDeleteId(n.id)}
              />
            ))}
            </div>
          </>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            {scope !== 'archive' && (
              <QuickNoteBar onClick={() => setEditing(blankForm(openId && openId !== NO_FOLDER ? openId : null))} />
            )}
            <div className="flex items-center gap-[18px] px-[19px] pb-1">
              <span className="w-2 shrink-0" />
              {[
                { w: 0, t: 'Нотатка', a: 'left' },
                { w: 180, t: 'Теги', a: 'left' },
                { w: 96, t: 'Дата', a: 'right' },
              ].map(({ w, t, a }) => (
                <span
                  key={t}
                  style={{
                    flex: w ? 'none' : 1,
                    width: w || undefined,
                    minWidth: w ? undefined : 0,
                    textAlign: a,
                    fontFamily: T.mono,
                    fontSize: 9,
                    letterSpacing: '1.8px',
                    color: '#8b8998',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  {t}
                </span>
              ))}
              <span className="w-[104px] shrink-0" />
            </div>

            {filtered.map((n) => (
              <NoteLine
                key={n.id}
                note={n}
                color={cardColor(n, (t) => tagColor(t, tree))}
                icon={cardOf(n).icon}
                pinned={cardOf(n).pin}
                date={fmtShort(n.created_at)}
                pills={(n.tags || []).map((t) => ({ id: t, name: tagLabel(t), color: tagColor(t, tree) }))}
                onOpen={() => setReadId(n.id)}
                onEdit={() => openEdit(n)}
                onArchive={() => toggleArchive(n)}
                onDelete={() => setDeleteId(n.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─────────── Шари ─────────── */}
      <AnimatePresence>
        {reading && (
          <NoteReader
            key="reader"
            note={reading}
            tree={tree}
            fmtDate={fmtDate}
            onClose={() => setReadId(null)}
            onEdit={() => openEdit(reading)}
            folders={folders}
            onDelete={() => setDeleteId(reading.id)}
            onArchive={() => toggleArchive(reading)}
            onMove={(fid) => moveNote(reading, fid)}
            onTagClick={(t) => { setTag(t); setReadId(null); }}
            onImage={setLightbox}
            onToggleCheck={(description) => saveNote({ ...reading, description, session_date: (reading.created_at || todayISO()).slice(0, 10) })}
            onPin={(pin) => saveNote({
              ...reading,
              card: cardToSave({ ...cardOf(reading), pin }),
              session_date: (reading.created_at || todayISO()).slice(0, 10),
            })}
            onTrade={(t) => navigate(`/backtest/${t.id}`)}
            /* Сусідні нотатки беремо з того самого списку, який людина
               бачить: якщо ввімкнено фільтр, «далі» має вести всередині
               нього, а не в те, що зараз сховане. */
            onPrev={neighbours.prev ? () => setReadId(neighbours.prev) : null}
            onNext={neighbours.next ? () => setReadId(neighbours.next) : null}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <NoteEditor
            key="editor"
            initial={editing}
            tree={tree}
            folders={folders}
            userId={user?.id}
            onTreeChange={setTree}
            onCancel={() => setEditing(null)}
            onSave={saveNote}
            onImage={setLightbox}
          />
        )}
      </AnimatePresence>

      {/* вікно нової папки */}
      <AnimatePresence>
        {creating && (
          <FolderDialog
            key="new-folder"
            fresh
            folder={{ name: '', color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length], pinned: false, icon: '' }}
            onSave={createFolderFrom}
            onClose={() => setCreating(false)}
          />
        )}
      </AnimatePresence>

      {/* видалення */}
      <AnimatePresence>
        {deleteId != null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setDeleteId(null)}
            className="fixed inset-0 z-[300] grid place-items-center p-4"
            style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] rounded-2xl p-7 text-center"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 40px 90px -30px rgba(0,0,0,0.95)' }}
            >
              <div
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.badRgb},0.10)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
              >
                <Trash2 size={22} strokeWidth={1.9} style={{ color: T.bad }} />
              </div>
              <div className="mb-2.5 text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
                Видалити нотатку?
              </div>
              <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                Запис зникне назавжди — скасувати не вийде.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setDeleteId(null)}
                  className="h-11 flex-1 rounded-xl text-[14px] font-semibold"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                >
                  Залишити
                </button>
                <button
                  onClick={confirmDelete}
                  className="h-11 flex-1 rounded-xl text-[14px] font-bold transition-transform active:scale-[0.98]"
                  style={{ background: T.bad, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  Видалити
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* лайтбокс */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[400] grid cursor-zoom-out place-items-center p-6"
            style={{ background: 'rgba(4,4,6,0.94)', backdropFilter: 'blur(8px)' }}
          >
            <motion.img
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
              src={lightbox}
              alt=""
              className="max-h-[92vh] max-w-[92vw] rounded-2xl"
              style={{ border: `1px solid ${T.lineHi}` }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
