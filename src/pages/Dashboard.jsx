import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Plus, ArrowDownUp, LayoutGrid, Rows3,
  NotebookPen, Trash2, Image as ImageIcon, Loader2,
  Archive, ArchiveRestore, ChevronLeft, FolderInput,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { notify } from '../utils/notify';
import useCloudState from '../hooks/useCloudState';
import { T, EASE, useEdgeFonts, stagger, fadeUp } from '../lib/theme';
import {
  DEFAULT_TREE, CAT_COLORS, noteMatchesTag, splitTag, tagColor, orphanTags,
} from '../lib/noteTags';
import {
  fetchNotes, saveNote as pushNote, removeNote, setNoteArchived, setNoteFolder,
  migrateLegacyNotes, uid, todayISO,
} from '../lib/notesStore';
import {
  fetchFolders, createFolder, updateFolder, removeFolder, reorderFolders,
  createDefaultFolders, FOLDER_COLORS, NO_FOLDER,
} from '../lib/foldersStore';
import { removeImages } from '../lib/imageStore';
import FolderBoard, { FolderDialog } from '../components/notes/FolderBoard';
import NotesBackdrop from '../components/notes/NotesBackdrop';
import TagPicker, { TagChip } from '../components/notes/TagPicker';
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
  tags: [], session_date: todayISO(), folder_id: folderId,
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

/* ---------- панель інструментів ----------

   Було: сім самостійних кнопок, кожна зі своєю рамкою. Кожна
   рамка — це лінія, і сім ліній поспіль читаються як сім різних
   за важливістю речей, хоча насправді там одна дія (створити) і
   шість способів подивитись на те саме.

   Стало: рамку має тільки зовнішня оболонка, а всередині —
   кнопки без власних меж, розділені тонкими рисками. Разом вони
   виглядають як один прилад, і акцентна кнопка справа нарешті
   лишається єдиним яскравим плямою в рядку.

   Висота всюди 40: 42 було довільним числом, від якого панель
   здавалась на пів сходинки вищою за все інше на сторінці. */
