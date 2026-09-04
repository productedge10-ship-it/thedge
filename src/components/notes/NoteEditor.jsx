import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ImagePlus, Link2, Check, Loader2, Maximize2, Pencil, Plus, ChevronDown, Link, Eye, Mic,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { notify } from '../../utils/notify';
import { uploadImage, uploadDataUrl, uploadAudio, isHttpUrl, isDataUrl } from '../../lib/imageStore';
import { uid } from '../../lib/notesStore';
import { supabase } from '../../lib/supabase';
import { renderMd, highlightMd } from '../../lib/mdLite';
import VoiceCapture from './VoiceCapture';
import TagPicker, { TagChip } from './TagPicker';
import DateField from '../ui/DateField';
import { CARD_COLORS, CARD_ICONS, CARD_SIZES, CARD_BGS, cardOf, cardToSave, cardBackground } from '../../lib/noteCard';

/* ==================================================================
   Редактор нотатки.

   Розкладка з макета: зліва письмо, справа службове. Це не просто
   інша сітка — це інша черга дій. Раніше папка, теги й дата стояли
   під текстом, тобто людина спершу дописувала, а потім гортала
   вниз, щоб сказати, куди це покласти. Тепер усе, крім самого
   тексту, стоїть збоку й не змагається з ним за увагу.

   Зона графіків лишилась тією ж, що й була, і тим самим жестом, що
   в TDA: Ctrl+V, перетягування, клік. Людина, яка навчилась
   вставляти графік у план, не вчиться цього вдруге.
================================================================== */

const MAX_IMAGES = 8;

/* Вікно має стояти по центру робочої області, а не екрана: зліва
   лежить бічна панель застосунку, і центр екрана — це не той центр,
   який людина бачить. Міряємо <main>, бо саме він і є «сторінка». */
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

/* Акцент у темі — CSS-змінна, а не hex, тому альфу до нього не можна
   дописати рядком: `var(--edge-acc)8c` браузер викидає цілком. */
const A = (a) => `rgba(${T.accRgb}, ${a})`;

const SPRING = 'transform .3s cubic-bezier(.22,1.2,.36,1), border-color .18s, background .18s, box-shadow .24s';

/* Одна типографіка на два шари редактора. Виносимо в константу не
   заради краси: варто цим двом розійтись хоч на піввідсотка
   міжрядкового — і підсвічування поїде від тексту. */
const TYPO = {
  fontFamily: T.sans,
  fontSize: 15.5,
  lineHeight: 1.7,
  letterSpacing: 'normal',
  color: '#eceaf4',
  margin: 0,
  padding: 0,
  border: 0,
  tabSize: 4,
};

/* Шаблони.

   Порожній аркуш — найдорожча частина нотатки: поки думаєш, з чого
   почати, думка встигає піти. Каркас коштує один клік і знімає це
   питання. Заповнений текст ніколи не затирається: якщо вже щось
   написано, каркас дописується знизу. */
const BULLET = '• ';
const BOX = '☐ ';
const DONE = '☑ ';

const TEMPLATES = {
  'Порожня': '',
  'Чекліст': BOX,
  'Ідея': '**Ідея:** \n\n**Навіщо:** \n\n**Перший крок:** ',
  'Огляд дня': '## Що працювало\n' + BULLET + '\n\n## Що ні\n' + BULLET + '\n\n## Висновок\n',
};

/* Маркери, які редактор продовжує сам. Порядок важливий: довші
   перевіряються першими, інакше «☑ » сплуталось би з нічим. */
const MARKERS = [BOX, DONE, BULLET, '- [ ] ', '- [x] ', '- '];
const markerOf = (line) => MARKERS.find((m) => line.startsWith(m)) || null;

/* Кнопки розмітки. Обгортають виділене або ставлять префікс рядка —
   те саме, що робить рука, тільки без згадування синтаксису. */
const TOOLS = [
  { label: 'B', title: 'Жирний', wrap: '**', weight: 700 },
  { label: 'I', title: 'Курсив', wrap: '*', weight: 500, italic: true },
  { label: 'H', title: 'Заголовок', prefix: '## ', weight: 700 },
  { label: '•', title: 'Список', prefix: BULLET, weight: 600 },
  { label: '☑', title: 'Чекліст', prefix: BOX, weight: 500 },
  { label: '1.', title: 'Нумерований список', prefix: '1. ', weight: 600, numbered: true },
  { label: '⌗', title: 'Код', wrap: '`', weight: 500 },
];

/* Куди відкривати випадашку.

   Вікно стоїть по центру, тому нижні секції бічної колонки майже
   впритул до краю екрана: панель, відкрита вниз, наполовину вилазить
   за нього. Міряємо, скільки місця під кнопкою й над нею, і
   відкриваємось у той бік, де його більше — та ще й обмежуємо висоту
   тим, що є насправді. */
function useDropSpace(open, ref) {
  const [box, setBox] = useState({ up: false, max: 320 });

  useEffect(() => {
    if (!open || !ref.current) return undefined;

    const measure = () => {
      const r = ref.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 16;
      const above = r.top - 16;
      const up = below < 260 && above > below;
      setBox({ up, max: Math.max(180, Math.min(up ? above : below, 460)) });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, ref]);

  return box;
}

function ToolButton({ tool, onClick }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      type="button"
      title={tool.title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="grid h-7 w-7 place-items-center rounded-lg text-[13.5px]"
      style={{
        background: hov ? '#ffffff14' : '#ffffff08',
        border: `1px solid ${hov ? '#33333f' : '#21212b'}`,
        color: hov ? '#ffffff' : '#8f8d9c',
        fontFamily: T.sans,
        fontWeight: tool.weight,
        fontStyle: tool.italic ? 'italic' : 'normal',
        transition: 'all .16s',
      }}
    >
      {tool.label}
    </button>
  );
}

/* Плашка вибору: шаблон угорі, папка збоку. Активна світиться своїм
   кольором, решта мовчить. */
function PickRow({ color, active, children, onClick }) {
  const [hov, setHov] = useState(false);
  const c = color || T.acc;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex h-[38px] w-full items-center gap-2.5 rounded-[11px] px-3 text-[13.5px] font-semibold"
      style={{
        fontFamily: T.sans,
        background: active ? `${c}20` : hov ? '#ffffff0d' : '#ffffff06',
        border: `1px solid ${active ? `${c}73` : hov ? '#2c2c38' : '#1e1e27'}`,
        color: active ? '#ffffff' : '#8f8d9c',
        transition: 'all .16s',
      }}
    >
      {children}
    </button>
  );
}