const ToolBtn = ({ children, onClick, title, active }) => (
  <button
    onClick={onClick}
    title={title}
    className="flex h-[40px] items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors"
    style={{
      fontFamily: T.sans,
      background: active ? T.surfaceHi : 'transparent',
      color: active ? T.text : T.text2,
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.surfaceHi; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
  >
    {children}
  </button>
);

/* Оболонка групи: одна рамка на кілька кнопок */
const ToolGroup = ({ children }) => (
  <div
    className="flex items-center gap-0.5 rounded-xl p-1"
    style={{ background: T.surface, border: `1px solid ${T.line}` }}
  >
    {children}
  </div>
);

const Divider = () => (
  <span className="mx-0.5 h-5 w-px shrink-0" style={{ background: T.line }} />
);

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
  const [freshId, setFreshId] = useState(null);

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

  /* Esc закриває верхній шар */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (lightbox) return setLightbox(null);
      if (deleteId != null) return setDeleteId(null);
      if (freshId) return setFreshId(null);
      if (editing) return setEditing(null);
      if (readId != null) return setReadId(null);
      /* останнім шаром — вихід із папки на полицю */
      if (openId != null) return setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, deleteId, freshId, editing, readId, openId]);

  /* теги, що є в нотатках, але зникли з дерева — щоб не губились */
  const orphans = useMemo(() => orphanTags(tree, notes), [tree, notes]);

  /* Архів свідомо не рахується в жодній цифрі поруч з робочою
     стрічкою: сенс архіву в тому, щоб він не маячив перед очима, а
     лічильник тегів з архівними всередині — це те саме маячіння,
     тільки числом. */
  const active = useMemo(() => notes.filter((n) => !n.archived), [notes]);
  const archived = useMemo(() => notes.filter((n) => n.archived), [notes]);

  /* Полиця показується тільки коли папки справді є. Порожня полиця
     з єдиною кнопкою — це зайвий екран між людиною і її нотатками. */
  const hasFolders = folders.length > 0;
  const onShelf = hasFolders && openId === null;

  const looseCount = useMemo(
    () => active.filter((n) => !n.folder_id).length,
    [active],
  );
  const countOf = (id) => active.filter((n) => n.folder_id === id).length;

  const openFolder = openId && openId !== NO_FOLDER
    ? folders.find((f) => f.id === openId) || null
    : null;

  /* Архів навмисно наскрізний: він показує все відпрацьоване разом,
     незалежно від полиці. Шукати старий запис по папках, коли ти вже
     не памʼятаєш, у якій він лежав, — це та сама проблема, від якої
     папки мали врятувати. */
  const scoped = useMemo(() => {
    const base = scope === 'archive' ? archived : active;
    if (scope === 'archive' || !hasFolders || openId === null) return base;
    if (openId === NO_FOLDER) return base.filter((n) => !n.folder_id);
    return base.filter((n) => n.folder_id === openId);
  }, [active, archived, scope, hasFolders, openId]);

  const inScope = scoped;

  const counts = useMemo(() => {
    const c = {};
    inScope.forEach((n) => (n.tags || []).forEach((t) => {
      c[t] = (c[t] || 0) + 1;
      const [cat, sub] = splitTag(t);
      if (sub) c[cat] = (c[cat] || 0) + 1;
    }));
    return c;
  }, [inScope]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const r = inScope.filter((n) => {
      const hitSearch = !q
        || (n.title || '').toLowerCase().includes(q)
        || (n.description || '').toLowerCase().includes(q)
        || (n.tags || []).some((t) => t.toLowerCase().includes(q));
      return hitSearch && noteMatchesTag(n.tags, tag);
    });
    r.sort((a, b) => (sort === 'newest'
      ? new Date(b.created_at) - new Date(a.created_at)
      : new Date(a.created_at) - new Date(b.created_at)));
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
    };

    const before = notes;
    setNotes((list) => (isNew ? [data, ...list] : list.map((n) => (n.id === data.id ? data : n))));
    setEditing(null);

    try {
      await pushNote(user.id, data);
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

    setNotes((list) => list.map((x) => (x.id === n.id ? { ...x, archived: next } : x)));
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

    setNotes((list) => list.map((x) => (x.id === n.id ? { ...x, folder_id: next } : x)));

    try {
      await setNoteFolder(user.id, n.id, next);
    } catch (err) {
      setNotes(before);
      notify.error('Не вдалось перенести', err.message);
    }
  };

  /* ---------- папки ---------- */

  const addFolder = async () => {
    const before = folders;
    try {
      const f = await createFolder(user.id, {
        name: 'Нова папка',
        color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length],
        position: folders.length,
      });
      setFolders((l) => [...l, f]);
      /* Одразу питаємо назву. Без цього людина натискала «Нова
         папка» тричі і отримувала три полиці з однаковим написом:
         перейменування було окремою дією, про яку ще треба
         здогадатись, бо олівець зʼявляється лише на ховері.

         Питати назву в момент створення дешевше, ніж пояснювати
         потім, де її змінити. */
      setFreshId(f.id);
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
    setFolders((l) => sortFolders(l.map((x) => (x.id === f.id ? { ...x, ...patch } : x))));
    try {
      await updateFolder(user.id, f.id, patch);
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
    /* Позиції перенумеровуємо одразу — інакше наступне закріплення
       сортувало б за старими значеннями і порядок стрибнув би. */
    const next = ordered.map((f, i) => ({ ...f, position: i }));
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
  const hasFilters = !!tag || !!search;

  /* ---------- дрібні блоки ---------- */

  const NoteCard = ({ n }) => {
    const imgs = (n.images || []).filter((x) => typeof x === 'string');
    const accent = (n.tags || []).length ? tagColor(n.tags[0], tree) : T.lineHi;

    return (
      <motion.article
        layout
        variants={fadeUp}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
        onClick={() => setReadId(n.id)}
        whileHover={{ y: -3 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl transition-colors duration-300"
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
      >
        {/* тонка смужка кольору першого тега — орієнтир, а не прикраса */}
        <span className="absolute inset-y-0 left-0 w-[2px] transition-all duration-300 group-hover:w-[3px]" style={{ background: accent, opacity: 0.55 }} />

        <div className="absolute right-3 top-3 z-10 flex gap-1.5 opacity-0 transition-all duration-200 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); toggleArchive(n); }}
            title={n.archived ? 'Повернути зі стрічки' : 'В архів'}
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
            style={{ background: 'rgba(10,10,12,0.8)', border: `1px solid ${T.line}`, color: T.text3, backdropFilter: 'blur(8px)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            {n.archived
              ? <ArchiveRestore size={14} strokeWidth={2.2} />
              : <Archive size={14} strokeWidth={2.2} />}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(n.id); }}
            title="Видалити"
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
            style={{ background: 'rgba(10,10,12,0.8)', border: `1px solid ${T.line}`, color: T.text3, backdropFilter: 'blur(8px)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        </div>

        {imgs.length > 0 ? (
          <div className="relative ml-[2px] overflow-hidden" style={{ aspectRatio: '16/9', borderBottom: `1px solid ${T.line}` }}>
            <img src={imgs[0]} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            {imgs.length > 1 && (
              <span
                className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold tabular-nums"
                style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${T.line}`, color: T.text2, backdropFilter: 'blur(8px)', fontFamily: T.sans }}
              >
                <ImageIcon size={11} strokeWidth={2.4} /> {imgs.length}
              </span>
            )}
          </div>
        ) : (
          /* заглушка — тримає однакову висоту карток, коли скріна немає */
          <div
            className="relative ml-[2px] grid place-items-center overflow-hidden"
            style={{
              aspectRatio: '16/9',
              borderBottom: `1px solid ${T.line}`,
              background: `linear-gradient(160deg, ${T.surfaceHi}, ${T.sunken})`,
            }}
          >
            <NotebookPen size={22} strokeWidth={1.5} style={{ color: T.text4, opacity: 0.5 }} />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-3 p-5 pl-6">
          <span className="text-[12.5px] font-medium" style={{ fontFamily: T.sans, color: T.text4 }}>
            {fmtDate(n.created_at)}
          </span>

          <h3
            className="text-[18px] font-bold leading-[1.35]"
            style={{
              fontFamily: T.display, color: T.text, letterSpacing: '-0.015em',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {n.title}
          </h3>

          {n.description && (
            <p
              className="text-[14px]"
              style={{
                fontFamily: T.sans, color: T.text3, lineHeight: 1.68,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {n.description}
            </p>
          )}

          {(n.tags || []).length > 0 && (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-3" style={{ borderTop: `1px solid ${T.line}` }}>
              {n.tags.slice(0, 3).map((t) => (
                <TagChip key={t} id={t} tree={tree} onClick={(e) => { e?.stopPropagation?.(); setTag(t); }} />
              ))}
              {n.tags.length > 3 && (
                <span className="self-center text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  +{n.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </motion.article>
    );
  };

  const NoteRow = ({ n }) => {
    const imgs = (n.images || []).filter((x) => typeof x === 'string');
    const accent = (n.tags || []).length ? tagColor(n.tags[0], tree) : T.lineHi;

    return (
      <motion.div
        layout
        variants={fadeUp}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
        onClick={() => setReadId(n.id)}
        whileHover={{ x: 3 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-xl px-5 py-4 transition-colors duration-300"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
      >
        <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: accent, opacity: 0.55 }} />

        <span className="w-[76px] shrink-0 text-[13px] font-medium tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
          {fmtShort(n.created_at)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
            {n.title}
          </div>
          {n.description && (
            <div className="mt-0.5 truncate text-[13.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              {n.description}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {(n.tags || []).slice(0, 2).map((t) => (
            <TagChip key={t} id={t} tree={tree} onClick={(e) => { e?.stopPropagation?.(); setTag(t); }} />
          ))}
        </div>

        {imgs.length > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
            <ImageIcon size={13} strokeWidth={2.2} /> {imgs.length}
          </span>
        )}

        <div className="flex shrink-0 gap-1.5 opacity-0 transition-all group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); toggleArchive(n); }}
            title={n.archived ? 'Повернути зі стрічки' : 'В архів'}
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
            style={{ border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            {n.archived
              ? <ArchiveRestore size={13} strokeWidth={2.2} />
              : <Archive size={13} strokeWidth={2.2} />}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(n.id); }}
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
            style={{ border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            <Trash2 size={13} strokeWidth={2.2} />
          </button>
        </div>
      </motion.div>
    );
  };

  /* ================================================================== */

  return (
    <div className="relative min-h-full">
      <NotesBackdrop />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Нотатки
            </div>
            <h1
              className="text-[28px] font-bold leading-none sm:text-[38px] lg:text-[46px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              {onShelf ? 'Записник' : (openFolder?.name || (openId === NO_FOLDER ? 'Без папки' : 'Записник'))}
            </h1>

            {/* Дорога назад показується тільки коли є куди повертатись */}
            {hasFolders && openId !== null && (
              <button
                onClick={() => { setOpenId(null); setTag(null); setSearch(''); }}
                className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold transition-colors"
                style={{ fontFamily: T.sans, color: T.text3 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
              >
                <ChevronLeft size={15} strokeWidth={2.6} />
                до всіх папок
              </button>
            )}

            <p className="mt-3 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {onShelf ? (
                <>
                  {folders.length} {folders.length === 1 ? 'папка' : 'папок'} · {active.length} {active.length === 1 ? 'запис' : 'записів'}
                </>
              ) : (
                <>
                  {scope === 'archive' ? 'Архів · ' : ''}
                  {inScope.length} {inScope.length === 1 ? 'запис' : 'записів'}
                  {tag && <> · у фільтрі {filtered.length}</>}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* На полиці інструменти стрічки не потрібні: шукати й
                сортувати нема чого, там лише папки. Лишаємо архів —
                він наскрізний — і створення. */}
            {onShelf ? (
              <>
                {archived.length > 0 && (
                  <ToolGroup>
                    <ToolBtn
                      onClick={() => { setScope('archive'); setOpenId(NO_FOLDER); setTag(null); }}
                      title="Показати архів"
                    >
                      <Archive size={15} strokeWidth={2.2} style={{ color: T.text3 }} />
                      архів {archived.length}
                    </ToolBtn>
                  </ToolGroup>
                )}
                <CtaBtn onClick={addFolder}>Нова папка</CtaBtn>
              </>
            ) : (
              <>
            {/* Пошук стоїть окремо від решти: він єдиний тут
                приймає введення, а не перемикає вигляд. */}
            <div
              className="flex h-[42px] w-full items-center gap-2.5 rounded-xl px-3.5 transition-colors sm:w-[240px]"
              style={{ background: T.surface, border: `1px solid ${search ? T.lineHi : T.line}` }}
              onFocusCapture={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
              onBlurCapture={(e) => (e.currentTarget.style.borderColor = search ? T.lineHi : T.line)}
            >
              <Search size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук…"
                className="w-full bg-transparent text-[14px] outline-none"
                style={{ fontFamily: T.sans, color: T.text }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ color: T.text4 }}>
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {/* Один прилад: чим фільтруємо, як сортуємо, що
                показуємо. Усе це відповіді на питання «яку частину
                записника я зараз бачу». */}
            <ToolGroup>
              <TagPicker
                tree={tree}
                onTreeChange={setTree}
                selected={tag}
                onSelect={setTag}
                counts={counts}
                label="Теги"
                align="right"
                width={310}
              />

              <Divider />

              <ToolBtn onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))} title="Порядок">
                <ArrowDownUp size={15} strokeWidth={2.2} style={{ color: T.text3 }} />
                {sort === 'newest' ? 'нові' : 'старі'}
              </ToolBtn>

              {/* Архів зʼявляється тільки коли в ньому щось є: поки
                  людина нічого не архівувала, кнопка їй нічого не
                  каже, а місце в панелі забирає. */}
              {(archived.length > 0 || scope === 'archive') && (
                <>
                  <Divider />
                  <ToolBtn
                    onClick={() => { setScope((s) => (s === 'archive' ? 'active' : 'archive')); setTag(null); }}
                    title={scope === 'archive' ? 'Повернутись до стрічки' : 'Показати архів'}
                    active={scope === 'archive'}
                  >
                    <Archive size={15} strokeWidth={2.2} style={{ color: scope === 'archive' ? T.acc : T.text3 }} />
                    {scope === 'archive' ? 'зі стрічки' : `архів ${archived.length}`}
                  </ToolBtn>
                </>
              )}

              <Divider />

              {/* Плитка чи список — іконками: підписи тут нічого не
                  додають, бо самі значки однозначні. */}
              {[{ k: 'grid', I: LayoutGrid, t: 'Плитка' }, { k: 'list', I: Rows3, t: 'Список' }].map(({ k, I, t }) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  title={t}
                  className="grid h-[40px] w-[38px] place-items-center rounded-[10px] transition-colors"
                  style={{
                    background: view === k ? `rgba(${T.accRgb},0.13)` : 'transparent',
                    color: view === k ? T.acc : T.text4,
                  }}
                  onMouseEnter={(e) => { if (view !== k) { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text3; } }}
                  onMouseLeave={(e) => { if (view !== k) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text4; } }}
                >
                  <I size={15} strokeWidth={2.2} />
                </button>
              ))}

              {/* Поки папок немає, полиці не існує — але завести
                  першу звідкись треба. Одна тиха кнопка, а не
                  порожній екран з пропозицією організувати нотатки. */}
              {!hasFolders && (
                <>
                  <Divider />
                  <ToolBtn onClick={addFolder} title="Завести першу папку">
                    <FolderInput size={15} strokeWidth={2.2} style={{ color: T.text3 }} />
                    папки
                  </ToolBtn>
                </>
              )}
            </ToolGroup>

            <CtaBtn onClick={() => setEditing(blankForm(openId && openId !== NO_FOLDER ? openId : null))}>
              Нова нотатка
            </CtaBtn>
              </>
            )}
          </div>
        </motion.div>

        {/* ─────────── Полиця з папками ─────────── */}
        {onShelf && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <FolderBoard
              folders={folders}
              countOf={countOf}
              looseCount={looseCount}
              onOpen={setOpenId}
              onCreate={addFolder}
              onRename={renameFolder}
              onDelete={dropFolder}
              onReorder={saveOrder}
            />
          </motion.div>
        )}

        {/* активний фільтр */}
        <AnimatePresence>
          {!onShelf && hasFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="mb-5 flex flex-wrap items-center gap-2.5 overflow-hidden"
            >
              <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Знайдено {filtered.length}
              </span>
              {tag && <TagChip id={tag} tree={tree} showPath onRemove={() => setTag(null)} />}
              {(tag || search) && (
                <button
                  onClick={() => { setTag(null); setSearch(''); }}
                  className="text-[13px] font-semibold transition-colors"
                  style={{ fontFamily: T.sans, color: T.text3 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
                >
                  скинути
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* забуті теги — з видалених категорій */}
        {!onShelf && orphans.length > 0 && !tag && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Теги поза списком:
            </span>
            {orphans.map((t) => <TagChip key={t} id={t} tree={tree} showPath onClick={() => setTag(t)} />)}
          </div>
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
          <div className="flex flex-col items-center px-5 py-24 text-center">
            <div
              className="mb-6 grid h-16 w-16 place-items-center rounded-2xl"
              style={{ border: `1px dashed ${T.lineHi}`, color: T.text3 }}
            >
              <NotebookPen size={24} strokeWidth={1.7} />
            </div>
            <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
              {scope === 'archive' && inScope.length === 0 ? 'Архів порожній' : null}
              {scope !== 'archive' && inScope.length === 0 ? 'Тут поки порожньо' : null}
              {inScope.length > 0 ? 'Нічого не знайшлось' : null}
            </div>
            <p className="mb-7 max-w-[420px] text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {scope === 'archive' && inScope.length === 0
                ? 'Сюди потрапляє відпрацьоване: те, що вже зроблено або взято до відома, але викидати шкода. Зі стрічки нотатка ховається, з записника — ні.'
                : null}
              {scope !== 'archive' && inScope.length === 0
                ? 'Записуй усе, що варто памʼятати: розбір сетапу, думку про власну голову, ідею на потім. Теги допоможуть знайти це через місяць.'
                : null}
              {inScope.length > 0 ? 'Спробуй прибрати фільтр або пошукати іншими словами.' : null}
            </p>
            {notes.length === 0 ? (
              <button
                onClick={() => setEditing(blankForm(openId && openId !== NO_FOLDER ? openId : null))}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-bold"
                style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
              >
                <Plus size={15} strokeWidth={3} /> Написати першу
              </button>
            ) : (
              <button
                onClick={() => { setTag(null); setSearch(''); }}
                className="h-11 rounded-xl px-5 text-[14px] font-semibold"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              >
                Скинути фільтри
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          <motion.div
            layout
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            style={{ alignItems: 'start' }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((n) => <NoteCard key={n.id} n={n} />)}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div layout variants={stagger} initial="hidden" animate="visible" className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((n) => <NoteRow key={n.id} n={n} />)}
            </AnimatePresence>
          </motion.div>
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

      {/* назва для щойно створеної папки */}
      <AnimatePresence>
        {freshId && folders.some((f) => f.id === freshId) && (
          <FolderDialog
            key="fresh-folder"
            fresh
            folder={folders.find((f) => f.id === freshId)}
            onSave={(patch) => {
              renameFolder(folders.find((f) => f.id === freshId), patch);
              setFreshId(null);
            }}
            /* Закрив без назви — папка лишається з технічним
               «Нова папка». Видаляти її тут було б надто різко:
               людина натиснула «створити», а не «передумав». */
            onClose={() => setFreshId(null)}
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