const PanelLabel = ({ children }) => (
  <span className="text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.5px', color: '#9a98ab' }}>
    {children}
  </span>
);

const SideLabel = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.6px', color: '#9a98ab' }}>
      {children}
    </span>
    {right}
  </div>
);

export default function NoteEditor({
  initial, tree, folders = [], userId, onTreeChange, onCancel, onSave, onImage,
}) {
  const [form, setForm] = useState(initial);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(0);
  const [linkOpen, setLinkOpen] = useState(!!initial.chart_link);
  const [tpl, setTpl] = useState('Порожня');
  const [bodyFocus, setBodyFocus] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [preview, setPreview] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const contentBox = useContentBox();
  const [lookOpen, setLookOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [trades, setTrades] = useState(null);
  const lookRef = useRef(null);
  const tradeRef = useRef(null);
  const lookDrop = useDropSpace(lookOpen, lookRef);
  const tradeDrop = useDropSpace(tradeOpen, tradeRef);

  const card = cardOf(form);
  const setCard = (p) => patch({ card: cardToSave({ ...card, ...p }) });

  /* Колір, яким малюється вся картка: вибраний вручну, інакше колір
     першого тега, інакше нейтральний. */
  const look = card.color || (form.tags || [])[0] ? (card.color || T.acc) : '#6b6980';
  const custom = !!card.color && !CARD_COLORS.includes(card.color);
  const lookLabel = [
    card.icon ? 'з іконкою' : 'без іконки',
    CARD_BGS.find((b) => b.id === card.bg)?.name.toLowerCase(),
    card.size === 'tall' ? 'висока' : null,
  ].filter(Boolean).join(' · ');

  const fileRef = useRef(null);
  const bodyRef = useRef(null);
  const mirrorRef = useRef(null);
  /* id потрібен до першого збереження: картинки лягають у папку
     нотатки, і якщо його вигадувати аж при збереженні, файли вже
     завантаженої нотатки лежали б у чужому місці. */
  const idRef = useRef(initial.id || uid());

  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const addImage = (src) => setForm((f) => {
    const list = f.images || [];
    if (list.includes(src)) return f;
    if (list.length >= MAX_IMAGES) return f;
    return { ...f, images: [...list, src] };
  });

  const room = () => MAX_IMAGES - (form.images || []).length;

  /* ------------------------------------------------------------------
     Файли.

     Стиснення й завантаження йдуть до збереження нотатки, а не
     разом із ним: людина має побачити свій графік у картці одразу,
     а не дізнатись через півхвилини, що він не заліз.
  ------------------------------------------------------------------ */
  const takeFiles = useCallback(async (files) => {
    const imgs = Array.from(files || []).filter((f) => f && f.type.startsWith('image/'));
    if (!imgs.length) return;

    const free = room();
    if (free <= 0) {
      notify.error('Більше не влізе', `У нотатці максимум ${MAX_IMAGES} зображень.`);
      return;
    }

    const batch = imgs.slice(0, free);
    if (imgs.length > free) {
      notify.error('Взяли не всі', `Влізло ${free} з ${imgs.length} — ліміт ${MAX_IMAGES}.`);
    }

    setBusy((n) => n + batch.length);
    await Promise.all(batch.map(async (file) => {
      try {
        const url = await uploadImage(userId, idRef.current, file);
        addImage(url);
      } catch (err) {
        notify.error('Не вдалось завантажити', err.message);
      } finally {
        setBusy((n) => Math.max(0, n - 1));
      }
    }));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [userId, form.images]);

  const applyLink = (url) => {
    const clean = String(url || '').trim();
    if (!isHttpUrl(clean)) return false;
    if (room() <= 0) {
      notify.error('Більше не влізе', `У нотатці максимум ${MAX_IMAGES} зображень.`);
      return false;
    }
    /* Чуже посилання лишаємо як є: воно вже десь лежить, важить нуль
       і вантажиться швидше за будь-яку нашу копію. */
    addImage(clean);
    return true;
  };

  /* Ctrl+V ловить обидва випадки: скопійований скрін і скопійоване
     посилання на графік. Другий шлях дешевший, тому перевіряється
     першим. */
  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text');
    if (isHttpUrl(text)) { e.preventDefault(); applyLink(text); return; }

    const items = e.clipboardData?.items;
    if (!items) return;
    const files = Array.from(items)
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    takeFiles(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text');
    if (isHttpUrl(url)) { applyLink(url); return; }
    takeFiles(e.dataTransfer.files);
  };

  /* ---------- голос ----------

     Текст лягає туди, де стоїть курсор, а не в кінець: людина
     диктує посеред думки так само часто, як на початку. Голосове
     їде у сховище одразу — інакше воно жило б у пам'яті вкладки й
     зникло б разом із нею. */
  const insertAtCursor = (text) => {
    if (!text) return;
    const el = bodyRef.current;
    const body = form.description || '';
    const at = el?.selectionStart ?? body.length;
    const before = body.slice(0, at);
    const after = body.slice(at);
    const glue = before && !/\s$/.test(before) ? ' ' : '';
    const next = before + glue + text + after;
    patch({ description: next });
    const caret = (before + glue + text).length;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };

  const attachVoice = async (clip) => {
    setVoiceBusy(true);
    try {
      const url = await uploadAudio(userId, idRef.current, clip.blob);
      const card = cardOf(form);
      patch({ card: cardToSave({ ...card, voice: [...card.voice, { url, sec: clip.sec }] }) });
      setVoiceOpen(false);
      notify.success('Голосове додано', 'Воно буде в нотатці разом зі скрінами.');
    } catch (e) {
      /* Найчастіша причина — відро приймає лише картинки. Текст
         помилки з бази («mime type audio/webm is not supported»)
         людині нічого не каже, тому підказуємо, що робити. */
      const mime = /mime type/i.test(e.message || '');
      notify.error(
        'Не вдалось зберегти голосове',
        mime
          ? 'Сховище приймає тільки картинки. Дозволь аудіо для відра note-images у Supabase → Storage.'
          : e.message,
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  /* Список бектестів тягнемо один раз і лише на вимогу. */
  const loadTrades = async () => {
    if (trades !== null) return;
    try {
      const { data, error } = await supabase
        .from('backtest_sessions')
        .select('id, name, pair')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setTrades((data || []).map((r) => ({ id: r.id, name: r.name || 'Без назви', pair: r.pair || '' })));
    } catch {
      /* Мовчки: звʼязок з бектестом — приємна дрібниця, а не те, через
         що варто ламати написання нотатки помилкою на весь екран. */
      setTrades([]);
    }
  };

  /* ---------- розмітка ----------

     Обгортка ставиться навколо виділеного, префікс — на початок
     кожного зачепленого рядка. Курсор після цього лишається там, де
     людина його бачила, інакше кожне натискання збивало б думку. */
  const applyTool = (tool) => {
    const el = bodyRef.current;
    if (!el) return;
    const text = form.description || '';
    const from = el.selectionStart ?? text.length;
    const to = el.selectionEnd ?? from;
    const picked = text.slice(from, to);

    let next;
    let caret;

    if (tool.wrap) {
      next = `${text.slice(0, from)}${tool.wrap}${picked}${tool.wrap}${text.slice(to)}`;
      caret = picked ? to + tool.wrap.length * 2 : from + tool.wrap.length;
    } else {
      const lineStart = text.lastIndexOf('\n', from - 1) + 1;
      const head = text.slice(0, lineStart);
      const rest = text.slice(lineStart);
      const cut = rest.indexOf('\n', to - lineStart);
      const zone = cut === -1 ? rest : rest.slice(0, cut);
      const tail = cut === -1 ? '' : rest.slice(cut);

      /* Нумерація рахується по ходу: виділив три рядки — отримав
         1. 2. 3., а не три однакові одиниці. */
      const marked = zone.split('\n').map((l, i) => {
        if (tool.numbered) return /^\d{1,3}[.)]\s/.test(l) ? l : `${i + 1}. ${l}`;
        return l.startsWith(tool.prefix) ? l : tool.prefix + l;
      }).join('\n');

      next = head + marked + tail;
      caret = from + tool.prefix.length;
    }

    patch({ description: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  /* Enter усередині списку.

     Список, який доводиться продовжувати вручну, перестає бути
     списком уже на третьому пункті: людина забиває і пише суцільним
     текстом. Тому Enter після пункту сам ставить наступний маркер, а
     Enter на порожньому пункті — навпаки, прибирає його й виходить
     зі списку. Це та сама поведінка, що в будь-якому нотатнику, і
     саме тому її не помічають. */
  const onBodyKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;

    const el = bodyRef.current;
    if (!el) return;
    const text = form.description || '';
    const from = el.selectionStart ?? 0;
    const to = el.selectionEnd ?? from;
    if (from !== to) return;

    const lineStart = text.lastIndexOf('\n', from - 1) + 1;
    const line = text.slice(lineStart, from);

    /* Нумерований список рахує сам: наступний пункт це попередній
       номер плюс один, інакше людина після кожного рядка друкує
       цифру вручну й збивається на десятому. */
    const num = /^(\d{1,3})([.)])\s(.*)$/.exec(line);
    const marker = num ? `${num[1]}${num[2]} ` : markerOf(line);
    if (!marker) return;

    e.preventDefault();

    /* Порожній пункт — сигнал «список закінчився» */
    if (num ? !num[3].trim() : line.trim() === marker.trim()) {
      const next = text.slice(0, lineStart) + text.slice(from);
      patch({ description: next });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(lineStart, lineStart); });
      return;
    }

    /* Наступний пункт завжди порожній: галочку успадковувати не
       можна, інакше новий рядок одразу виглядав би зробленим. */
    const carry = num
      ? `${Number(num[1]) + 1}${num[2]} `
      : marker === DONE ? BOX : marker === '- [x] ' ? '- [ ] ' : marker;
    const next = `${text.slice(0, from)}\n${carry}${text.slice(to)}`;
    const caret = from + 1 + carry.length;
    patch({ description: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); });
  };

  const applyTemplate = (name) => {
    setTpl(name);
    const skeleton = TEMPLATES[name];
    if (!skeleton) return;
    const body = (form.description || '').trim();
    patch({ description: body ? `${body}\n\n${skeleton}` : skeleton });
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  /* ------------------------------------------------------------------
     Збереження.

     Старі нотатки містять base64 у полі images — вони писались до
     того, як зʼявилось сховище. Переносимо їх мовчки й тільки при
     збереженні: окрема кнопка «мігрувати» вимагала б від людини
     розуміти, що взагалі відбувається з її картинками.
  ------------------------------------------------------------------ */
  const [saving, setSaving] = useState(false);

  const canSave = (form.title.trim() || form.description.trim()) && !busy && !saving;

  const submit = async () => {
    if (saving || busy || !canSave) return;
    const legacy = (form.images || []).filter(isDataUrl);

    if (!legacy.length) {
      onSave({ ...form, id: form.id || idRef.current });
      return;
    }

    setSaving(true);
    try {
      const moved = await Promise.all((form.images || []).map(async (src) => {
        if (!isDataUrl(src)) return src;
        try { return await uploadDataUrl(userId, idRef.current, src); } catch { return src; }
      }));
      onSave({ ...form, id: form.id || idRef.current, images: moved });
    } finally {
      setSaving(false);
    }
  };

  /* ⌘↵ зберігає з будь-якого поля: рука вже на клавіатурі, тягтись
     мишею до кнопки в підвалі — зайвий рух. */
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const images = form.images || [];
  const empty = !images.length && !busy;
  const folderOptions = [{ id: null, name: 'Без папки', color: '#6b6980' }, ...folders];

  /* ================================================================ */

  return (
    <>
      {/* Плейсхолдери в темному вікні читаються гірше за все інше:
          браузер малює їх ще блідішими за вказаний колір. Задаємо
          явно, інакше підказка в порожньому полі просто зникає. */}
      <style>{`
        .note-editor input::placeholder,
        .note-editor textarea::placeholder { color: #8f8da0; opacity: 1; }
      `}</style>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onCancel}
      className="fixed bottom-0 top-0 z-[210] overflow-y-auto"
      style={{
        left: contentBox ? contentBox.left : 0,
        width: contentBox ? contentBox.width : '100%',
        background: 'rgba(4,4,7,0.6)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Обгортка на всю висоту: тільки так вікно стоїть рівно по
          центру, але прокручується, коли не влазить. */}
      <div className="flex min-h-full items-center justify-center px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        className="note-editor relative w-full rounded-[24px]"
        style={{
          /* Фокус росте вгору-вниз, а не вшир. Ширше 980 вікно
             заповзало б під бічну панель застосунку, яка лежить
             вище за модалку, і кутик картки просто зникав. Місця під
             текст це все одно не додавало: рядок довший за 90
             символів читається гірше, ніж коротший. */
          maxWidth: 980,
          background: 'linear-gradient(170deg,#111117,#0b0b10)',
          border: '1px solid #23232e',
          boxShadow: `0 50px 110px -40px #000, 0 0 0 1px ${A(0.08)}`,
          }}
      >
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            borderRadius: '24px 24px 0 0',
            background: `linear-gradient(90deg,transparent,${A(0.8)} 30%,#8b7cffcc 70%,transparent)`,
          }}
        />

        {/* ─── шапка ─── */}
        <div
          className="flex items-center justify-between gap-5 py-4 pl-6 pr-5"
          style={{ borderBottom: '1px solid #1c1c25' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px]"
              style={{ background: A(0.12), border: `1px solid ${A(0.3)}`, boxShadow: `inset 0 1px 0 ${A(0.33)}`, color: '#a99cff' }}
            >
              <Pencil size={16} strokeWidth={1.8} />
            </span>

            <div className="min-w-0">
              <div className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '2.2px', color: '#a99cff' }}>
                {form.id ? 'Редагування' : 'Нова нотатка'}
              </div>
              <div className="mt-1 flex items-center gap-[7px] text-[12.5px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>
                <span
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ background: busy ? '#f5a33b' : '#6fe0b4', boxShadow: `0 0 8px 1px ${busy ? '#f5a33b99' : '#2fbf8f99'}` }}
                />
                <span>
                  {busy > 0
                    ? `завантажую ${busy}`
                    : images.length
                      ? `${images.length} з ${MAX_IMAGES} зображень`
                      : 'нічого ще не збережено'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFocusMode((v) => !v)}
              title="Розгорнути на весь екран"
              className="flex h-[34px] items-center gap-[7px] rounded-[10px] px-3"
              style={{
                background: focusMode ? A(0.14) : '#ffffff08',
                border: `1px solid ${focusMode ? A(0.4) : '#23232e'}`,
                transition: 'all .16s',
              }}
            >
              <Maximize2 size={14} strokeWidth={1.8} style={{ color: focusMode ? '#c4baff' : '#a3a1b2' }} />
              <span className="text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: focusMode ? '#ffffff' : '#a5a3b3' }}>
                Фокус
              </span>
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
              style={{ background: '#ffffff08', border: '1px solid #23232e', color: '#c9c7d6', transition: 'all .16s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff16'; e.currentTarget.style.borderColor = '#3d3d4c'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.borderColor = '#23232e'; }}
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: focusMode ? '1fr 288px' : '1fr 288px' }}>

          {/* ─────────── письмо ─────────── */}
          <div className="min-w-0 px-6 pb-5 pt-[22px]" style={{ borderRight: '1px solid #1c1c25' }}>
            {!form.id && (
              <div className="flex flex-wrap items-center gap-[7px]">
                <span className="mr-1 text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.6px', color: '#9a98ab' }}>
                  Шаблон
                </span>
                {Object.keys(TEMPLATES).map((name) => {
                  const on = tpl === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyTemplate(name)}
                      className="rounded-full px-[11px] py-[5px] text-[12.5px] font-semibold"
                      style={{
                        fontFamily: T.sans,
                        background: on ? A(0.17) : '#ffffff08',
                        border: `1px solid ${on ? A(0.5) : '#21212b'}`,
                        color: on ? '#ffffff' : '#8f8d9c',
                        boxShadow: on ? `0 0 18px -6px ${A(0.6)}` : 'none',
                        transition: 'all .16s',
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}

            <input
              autoFocus
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Про що ця нотатка?"
              className="mt-[18px] w-full border-none bg-transparent outline-none"
              style={{ fontFamily: T.display, fontSize: 30, fontWeight: 700, letterSpacing: '-1px', color: '#ffffff' }}
            />

            <div className="mt-3.5 flex items-center gap-1.5 pb-3" style={{ borderBottom: '1px solid #1c1c25' }}>
              {TOOLS.map((tool) => (
                <ToolButton key={tool.label} tool={tool} onClick={() => applyTool(tool)} />
              ))}

              <span className="mx-1 h-5 w-px" style={{ background: '#22222c' }} />

              {/* Диктовка стоїть у тому ж ряду, що й розмітка: це
                  такий самий спосіб набрати текст, просто голосом. */}
              <div className="relative">
                <button
                  type="button"
                  title="Продиктувати"
                  onClick={() => { setVoiceOpen((v) => !v); setLookOpen(false); setTradeOpen(false); }}
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold"
                  style={{
                    background: voiceOpen ? A(0.17) : '#ffffff08',
                    border: `1px solid ${voiceOpen ? A(0.5) : '#21212b'}`,
                    color: voiceOpen ? '#ffffff' : '#a9a7b8',
                    fontFamily: T.sans,
                    transition: 'all .16s',
                  }}
                >
                  <Mic size={13} strokeWidth={1.9} />
                  Голос
                </button>

                {voiceOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2">
                    <VoiceCapture
                      busy={voiceBusy}
                      onClose={() => setVoiceOpen(false)}
                      onInsert={(text) => { insertAtCursor(text); setVoiceOpen(false); }}
                      onAttach={attachVoice}
                    />
                  </div>
                )}
              </div>

              {/* Розмітку треба бачити, а не уявляти. Поки її не було
                  видно ніде, `**жирне**` лишалось зірочками аж до
                  збереження — і виглядало як помилка, а не як розмітка. */}
              <button
                type="button"
                title={preview ? 'Повернутись до письма' : 'Показати, як нотатка виглядатиме після збереження'}
                onClick={() => setPreview((v) => !v)}
                className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold"
                style={{
                  background: preview ? A(0.17) : '#ffffff08',
                  border: `1px solid ${preview ? A(0.5) : '#21212b'}`,
                  color: preview ? '#ffffff' : '#a9a7b8',
                  fontFamily: T.sans,
                  transition: 'all .16s',
                }}
              >
                <Eye size={13} strokeWidth={1.9} />
                {preview ? 'Писати далі' : 'Як виглядатиме'}
              </button>

              <span className="flex-1" />
              <span className="text-[11px]" style={{ fontFamily: T.mono, color: '#6f6d7d' }}>Markdown</span>
            </div>

            <div
              className="mt-3.5 rounded-[14px] px-4 py-3.5"
              style={{
                height: focusMode ? 'min(64vh, 620px)' : 'min(38vh, 320px)',
                background: bodyFocus ? '#ffffff0a' : '#ffffff05',
                border: `1px solid ${bodyFocus ? A(0.45) : '#1e1e27'}`,
                boxShadow: bodyFocus ? `0 0 0 4px ${A(0.11)}` : 'none',
                transition: 'all .2s, height .3s cubic-bezier(.22,1.2,.36,1)',
              }}
            >
              {preview ? (
                <div
                  className="h-full w-full overflow-auto"
                  style={TYPO}
                >
                  {form.description.trim()
                    ? renderMd(form.description, { accent: T.acc, text: '#eceaf4', muted: '#8b8998', line: '#26262f' })
                    : <span style={{ color: '#8f8da0' }}>Порожньо — тут з&apos;явиться те, що напишеш.</span>}
                </div>
              ) : (
                /* Два шари, які мусять збігатись символ у символ:
                   знизу — розмальований текст, зверху — прозора
                   textarea з видимим курсором. Тому в них однакова
                   типографіка, однакові відступи й однакове
                   перенесення рядків, а жирне малюється тінню, а не
                   товщиною: зміна ваги зробила б літери ширшими, і
                   курсор поїхав би від того, що бачить око. */
                <div className="relative h-full w-full">
                  <div
                    ref={mirrorRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    style={{ ...TYPO, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
                  >
                    {highlightMd(form.description, { accent: T.acc, text: '#eceaf4', muted: '#8b8998' })}
                  </div>

                  <textarea
                    ref={bodyRef}
                    value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    onKeyDown={onBodyKeyDown}
                    onFocus={() => setBodyFocus(true)}
                    onBlur={() => setBodyFocus(false)}
                    onScroll={(e) => { if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop; }}
                    placeholder="Пиши як думаєш. Ctrl+V вставить скрін або лінк прямо сюди."
                    spellCheck={false}
                    className="relative h-full w-full resize-none border-none bg-transparent p-0 outline-none"
                    style={{ ...TYPO, color: 'transparent', caretColor: '#ffffff' }}
                  />
                </div>
              )}
            </div>

            {/* ─── графіки ───
                Порожня зона — один рядок, а не панель на пів екрана:
                поки скрінів немає, це підказка, а не вміст. */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
              onDrop={onDrop}
              className="mt-3.5"
            >
              {empty ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onMouseEnter={() => setDropHover(true)}
                  onMouseLeave={() => setDropHover(false)}
                  className="flex w-full items-center gap-[13px] rounded-[14px] px-3.5 py-[13px] text-left"
                  style={{
                    border: `1.5px dashed ${drag || dropHover ? A(0.55) : '#24242f'}`,
                    background: drag || dropHover ? A(0.07) : '#ffffff03',
                    transition: 'all .2s',
                  }}
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{
                      background: drag || dropHover ? A(0.17) : '#ffffff0a',
                      border: `1px solid ${drag || dropHover ? A(0.44) : '#26262f'}`,
                      color: drag || dropHover ? '#b3a8ff' : '#a3a1b2',
                      transition: 'all .2s',
                    }}
                  >
                    <ImagePlus size={18} strokeWidth={1.7} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: '#d9d7e4' }}>
                      {drag ? 'Відпусти — заберемо' : 'Скрін, файл або лінк'}
                    </span>
                    <span className="mt-[3px] block text-[12.5px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>
                      Ctrl+V · перетягни · клікни щоб вибрати
                    </span>
                  </span>

                  <span
                    className="shrink-0 rounded-[7px] px-2 py-1 text-[11px]"
                    style={{ background: '#ffffff0d', border: '1px solid #26262f', fontFamily: T.mono, color: '#8b8998' }}
                  >
                    ⌘V
                  </span>
                </button>
              ) : (
                <div
                  className="flex flex-wrap gap-2.5 rounded-[14px] p-2.5"
                  style={{ background: drag ? A(0.05) : '#ffffff05', border: `1px solid ${drag ? A(0.55) : '#1e1e27'}`, transition: 'all .2s' }}
                >
                  <AnimatePresence initial={false}>
                    {images.map((src, i) => (
                      <motion.div
                        key={src}
                        layout
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.26, ease: EASE }}
                        className="group/img relative h-[92px] w-[136px] overflow-hidden rounded-xl"
                        style={{ border: '1px solid #23232e', background: '#0f0f14' }}
                      >
                        <img
                          src={src}
                          alt=""
                          onClick={() => onImage(src)}
                          className="h-full w-full cursor-zoom-in object-cover transition-transform duration-500 group-hover/img:scale-[1.06]"
                        />
                        <div
                          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/img:opacity-100"
                          style={{ background: 'linear-gradient(180deg, rgba(6,6,8,0.55), transparent 55%)' }}
                        />
                        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity duration-200 group-hover/img:opacity-100">
                          <button
                            type="button"
                            onClick={() => onImage(src)}
                            title="На весь екран"
                            className="grid h-7 w-7 place-items-center rounded-lg"
                            style={{ background: 'rgba(10,10,12,0.86)', border: '1px solid #23232e', color: '#c9c7d6', backdropFilter: 'blur(8px)' }}
                          >
                            <Maximize2 size={12} strokeWidth={2.4} />
                          </button>
                          <button
                            type="button"
                            onClick={() => patch({ images: images.filter((_, j) => j !== i) })}
                            title="Прибрати"
                            className="grid h-7 w-7 place-items-center rounded-lg"
                            style={{ background: 'rgba(10,10,12,0.86)', border: '1px solid #23232e', color: '#c9c7d6', backdropFilter: 'blur(8px)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ff9d9d'; e.currentTarget.style.borderColor = '#ff8f8f66'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#b3b1c0'; e.currentTarget.style.borderColor = '#23232e'; }}
                          >
                            <X size={12} strokeWidth={2.8} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* місця, що вже їдуть */}
                  {Array.from({ length: busy }).map((_, i) => (
                    <div
                      key={`busy-${i}`}
                      className="grid h-[92px] w-[136px] place-items-center rounded-xl"
                      style={{ border: '1px dashed #2c2c38', background: '#0f0f14' }}
                    >
                      <Loader2 size={17} strokeWidth={2.4} className="animate-spin" style={{ color: T.acc }} />
                    </div>
                  ))}

                  {images.length + busy < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="grid h-[92px] w-[136px] place-items-center rounded-xl"
                      style={{ border: `1px dashed ${drag ? A(0.55) : '#2c2c38'}`, color: drag ? '#b3a8ff' : '#66646f', transition: 'all .18s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.55); e.currentTarget.style.color = '#b3a8ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = drag ? A(0.55) : '#2c2c38'; e.currentTarget.style.color = drag ? '#b3a8ff' : '#66646f'; }}
                    >
                      <ImagePlus size={19} strokeWidth={1.9} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => { takeFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {/* ─────────── службове ─────────── */}
          <div className="flex flex-col gap-5 px-5 pb-5 pt-[22px]">

            <div>
              <SideLabel>Папка</SideLabel>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {folderOptions.map((f) => {
                  const on = (form.folder_id || null) === f.id;
                  return (
                    <PickRow key={f.id || 'none'} color={f.color} active={on} onClick={() => patch({ folder_id: f.id })}>
                      <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: f.color, boxShadow: on ? `0 0 9px 1px ${f.color}cc` : 'none' }}
                      />
                      <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
                      {on && <Check size={13} strokeWidth={2.2} style={{ flex: 'none' }} />}
                    </PickRow>
                  );
                })}
              </div>
            </div>

            <div>
              <SideLabel right={<span className="text-[11.5px]" style={{ fontFamily: T.sans, color: '#6f6d7d' }}>клік — прибрати</span>}>
                Теги
              </SideLabel>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {(form.tags || []).map((t) => (
                  <TagChip key={t} id={t} tree={tree} showPath onRemove={(id) => patch({ tags: form.tags.filter((x) => x !== id) })} />
                ))}
                <TagPicker
                  multi
                  tree={tree}
                  onTreeChange={onTreeChange}
                  value={form.tags || []}
                  onChange={(tags) => patch({ tags })}
                  label="тег"
                  width={300}
                  align="right"
                />
              </div>
            </div>

            <div>
              <SideLabel>Деталі</SideLabel>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {/* Той самий календар, що на решті сайту. Нативний
                    <input type="date"> малює вікно засобами системи —
                    світле, чужим шрифтом, поверх нашого темного. */}
                <DateField
                  value={form.session_date}
                  onChange={(v) => patch({ session_date: v })}
                  align="right"
                  height={40}
                  fontSize={13.5}
                  fontWeight={600}
                  alwaysNumeric
                />

                {linkOpen ? (
                  <div
                    className="flex h-10 items-center gap-2.5 rounded-[11px] px-3"
                    style={{ background: '#ffffff08', border: `1px solid ${form.chart_link ? A(0.35) : '#21212b'}` }}
                  >
                    <Link2 size={14} strokeWidth={1.7} style={{ color: '#a3a1b2', flex: 'none' }} />
                    <input
                      value={form.chart_link}
                      onChange={(e) => patch({ chart_link: e.target.value })}
                      placeholder="Посилання на джерело"
                      className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] font-semibold outline-none"
                      style={{ fontFamily: T.sans, color: '#e4e2ec' }}
                    />
                    {!form.chart_link && (
                      <button type="button" onClick={() => setLinkOpen(false)} style={{ color: '#8b8998', flex: 'none' }}>
                        <X size={13} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ) : (
                  <PickRow onClick={() => setLinkOpen(true)}>
                    <Link2 size={14} strokeWidth={1.7} style={{ flex: 'none' }} />
                    <span className="flex-1 text-left">Посилання на джерело</span>
                    <Plus size={13} strokeWidth={2.2} style={{ flex: 'none' }} />
                  </PickRow>
                )}

                {/* ─── звʼязок з бектестом ───

                    Оце й є та річ, якої не вміє жоден загальний
                    нотатник: думка про сетап лежить окремо від
                    бектесту, у якому її перевіряли, і через місяць їх
                    уже не зіставити. Тут нотатка носить посилання на
                    свій бектест, а картка в списку — кнопку «відкрити».

                    Список тягнемо не одразу, а на перший клік: людині,
                    яка просто пише, зайвий запит до бази не потрібен. */}
                <div className="relative" ref={tradeRef}>
                  {card.trade ? (
                    <div
                      className="flex h-10 items-center gap-2.5 rounded-[11px] px-3"
                      style={{ background: A(0.1), border: `1px solid ${A(0.35)}` }}
                    >
                      <Link size={14} strokeWidth={1.7} style={{ color: '#b3a8ff', flex: 'none' }} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: '#ffffff' }}>
                        {card.trade.name}
                      </span>
                      <button
                        type="button"
                        title="Відвʼязати"
                        onClick={() => setCard({ trade: null })}
                        style={{ color: '#a3a1b2', flex: 'none' }}
                      >
                        <X size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : (
                    <PickRow onClick={() => { setTradeOpen((v) => !v); setLookOpen(false); loadTrades(); }}>
                      <Link size={14} strokeWidth={1.7} style={{ flex: 'none' }} />
                      <span className="flex-1 text-left">Прив&apos;язати до угоди</span>
                      <ChevronDown
                        size={13}
                        strokeWidth={1.9}
                        style={{ flex: 'none', transform: `rotate(${tradeOpen ? 180 : 0}deg)`, transition: 'transform .2s' }}
                      />
                    </PickRow>
                  )}

                  {tradeOpen && !card.trade && (
                    <div
                      className="absolute left-0 right-0 z-40 overflow-auto rounded-[14px] p-1.5"
                      style={{
                        top: tradeDrop.up ? undefined : '100%',
                        bottom: tradeDrop.up ? '100%' : undefined,
                        marginTop: tradeDrop.up ? 0 : 8,
                        marginBottom: tradeDrop.up ? 8 : 0,
                        maxHeight: Math.min(tradeDrop.max, 240),
                        background: '#14141b',
                        border: '1px solid #2c2c38',
                        boxShadow: `0 24px 50px -18px #000, 0 0 0 1px ${A(0.1)}`,
                      }}
                    >
                      {trades === null && (
                        <div className="flex items-center gap-2 px-2.5 py-3 text-[13px]" style={{ fontFamily: T.sans, color: '#a3a1b2' }}>
                          <Loader2 size={13} className="animate-spin" /> шукаю бектести…
                        </div>
                      )}
                      {trades?.length === 0 && (
                        <div className="px-2.5 py-3 text-[13px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>
                          Бектестів ще немає
                        </div>
                      )}
                      {(trades || []).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => { setCard({ trade: { id: t.id, name: t.name } }); setTradeOpen(false); }}
                          className="flex h-[34px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13px] font-semibold"
                          style={{ fontFamily: T.sans, color: '#b3b1c0', background: 'transparent', transition: 'all .14s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff0d'; e.currentTarget.style.color = '#ffffff'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9d9bad'; }}
                        >
                          <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: A(0.9) }} />
                          <span className="min-w-0 flex-1 truncate">{t.name}</span>
                          {t.pair && <span className="shrink-0 text-[11px]" style={{ fontFamily: T.mono, color: '#5f5d6b' }}>{t.pair}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── вигляд картки ───

                Випадашка, а не розкладений блок. Розкладеним він
                займав третину бічної колонки й показував десяток
                ручок людині, якій у дев'яти випадках з десяти
                потрібно просто написати текст. Тепер у колонці стоїть
                один рядок з тим, що вже вибрано, а весь набір виїжджає
                на клік. */}
            <div className="relative" ref={lookRef}>
              <SideLabel>Вигляд</SideLabel>

              <button
                type="button"
                onClick={() => { setLookOpen((v) => !v); setTradeOpen(false); }}
                className="mt-2.5 flex h-10 w-full items-center gap-2.5 rounded-[11px] px-3"
                style={{
                  background: lookOpen ? '#ffffff12' : '#ffffff08',
                  border: `1px solid ${lookOpen ? `${look}80` : '#21212b'}`,
                  transition: 'all .16s',
                }}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[13px]"
                  style={{ background: `${look}24`, border: `1px solid ${look}73` }}
                >
                  {card.icon || ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: '#ffffff' }}>
                  {lookLabel}
                </span>
                <ChevronDown
                  size={13}
                  strokeWidth={1.9}
                  style={{ color: '#a3a1b2', flex: 'none', transform: `rotate(${lookOpen ? 180 : 0}deg)`, transition: 'transform .2s' }}
                />
              </button>

              {lookOpen && (
                <div
                  className="absolute right-0 z-40 w-[296px] overflow-auto rounded-2xl p-3.5"
                  style={{
                    top: lookDrop.up ? undefined : '100%',
                    bottom: lookDrop.up ? '100%' : undefined,
                    marginTop: lookDrop.up ? 0 : 8,
                    marginBottom: lookDrop.up ? 8 : 0,
                    maxHeight: lookDrop.max,
                    background: '#14141b',
                    border: '1px solid #2c2c38',
                    boxShadow: `0 28px 60px -20px #000, 0 0 0 1px ${A(0.1)}`,
                  }}
                >
                  <PanelLabel>Колір</PanelLabel>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCard({ color: null })}
                      title="Колір першого тега"
                      className="grid h-7 w-7 place-items-center rounded-[9px] text-[10px] font-bold"
                      style={{
                        background: '#ffffff08',
                        border: `2px solid ${card.color ? 'transparent' : '#ffffff'}`,
                        color: '#a9a7b8',
                        fontFamily: T.mono,
                        transform: `scale(${card.color ? 0.88 : 1})`,
                        transition: 'all .18s',
                      }}
                    >
                      A
                    </button>

                    {CARD_COLORS.map((col) => {
                      const on = card.color === col;
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setCard({ color: col })}
                          className="h-7 w-7 rounded-[9px]"
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

                    {/* Свій колір: палітра — це підказка, а не паркан. */}
                    <label
                      className="relative grid h-7 w-7 cursor-pointer place-items-center rounded-[9px]"
                      title="Свій колір"
                      style={{
                        background: custom ? `${look}2b` : '#ffffff08',
                        border: custom ? `1px solid ${look}cc` : '1px dashed #2d2d3a',
                        color: custom ? look : '#6f6d7d',
                        boxShadow: custom ? `0 0 0 3px ${look}33` : 'none',
                        transition: 'all .18s',
                      }}
                    >
                      <Plus size={12} strokeWidth={2.6} />
                      <input
                        type="color"
                        value={look}
                        onChange={(e) => setCard({ color: e.target.value })}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                  </div>

                  <div className="mt-3.5"><PanelLabel>Фон нотатки</PanelLabel></div>
                  <div className="mt-2.5 grid grid-cols-4 gap-[7px]">
                    {CARD_BGS.map((b) => {
                      const on = card.bg === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          title={b.name}
                          onClick={() => setCard({ bg: b.id })}
                          className="h-[38px] rounded-[11px] p-[3px]"
                          style={{
                            background: on ? `${look}1f` : '#ffffff06',
                            border: `1px solid ${on ? `${look}80` : '#22222c'}`,
                            boxShadow: on ? `0 0 18px -8px ${look}cc` : 'none',
                            transition: 'all .16s',
                          }}
                        >
                          <span
                            className="block h-full w-full rounded-lg"
                            style={{
                              ...cardBackground(b.id, look, false),
                              /* Мініатюра вдвічі менша за картку, тож
                                 і візерунок має бути вдвічі дрібніший —
                                 інакше в квадратику 34×34 видно одну
                                 крапку й ніякої різниці між варіантами. */
                              backgroundSize: cardBackground(b.id, look, false).backgroundSize?.replace(/(\d+)px (\d+)px/g, (_, a2, b2) => `${Math.round(a2 / 2)}px ${Math.round(b2 / 2)}px`),
                              border: b.id === 'none' ? '1px solid #23232c' : 'none',
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[11.5px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
                    {CARD_BGS.find((b) => b.id === card.bg)?.name} — застосується до картки в списку
                  </div>

                  <div className="mt-3.5"><PanelLabel>Іконка</PanelLabel></div>
                  <div className="mt-2.5 grid grid-cols-5 gap-[7px]">
                    <button
                      type="button"
                      onClick={() => setCard({ icon: '' })}
                      className="grid h-[34px] place-items-center rounded-[10px] text-[10px] font-bold uppercase"
                      style={{
                        background: card.icon ? '#ffffff08' : `${look}24`,
                        border: `1px solid ${card.icon ? '#22222c' : `${look}73`}`,
                        color: card.icon ? '#6f6d7d' : '#ffffff',
                        fontFamily: T.mono,
                        transition: 'all .16s',
                      }}
                    >
                      без
                    </button>
                    {CARD_ICONS.map((ic) => {
                      const on = card.icon === ic;
                      return (
                        <button
                          key={ic}
                          type="button"
                          onClick={() => setCard({ icon: on ? '' : ic })}
                          className="grid h-[34px] place-items-center rounded-[10px] text-[15px]"
                          style={{
                            background: on ? `${look}24` : '#ffffff08',
                            border: `1px solid ${on ? `${look}73` : '#22222c'}`,
                            transition: 'all .16s',
                          }}
                        >
                          {ic}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCard({ cover: card.cover === 'none' ? 'auto' : 'none' })}
                    disabled={!images.length}
                    className="mt-3.5 flex min-h-[38px] w-full items-center gap-2.5 rounded-[11px] px-3 py-2"
                    style={{
                      background: images.length && card.cover !== 'none' ? `${look}14` : '#ffffff08',
                      border: `1px solid ${images.length && card.cover !== 'none' ? `${look}3d` : '#21212b'}`,
                      color: !images.length ? '#4f4d59' : card.cover !== 'none' ? look : '#a3a1b2',
                      cursor: images.length ? 'pointer' : 'not-allowed',
                      transition: 'all .16s',
                    }}
                  >
                    <ImagePlus size={14} strokeWidth={1.7} style={{ flex: 'none' }} />
                    <span className="flex-1 text-left text-[13px] font-semibold" style={{ fontFamily: T.sans }}>
                      Обкладинка з першого скріна
                    </span>
                    <span
                      className="shrink-0 rounded-md px-[7px] py-[3px] text-[10.5px] font-bold uppercase"
                      style={{
                        fontFamily: T.mono,
                        letterSpacing: '0.8px',
                        background: images.length && card.cover !== 'none' ? `${look}24` : '#ffffff0a',
                        border: `1px solid ${images.length && card.cover !== 'none' ? `${look}4d` : '#26262f'}`,
                        color: images.length && card.cover !== 'none' ? look : '#66646f',
                      }}
                    >
                      {!images.length ? 'нема' : card.cover !== 'none' ? 'увімк' : 'вимк'}
                    </span>
                  </button>

                  <div className="mt-3.5 border-t pt-3.5" style={{ borderColor: '#22222c' }}>
                    <div className="flex items-baseline justify-between">
                      <PanelLabel>Прев&apos;ю</PanelLabel>
                      <span className="text-[11px]" style={{ fontFamily: T.sans, color: '#6f6d7d' }}>як у списку папки</span>
                    </div>

                    {/* Прев'ю не декоративне: воно єдине показує, що з
                        цих чотирьох ручок вийшло разом. */}
                    <div
                      className="relative mt-2.5 overflow-hidden rounded-[14px] px-3.5 py-3"
                      style={{
                        ...cardBackground(card.bg, look, false),
                        border: `1px solid ${look}3d`,
                      }}
                    >
                      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${look}, ${look}33)` }} />
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="grid h-[26px] w-[26px] place-items-center rounded-[9px] text-[14px]"
                          style={{ background: `${look}20`, border: `1px solid ${look}5e` }}
                        >
                          {card.icon || ''}
                        </span>
                        <span className="text-[10.5px]" style={{ fontFamily: T.mono, color: '#63616d' }}>02 вер.</span>
                      </div>
                      <div
                        className="mt-2.5 truncate"
                        style={{ fontFamily: T.display, fontSize: 15, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.3px' }}
                      >
                        {form.title.trim() || 'Без назви'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── дії ─── */}
        <div
          className="flex items-center justify-between gap-5 py-3.5 pl-6 pr-5"
          style={{ borderTop: '1px solid #1c1c25', background: '#0a0a0e', borderRadius: '0 0 24px 24px' }}
        >
          <div className="hidden items-center gap-3.5 sm:flex">
            {[{ k: '⌘↵', t: form.id ? 'зберегти' : 'створити' }, { k: 'esc', t: 'закрити' }].map(({ k, t }) => (
              <span key={k} className="flex items-center gap-[7px] text-[12.5px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
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
              onClick={onCancel}
              className="flex h-[42px] items-center rounded-xl px-[18px] text-[14px] font-semibold"
              style={{ background: '#ffffff08', border: '1px solid #23232e', color: '#c9c7d6', fontFamily: T.sans, transition: 'all .16s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff14'; e.currentTarget.style.color = '#ffffff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.color = '#b3b1c0'; }}
            >
              Скасувати
            </button>

            <SaveBtn onClick={submit} disabled={!canSave} saving={saving} label={form.id ? 'Зберегти' : 'Створити'} />
          </div>
        </div>
      </motion.div>
      </div>
    </motion.div>
    </>
  );
}

/* Єдина яскрава кнопка вікна: градієнт, світлий волосок зверху,
   підйом на два пікселі. Поки писати нічого — приглушена, бо
   натискати її немає сенсу. */
function SaveBtn({ onClick, disabled, saving, label }) {
  const [hov, setHov] = useState(false);
  const on = hov && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
      {saving
        ? <Loader2 size={15} strokeWidth={2.6} className="animate-spin" style={{ color: '#fff' }} />
        : <Check size={15} strokeWidth={2.3} style={{ color: '#fff' }} />}
      <span className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: '#ffffff' }}>{label}</span>
    </button>
  );
}
