import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer, Trash2, X, ChevronLeft, RotateCcw, Search,
  Plus, ArrowRight, Check, Image as ImageIcon,
} from 'lucide-react';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  loadDoc, saveDoc, resetDoc, descendants, newPage, buildPreset, PRESETS, HUES,
} from '../lib/systemDoc';
import BlockEditor from '../components/system/BlockEditor';
import SearchModal from '../components/system/SearchModal';

/* ==================================================================
   Торгова система.

   Не дерево сторінок і не білий аркуш. Сторінка відкривається
   набором розділів, у кожному з яких уже лежить готовий кістяк:
   заголовки, таблиці й чеклісти, які лишається заповнити. Порожній
   старт — головна причина, чому опис системи ніколи не дописують.

   Свій розділ додається поруч із готовими і теж не починається з
   нуля: людина обирає заготовку, а не структуру вигадує сама.
================================================================== */

const EMOJI = [
  '🎯', '📌', '🕐', '✍️', '💵', '🛑', '🥇', '📍',
  '📐', '🛡️', '⚠️', '📊', '🧠', '🔥', '💡', '📈',
  '📉', '🪤', '🧩', '✅', '🚫', '💰', '🧭', '📚',
];

/* Скільки в розділі вже заповнено. Рахуємо тільки те, що людина
   справді пише: розділювачі й порожні заготовки не в рахунок. */
const hasContent = (x) => {
  if (x.type === 'image') return !!x.src;
  if (x.type === 'table') return (x.rows || []).slice(1).some((r) => r.some((c) => String(c).trim()));
  return !!String(x.text || '').trim();
};

function fillOf(page) {
  const list = (page.blocks || []).filter((x) => x.type !== 'divider');
  const done = list.filter(hasContent).length;
  return { done, total: list.length || 1, pct: list.length ? done / list.length : 0 };
}

/* ------------------------------------------------------------------ */
/*  Плитка розділу                                                     */
/* ------------------------------------------------------------------ */

/* Ховер тут інший, ніж на стартовій. Плитка прозора, тому світло
   всередині виглядало б брудно — світиться сама обводка, і рівно в
   тій точці, де курсор. Ніби ведеш пальцем по неоновому контуру.
   Координати пишемо просто в CSS-змінні вузла, повз React. */
function track(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

function SectionCard({ page, index, subCount, onOpen }) {
  const { done, total, pct } = fillOf(page);
  const hue = HUES[page.hue] || HUES.violet;

  return (
    <motion.button
      onClick={() => onOpen(page.id)}
      onPointerMove={track}
      initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.45, delay: Math.min(index, 10) * 0.035, ease: EASE }}
      className="ts-card group relative flex flex-col overflow-hidden rounded-2xl p-5 text-left"
      style={{ '--hue': hue, border: `1px solid ${T.line}` }}
    >
      <span aria-hidden className="ts-hatch" />
      <span aria-hidden className="ts-bloom" />
      <span aria-hidden className="ts-edge" />
      <span aria-hidden className="ts-br ts-br-tl" />
      <span aria-hidden className="ts-br ts-br-tr" />
      <span aria-hidden className="ts-br ts-br-bl" />
      <span aria-hidden className="ts-br ts-br-br" />

      <div className="relative z-10 mb-4 flex items-start justify-between gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[21px]"
          style={{ background: `rgba(${hue},0.08)`, border: `1px solid rgba(${hue},0.22)` }}
        >
          {page.icon}
        </span>
        <ArrowRight
          size={15}
          strokeWidth={2.4}
          className="mt-3 shrink-0 opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100"
          style={{ color: `rgb(${hue})` }}
        />
      </div>

      <h3
        className="relative z-10 text-[16.5px] font-bold"
        style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}
      >
        {page.title}
      </h3>

      {page.hint && (
        <p
          className="relative z-10 mt-1.5 text-[13px]"
          style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.55 }}
        >
          {page.hint}
        </p>
      )}

      {/* Скільки вже заповнено — тонка риска знизу, без цифр у лоб */}
      <div className="relative z-10 mt-auto pt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text4 }}>
            {done === total ? 'заповнено' : `${done} з ${total}`}
            {subCount > 0 && ` · ${subCount} ${subCount === 1 ? 'підрозділ' : 'підрозділи'}`}
          </span>
          {done === total && (
            <Check size={12} strokeWidth={3} style={{ color: `rgb(${hue})` }} />
          )}
        </div>
        <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: T.sunken }}>
          <motion.span
            className="block h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(pct * 100)}%` }}
            transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            style={{ background: `rgb(${hue})`, opacity: 0.75 }}
          />
        </div>
      </div>
    </motion.button>
  );
}

/* Кнопка в панелі дій. Живе поза компонентом сторінки: інакше на
   кожне натискання клавіші в заголовку React вважав би її новим
   типом і перемонтовував увесь ряд. */
function IconBtn({ icon: Icon, label, onClick, tone }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors duration-200 no-print"
      style={{ fontFamily: T.sans, color: T.text4 }}
      onMouseEnter={(e) => { e.currentTarget.style.color = tone || T.text2; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon size={13.5} strokeWidth={2.2} />
      {label}
    </button>
  );
}

/* Кнопка тулбару секції (макет v2): іконка + підпис, підпис ховається
   на вузькому екрані. Небезпечна дія — червоний ховер. */
function TBtn({ label, onClick, danger, children }) {
  const base = danger ? T.bad : T.text3;
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-[7px] rounded-[10px] px-[11px] py-[7px] text-[12.5px] transition-colors duration-150 no-print"
      style={{ fontFamily: T.sans, color: base, background: 'transparent', border: 'none' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = danger ? '#ff8b99' : T.text;
        e.currentTarget.style.background = danger ? `rgba(${T.badRgb},0.12)` : 'rgba(var(--edge-text-rgb),0.06)';
      }}
      onMouseLeave={(e) => { e.currentTarget.style.color = base; e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
      <span data-lbl className="hidden md:inline">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Створення власного розділу                                         */
/* ------------------------------------------------------------------ */
function NewSection({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('🧩');
  const [hue, setHue] = useState('sky');
  const [preset, setPreset] = useState('rules');

  useEffect(() => {
    if (!open) return undefined;
    setTitle(''); setIcon('🧩'); setHue('sky'); setPreset('rules');
    const onKey = (e) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const create = () => {
    onCreate({ title: title.trim() || 'Новий розділ', icon, hue, preset });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[400] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
          style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(12px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="my-auto w-full max-w-[520px] overflow-hidden rounded-3xl"
            style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)' }}
          >
            <div
              className="relative px-6 py-5"
              style={{ borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})` }}
            >
              <div className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.acc }}>
                Свій розділ
              </div>
              <h3 className="mt-1 text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                Що ще має бути в системі?
              </h3>
              <button
                onClick={onClose}
                className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-xl transition-colors duration-200"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>

            <div className="flex flex-col gap-5 px-6 py-5">
              {/* назва + іконка */}
              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Назва
                </label>
                <div className="flex gap-2.5">
                  <span
                    className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-xl text-[22px]"
                    style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                  >
                    {icon}
                  </span>
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && create()}
                    placeholder="Наприклад: Психологія"
                    className="h-[46px] w-full rounded-xl px-3.5 text-[14.5px] outline-none"
                    style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
                  />
                </div>
              </div>

              {/* іконка */}
              <div className="grid grid-cols-8 gap-1">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => setIcon(e)}
                    className="grid h-9 place-items-center rounded-lg text-[18px] transition-colors duration-150"
                    style={{ background: icon === e ? T.surfaceHi : 'transparent', border: `1px solid ${icon === e ? T.lineHi : 'transparent'}` }}
                  >
                    {e}
                  </button>
                ))}
              </div>

              {/* колір */}
              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Колір розділу
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(HUES).map(([key, rgb]) => (
                    <button
                      key={key}
                      onClick={() => setHue(key)}
                      className="h-8 w-8 rounded-lg transition-transform duration-150 active:scale-95"
                      style={{
                        background: `rgba(${rgb},0.18)`,
                        border: `1.5px solid rgba(${rgb},${hue === key ? 0.95 : 0.28})`,
                        boxShadow: hue === key ? `0 0 14px rgba(${rgb},0.45)` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* заготовка */}
              <div>
                <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  З чого почати
                </label>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {PRESETS.map((p) => {
                    const on = preset === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPreset(p.id)}
                        className="rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
                        style={{
                          background: on ? `rgba(${T.accRgb},0.09)` : T.sunken,
                          border: `1px solid ${on ? T.lineAcc : T.line}`,
                        }}
                      >
                        <div className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: on ? T.text : T.text2 }}>
                          {p.label}
                        </div>
                        <div className="mt-0.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.45 }}>
                          {p.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              <button
                onClick={create}
                className="h-11 w-full rounded-xl text-[14px] font-bold transition-transform duration-200 active:scale-[0.99]"
                style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
              >
                Створити розділ
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ================================================================== */

export default function TradingSystem() {
  useEdgeFonts();

  const [doc, setDoc] = useState(loadDoc);
  const [searchOpen, setSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const coverRef = useRef(null);

  useEffect(() => saveDoc(doc), [doc]);

  const pages = doc.pages;
  const root = useMemo(() => pages.find((p) => !p.parentId) || pages[0], [pages]);
  const page = useMemo(() => pages.find((p) => p.id === doc.openId) || null, [pages, doc.openId]);
  const sections = useMemo(
    () => (root ? pages.filter((p) => p.parentId === root.id) : []),
    [pages, root],
  );
  const kids = useMemo(
    () => (page ? pages.filter((p) => p.parentId === page.id) : []),
    [pages, page],
  );

  /* Загальні цифри героя секції — рахуємо тут, а не в розмітці, щоб
     не тримати IIFE всередині JSX. */
  const secIdx = page ? sections.findIndex((s) => s.id === page.id) : -1;
  const secNum = secIdx >= 0 ? String(secIdx + 1).padStart(2, '0') : null;
  const updLabel = page?.updatedAt
    ? new Date(page.updatedAt).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  /* Відтінок розділу — трійка rgb; ним світиться героя, номери, плитки. */
  const tint = page ? (HUES[page.hue] || HUES.violet) : HUES.violet;

  /* Зміст ліворуч — з великих заголовків (h1 та h2) редактора. */
  const headings = useMemo(
    () => (page?.blocks || [])
      .filter((b) => (b.type === 'h1' || b.type === 'h2') && (b.text || '').trim())
      .map((b, i) => ({ id: b.id, n: String(i + 1).padStart(2, '0'), label: b.text.trim(), sub: b.type === 'h2' })),
    [page],
  );
  const [tocActive, setTocActive] = useState(null);
  useEffect(() => {
    if (!page || headings.length === 0) return undefined;
    const run = () => {
      let cur = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = document.getElementById(`h-${h.id}`);
        if (el && el.getBoundingClientRect().top - 120 <= 0) cur = h.id;
      }
      setTocActive(cur);
    };
    const raf = requestAnimationFrame(run);
    window.addEventListener('scroll', run, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', run, true); };
  }, [page, headings]);

  /* ---------- зміни ---------- */

  const setPages = (updater) =>
    setDoc((d) => ({ ...d, pages: typeof updater === 'function' ? updater(d.pages) : updater }));

  const open = (id) => { setDoc((d) => ({ ...d, openId: id })); window.scrollTo?.({ top: 0 }); };

  const patchPage = (id, patch) =>
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)));

  const addSection = ({ title, icon, hue, preset }) => {
    const fresh = {
      ...newPage(root.id, title),
      icon,
      hue,
      hint: '',
      blocks: buildPreset(preset),
    };
    setDoc((d) => ({ ...d, pages: [...d.pages, fresh], openId: fresh.id }));
  };

  const addSubPage = (parentId) => {
    const fresh = { ...newPage(parentId, 'Без назви'), icon: '📄', hue: page?.hue || 'violet' };
    setDoc((d) => ({ ...d, pages: [...d.pages, fresh], openId: fresh.id }));
  };

  const deletePage = (target) => {
    const ids = [target.id, ...descendants(pages, target.id)];
    setDoc((d) => ({
      pages: d.pages.filter((p) => !ids.includes(p.id)),
      openId: ids.includes(d.openId) ? (target.parentId === root.id ? null : target.parentId) : d.openId,
    }));
    setConfirm(null);
  };

  /* ---------- обкладинка ---------- */

  const readCover = (file) => {
    if (!file || !file.type?.startsWith('image/') || !page) return;
    const r = new FileReader();
    r.onload = () => patchPage(page.id, { cover: r.result });
    r.readAsDataURL(file);
  };

  /* ---------- гарячі клавіші ---------- */

  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') { setEmojiOpen(false); setLightbox(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!root) return null;

  return (
    <div className="relative min-h-full">
      <style>{`
        @media print { .no-print { display: none !important; } }

        /* ==========================================================
           Плитка розділу.

           Вона майже прозора — крапкове тло сторінки просвічує
           наскрізь, і сітка не перетворюється на стіну панелей.
           Тому світло всередині виглядало б брудно: замість нього
           світиться сама обводка, і рівно там, де курсор.
        ========================================================== */
        .ts-card {
          --mx: 50%;
          --my: 50%;
          --hue: 139,123,255;
          isolation: isolate;
          background-color: rgba(255,255,255,0.013);
          transition: background-color .4s ease, box-shadow .45s ease, border-color .4s ease;
        }
        .ts-card:hover {
          background-color: rgba(255,255,255,0.03);
          border-color: rgba(var(--hue), 0.16) !important;
          box-shadow:
            0 26px 60px -38px rgba(var(--hue), 0.7),
            0 14px 32px -26px rgba(0,0,0,0.9);
        }

        .ts-hatch, .ts-bloom, .ts-edge {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
        }

        /* Гравіювання — щоб прозора поверхня не була просто дірою */
        .ts-hatch {
          background: repeating-linear-gradient(122deg,
            rgba(255,255,255,.016) 0 1px, transparent 1px 9px);
        }

        /* Неонова обводка під курсором. Маска лишає від градієнта
           тільки рамку в один піксель. */
        .ts-edge {
          padding: 1px;
          background: radial-gradient(200px circle at var(--mx) var(--my),
            rgba(var(--hue), .95), rgba(var(--hue), .28) 34%, transparent 68%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: 0;
          transition: opacity .3s ease;
        }
        .ts-card:hover .ts-edge { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Ледь помітне світло всередині, щоб контур не висів у пустці */
        .ts-bloom {
          background: radial-gradient(260px circle at var(--mx) var(--my),
            rgba(var(--hue), .09), transparent 62%);
          opacity: 0;
          transition: opacity .35s ease;
        }
        .ts-card:hover .ts-bloom { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Кутові скоби — приціл, що зводиться на плитці */
        .ts-br {
          position: absolute;
          width: 13px;
          height: 13px;
          pointer-events: none;
          border: 1.5px solid rgba(var(--hue), .8);
          opacity: 0;
          transition: opacity .3s ease, transform .35s cubic-bezier(.22,1,.36,1);
        }
        .ts-br-tl { top: 7px; left: 7px;  border-right: 0; border-bottom: 0; border-radius: 5px 0 0 0; transform: translate(-6px,-6px); }
        .ts-br-tr { top: 7px; right: 7px; border-left: 0;  border-bottom: 0; border-radius: 0 5px 0 0; transform: translate(6px,-6px); }
        .ts-br-bl { bottom: 7px; left: 7px;  border-right: 0; border-top: 0; border-radius: 0 0 0 5px; transform: translate(-6px,6px); }
        .ts-br-br { bottom: 7px; right: 7px; border-left: 0;  border-top: 0; border-radius: 0 0 5px 0; transform: translate(6px,6px); }
        .ts-card:hover .ts-br { opacity: 1; transform: translate(0,0); }

        @media (prefers-reduced-motion: reduce) {
          .ts-br { transition: opacity .2s ease; }
        }
      `}</style>

      {/* Вітрина живе в колонці — сітку плиток не варто розтягувати на
          два метри. А відкритий розділ навпаки бере всю ширину: це
          робочий простір, у нього мають влазити широкі таблиці. */}
      <div
        className={`relative z-10 w-full pb-24 pt-5 lg:pb-32 lg:pt-7 ${
          page
            ? 'px-3 sm:px-5 xl:px-7'
            : 'mx-auto max-w-[1400px] px-4 sm:px-6 lg:w-[92%] lg:px-0'
        }`}
      >

        <AnimatePresence mode="wait">
          {/* ═══════════════ ВІТРИНА РОЗДІЛІВ ═══════════════ */}
          {!page && (
            <motion.div
              key="hub"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
                    Торгова система
                  </div>
                  <input
                    value={root.title}
                    onChange={(e) => patchPage(root.id, { title: e.target.value })}
                    placeholder="Моя торгова система"
                    className="w-full max-w-[620px] bg-transparent outline-none placeholder:opacity-30"
                    style={{
                      fontFamily: T.display,
                      fontSize: 'clamp(28px, 5vw, 46px)',
                      fontWeight: 700,
                      letterSpacing: '-0.035em',
                      color: T.text,
                      lineHeight: 1.05,
                    }}
                  />
                  <input
                    value={root.hint || ''}
                    onChange={(e) => patchPage(root.id, { hint: e.target.value })}
                    placeholder="Одним рядком: на чому ти заробляєш"
                    className="mt-3 w-full max-w-[620px] bg-transparent text-[15px] outline-none placeholder:opacity-30"
                    style={{ fontFamily: T.sans, color: T.text3 }}
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn icon={Search} label="Пошук" onClick={() => setSearchOpen(true)} />
                  <IconBtn icon={Printer} label="PDF" onClick={() => window.print()} />
                  <IconBtn icon={RotateCcw} label="Шаблон" tone={T.warn} onClick={() => setConfirm({ reset: true })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sections.map((s, i) => (
                  <SectionCard
                    key={s.id}
                    page={s}
                    index={i}
                    subCount={pages.filter((p) => p.parentId === s.id).length}
                    onOpen={open}
                  />
                ))}

                {/* власний розділ */}
                <motion.button
                  onClick={() => setNewOpen(true)}
                  onPointerMove={track}
                  initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.45, delay: Math.min(sections.length, 10) * 0.035, ease: EASE }}
                  className="ts-card group relative flex min-h-[210px] flex-col items-center justify-center gap-3 rounded-2xl p-5"
                  style={{ '--hue': T.accRgb, border: `1px dashed ${T.lineHi}` }}
                >
                  <span aria-hidden className="ts-bloom" />
                  <span aria-hidden className="ts-edge" />
                  <span
                    className="relative z-10 grid h-11 w-11 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                    style={{ background: `rgba(${T.accRgb},0.08)`, border: `1px solid rgba(${T.accRgb},0.24)` }}
                  >
                    <Plus size={19} strokeWidth={2.4} style={{ color: T.acc }} />
                  </span>
                  <span className="relative z-10 text-[14.5px] font-bold" style={{ fontFamily: T.sans, color: T.text2 }}>
                    Свій розділ
                  </span>
                  <span className="relative z-10 max-w-[220px] text-center text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.5 }}>
                    Обери заготовку — і одразу почнеш писати, а не вигадувати структуру
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ═══════════════ РОЗДІЛ ═══════════════ */}
          {page && (
            <motion.div
              key="page"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <>
                {/* ─────────── ЛИПКИЙ ТУЛБАР ─────────── */}
                <div
                  data-bar
                  className="sticky top-0 z-40 -mx-3 flex items-center justify-between gap-5 px-6 sm:-mx-5 xl:-mx-7 no-print"
                  style={{
                    height: 60,
                    background: 'color-mix(in srgb, var(--edge-bg) 74%, transparent)',
                    backdropFilter: 'blur(24px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                    borderBottom: `1px solid ${T.line}`,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <button
                      onClick={() => open(page.parentId === root.id ? null : page.parentId)}
                      className="group flex items-center gap-[9px] rounded-[10px] py-[7px] pl-[9px] pr-[13px] text-[13.5px] transition-colors duration-150"
                      style={{ fontFamily: T.sans, color: T.text2, border: '1px solid transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-text-rgb),0.045)'; e.currentTarget.style.color = T.text; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
                    >
                      <span className="text-[14px] leading-none opacity-70">‹</span>
                      {page.parentId === root.id ? 'Усі розділи' : 'Назад'}
                    </button>
                    <span className="hidden h-4 w-px sm:block" style={{ background: T.lineHi }} />
                    <span className="hidden truncate text-[10.5px] uppercase sm:block" style={{ fontFamily: T.mono, letterSpacing: '0.22em', color: T.text4 }}>
                      {page.parentId !== root.id
                        ? `${pages.find((p) => p.id === page.parentId)?.title || ''} / ${page.title}`
                        : page.title}
                    </span>
                  </div>

                  <div data-bar-actions className="flex items-center gap-2.5">
                    <div
                      className="flex items-center gap-0.5 rounded-[13px] p-[3px]"
                      style={{ border: `1px solid ${T.line}`, background: 'rgba(var(--edge-text-rgb),0.025)', boxShadow: 'inset 0 1px 0 rgba(var(--edge-text-rgb),0.05)' }}
                    >
                      <TBtn onClick={() => setSearchOpen(true)} label="Пошук">
                        <Search size={13} strokeWidth={2} />
                        <span className="ml-0.5 hidden rounded-[5px] border px-[5px] py-[2px] text-[9.5px] tracking-[0.06em] lg:inline" style={{ fontFamily: T.mono, background: 'rgba(var(--edge-text-rgb),0.05)', borderColor: T.line, color: T.text4 }}>/</span>
                      </TBtn>
                      <span className="h-4 w-px" style={{ background: T.line }} />
                      {!page.cover && (
                        <>
                          <TBtn onClick={() => coverRef.current?.click()} label="Обкладинка">
                            <ImageIcon size={13} strokeWidth={2} />
                          </TBtn>
                          <span className="h-4 w-px" style={{ background: T.line }} />
                        </>
                      )}
                      <TBtn onClick={() => window.print()} label="PDF">
                        <Printer size={13} strokeWidth={2} />
                      </TBtn>
                      <span className="h-4 w-px" style={{ background: T.line }} />
                      <TBtn onClick={() => setConfirm(page)} label="Видалити" danger>
                        <Trash2 size={13} strokeWidth={2} />
                      </TBtn>
                    </div>
                    <button
                      onClick={() => addSubPage(page.id)}
                      className="flex items-center gap-2 rounded-[12px] px-[18px] py-[9px] text-[13px] font-bold transition-[transform,box-shadow] duration-150"
                      style={{
                        fontFamily: T.sans,
                        color: 'var(--edge-on-acc)',
                        letterSpacing: '0.005em',
                        border: `1px solid rgba(${tint},0.45)`,
                        background: `linear-gradient(180deg, rgba(${tint},0.9), rgb(${tint}))`,
                        boxShadow: `0 6px 20px rgba(${tint},0.28), inset 0 1px 0 rgba(255,255,255,0.35)`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 12px 30px rgba(${tint},0.4), inset 0 1px 0 rgba(255,255,255,0.35)`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 6px 20px rgba(${tint},0.28), inset 0 1px 0 rgba(255,255,255,0.35)`; }}
                    >
                      <Plus size={13} strokeWidth={2.6} />
                      <span className="hidden sm:inline">Підрозділ</span>
                    </button>
                  </div>
                </div>

                {/* ─────────── ОБКЛАДИНКА + ГЕРОЙ ─────────── */}
                <div className="relative -mx-3 sm:-mx-5 xl:-mx-7">
                  <div
                    data-cover
                    className="relative h-[76px] overflow-hidden sm:h-[112px]"
                    style={{
                      background: page.cover
                        ? undefined
                        : `radial-gradient(135% 120% at 50% -10%, rgba(${tint},0.20), transparent 60%), linear-gradient(180deg, color-mix(in srgb, var(--edge-surface) 82%, var(--edge-bg)), var(--edge-bg))`,
                    }}
                  >
                    {page.cover && <img src={page.cover} alt="" className="h-full w-full object-cover" />}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background: page.cover
                          ? 'linear-gradient(180deg, transparent 30%, var(--edge-bg) 98%)'
                          : 'radial-gradient(rgba(var(--edge-text-rgb),0.035) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(180deg, transparent 45%, var(--edge-bg) 100%)',
                      }}
                    />
                    {page.cover && (
                      <span className="absolute right-6 top-4 flex gap-1.5 no-print">
                        <button
                          onClick={() => coverRef.current?.click()}
                          className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
                          style={{ background: 'var(--edge-panel, rgba(10,10,12,0.8))', border: `1px solid ${T.lineHi}`, color: T.text2, backdropFilter: 'blur(8px)', fontFamily: T.sans }}
                        >
                          Змінити
                        </button>
                        <button
                          onClick={() => patchPage(page.id, { cover: '' })}
                          className="grid h-[30px] w-[30px] place-items-center rounded-lg"
                          style={{ background: 'var(--edge-panel, rgba(10,10,12,0.8))', border: `1px solid ${T.lineHi}`, color: T.text2, backdropFilter: 'blur(8px)' }}
                        >
                          <X size={13} strokeWidth={2.6} />
                        </button>
                      </span>
                    )}
                  </div>
                  <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => readCover(e.target.files?.[0])} />

                  <div className="relative mx-auto max-w-[1180px] px-6 sm:px-[34px]">
                    <div style={{ marginTop: -56 }}>
                      <div data-herorow className="flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:gap-7">
                        <button
                          onClick={() => setEmojiOpen((v) => !v)}
                          title="Змінити іконку"
                          className="grid shrink-0 place-items-center transition-transform duration-200"
                          style={{
                            width: 112, height: 112, borderRadius: 28,
                            fontSize: 50, lineHeight: 1,
                            background: `linear-gradient(180deg, rgba(${tint},0.26), color-mix(in srgb, var(--edge-surface) 92%, var(--edge-bg)))`,
                            border: `1px solid rgba(${tint},${emojiOpen ? 0.55 : 0.3})`,
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 44px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(${tint},0.06)`,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
                        >
                          {page.icon || '📄'}
                        </button>

                        <div className="relative min-w-0 flex-1 pb-1.5">
                          <div className="flex flex-wrap items-center gap-3.5">
                            <span
                              className="rounded-lg px-[11px] py-[6px] text-[10px] font-medium uppercase"
                              style={{ fontFamily: T.mono, letterSpacing: '0.2em', color: `rgb(${tint})`, background: `rgba(${tint},0.12)`, border: `1px solid rgba(${tint},0.28)` }}
                            >
                              {secNum ? `Розділ ${secNum}` : 'Підрозділ'}
                            </span>
                            <span className="text-[10.5px] uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.16em', color: T.text4 }}>
                              оновлено {updLabel}
                            </span>
                          </div>
                          <input
                            value={page.title}
                            onChange={(e) => patchPage(page.id, { title: e.target.value })}
                            placeholder="Назва розділу"
                            className="mt-2.5 w-full bg-transparent outline-none placeholder:opacity-25"
                            style={{
                              fontFamily: T.display, fontSize: 'clamp(40px, 7vw, 68px)', fontWeight: 900,
                              letterSpacing: '-0.042em', color: T.text, lineHeight: 0.98,
                            }}
                          />
                        </div>

                        <AnimatePresence>
                          {emojiOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: 0.98 }}
                              transition={{ duration: 0.16, ease: EASE }}
                              className="absolute left-0 top-[120px] z-50 w-[290px] rounded-2xl p-2 no-print"
                              style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px var(--edge-panel-glow, rgba(0,0,0,0.7))' }}
                            >
                              <div className="grid grid-cols-8 gap-0.5">
                                {EMOJI.map((e) => (
                                  <button
                                    key={e}
                                    onClick={() => { patchPage(page.id, { icon: e }); setEmojiOpen(false); }}
                                    className="grid h-9 place-items-center rounded-lg text-[18px] transition-colors duration-150"
                                    onMouseEnter={(ev) => (ev.currentTarget.style.background = T.surfaceHi)}
                                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                                  >
                                    {e}
                                  </button>
                                ))}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5 px-1 pb-1 pt-2" style={{ borderTop: `1px solid ${T.line}` }}>
                                {Object.entries(HUES).map(([key, rgb]) => (
                                  <button
                                    key={key}
                                    onClick={() => patchPage(page.id, { hue: key })}
                                    className="h-7 w-7 rounded-lg"
                                    style={{ background: `rgba(${rgb},0.18)`, border: `1.5px solid rgba(${rgb},${page.hue === key ? 0.95 : 0.25})` }}
                                  />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <input
                        value={page.hint || ''}
                        onChange={(e) => patchPage(page.id, { hint: e.target.value })}
                        placeholder="Про що цей розділ — одним рядком"
                        className="mt-2.5 w-full max-w-[640px] bg-transparent text-[17px] outline-none placeholder:opacity-25"
                        style={{ fontFamily: T.sans, fontWeight: 400, color: T.text, lineHeight: 1.55 }}
                      />

                      <div className="mt-3 flex flex-wrap items-center gap-x-[26px] gap-y-2 pb-[18px]">
                        <span className="text-[12.5px]" style={{ fontFamily: T.mono, letterSpacing: '0.04em', color: T.text }}>
                          <span style={{ color: `rgb(${tint})` }}>{String(page.blocks?.length || 0).padStart(2, '0')}</span> блоків
                        </span>
                        <span className="h-[3px] w-[3px] rounded-full" style={{ background: T.text3 }} />
                        <span className="text-[12.5px]" style={{ fontFamily: T.mono, letterSpacing: '0.04em', color: T.text }}>
                          <span style={{ color: `rgb(${tint})` }}>{String(kids.length).padStart(2, '0')}</span> підрозділів
                        </span>
                        <span className="h-[3px] w-[3px] rounded-full" style={{ background: T.text3 }} />
                        <span className="text-[12.5px]" style={{ fontFamily: T.mono, letterSpacing: '0.04em', color: T.text3 }}>
                          {updLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="-mx-3 h-px sm:-mx-5 xl:-mx-7" style={{ background: `linear-gradient(90deg, transparent, ${T.lineHi} 20%, ${T.lineHi} 80%, transparent)` }} />

                {/* ─────────── ЗМІСТ + ДОКУМЕНТ ─────────── */}
                <div className="mx-auto flex max-w-[1180px] px-6 sm:px-[34px]">
                  {headings.length > 0 && (
                    <div className="hidden shrink-0 xl:block" style={{ width: 168, padding: '28px 0 80px' }}>
                      <div className="sticky top-[92px]">
                        <div className="mb-3 pl-3 text-[9.5px] uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.24em', color: T.text3 }}>Зміст</div>
                        <div className="flex flex-col gap-px" style={{ borderLeft: `1px solid ${T.line}` }}>
                          {headings.map((h) => {
                            const on = tocActive === h.id;
                            return (
                              <a
                                key={h.id}
                                href={`#h-${h.id}`}
                                onClick={(e) => { e.preventDefault(); document.getElementById(`h-${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                                className="relative flex items-baseline gap-2 py-[6px] pl-3 pr-2 no-underline transition-colors duration-150"
                                style={{ color: on ? T.text : T.text2, fontWeight: on ? 500 : 400 }}
                                onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text; }}
                                onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                              >
                                <span className="absolute -left-px top-0 h-full w-px" style={{ background: on ? `rgb(${tint})` : 'transparent' }} />
                                <span className="text-[10px]" style={{ fontFamily: T.mono, color: on ? `rgb(${tint})` : T.text3 }}>{h.n}</span>
                                <span className="text-[13px] leading-[1.35]">{h.label}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="min-w-0 flex-1 xl:ml-14" style={{ maxWidth: 780, padding: '28px 0 40px' }}>
                    <BlockEditor
                      key={page.id}
                      blocks={page.blocks}
                      tint={tint}
                      onChange={(blocks) => patchPage(page.id, { blocks })}
                      onFullscreen={setLightbox}
                    />
                  </div>
                </div>

                {/* ─────────── ПІДРОЗДІЛИ ─────────── */}
                <div className="mx-auto max-w-[1180px] px-6 pb-[100px] pt-[60px] sm:px-[34px]">
                  <div className="h-px" style={{ background: T.line }} />
                  <div className="mt-[34px] flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.24em', color: T.text4 }}>
                        Підрозділи · {String(kids.length).padStart(2, '0')}
                      </div>
                      <div className="mt-3 text-[26px] font-bold" style={{ fontFamily: T.display, letterSpacing: '-0.025em', color: T.text }}>
                        Глибше по «{page.title || 'розділу'}»
                      </div>
                    </div>
                    <button
                      onClick={() => addSubPage(page.id)}
                      className="flex items-center gap-[9px] rounded-[11px] px-[18px] py-[11px] text-[13.5px] transition-colors duration-150 no-print"
                      style={{ fontFamily: T.sans, color: T.text2, border: `1px solid ${T.lineHi}`, background: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-text-rgb),0.05)'; e.currentTarget.style.color = T.text; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
                    >
                      <span className="text-[15px] leading-none">+</span> Додати
                    </button>
                  </div>

                  <div className="mt-[26px] grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                    {kids.map((k, ki) => (
                      <button
                        key={k.id}
                        onClick={() => open(k.id)}
                        className="sub group block rounded-[16px] p-[22px] text-left transition-all duration-200"
                        style={{ minHeight: 158, background: T.surface, border: `1px solid ${T.line}`, color: T.text }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${tint},0.4)`; e.currentTarget.style.background = T.surfaceHi; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = T.surface; }}
                      >
                        <span className="flex items-center justify-between">
                          <span
                            className="grid h-[38px] w-[38px] place-items-center rounded-[11px] text-[12px]"
                            style={{ fontFamily: T.mono, background: `rgba(${tint},0.1)`, border: `1px solid rgba(${tint},0.24)`, color: `rgb(${tint})` }}
                          >
                            {k.icon || String(ki + 1).padStart(2, '0')}
                          </span>
                          <ArrowRight size={15} strokeWidth={2.2} className="transition-transform duration-200 group-hover:translate-x-[5px]" style={{ color: T.text4 }} />
                        </span>
                        <span className="mt-[38px] block text-[19px] font-bold" style={{ fontFamily: T.sans, letterSpacing: '-0.02em', color: T.text }}>
                          {k.title || 'Без назви'}
                        </span>
                        <span className="mt-2 block text-[11px] uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.1em', color: T.text4 }}>
                          {String(k.blocks?.length || 0)} блоків
                        </span>
                      </button>
                    ))}
                    <div className="flex flex-col justify-end gap-2 rounded-[16px] p-[22px]" style={{ minHeight: 158, border: `1px dashed ${T.line}` }}>
                      <span className="text-[15px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>Розділ став завеликим?</span>
                      <span className="text-[13.5px]" style={{ fontFamily: T.sans, fontWeight: 400, lineHeight: 1.55, color: T.text4 }}>
                        Розбий його — кожен сетап чи правило може жити окремою сторінкою.
                      </span>
                    </div>
                  </div>
                </div>
              </>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─────────── Свій розділ ─────────── */}
      <NewSection open={newOpen} onClose={() => setNewOpen(false)} onCreate={addSection} />

      {/* ─────────── Пошук ─────────── */}
      <AnimatePresence>
        {searchOpen && (
          <SearchModal
            pages={pages.filter((p) => p.id !== root.id)}
            onOpen={(id) => { open(id); setSearchOpen(false); }}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ─────────── Лайтбокс ─────────── */}
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

      {/* ─────────── Підтвердження ─────────── */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setConfirm(null)}
            className="fixed inset-0 z-[400] grid place-items-center p-4"
            style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-2xl p-7 text-center"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}` }}
            >
              <div
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.badRgb},0.10)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
              >
                <Trash2 size={22} strokeWidth={1.9} style={{ color: T.bad }} />
              </div>
              <div className="mb-2.5 text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text, overflowWrap: 'anywhere' }}>
                {confirm.reset ? 'Повернути шаблон?' : `Видалити «${confirm.title}»?`}
              </div>
              <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                {confirm.reset
                  ? 'Усі розділи й весь текст будуть замінені початковим шаблоном.'
                  : 'Разом із розділом зникнуть усі його підрозділи.'}
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirm(null)}
                  className="h-11 flex-1 rounded-xl text-[14px] font-semibold"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                >
                  Скасувати
                </button>
                <button
                  onClick={() => { if (confirm.reset) { setDoc(resetDoc()); setConfirm(null); } else deletePage(confirm); }}
                  className="h-11 flex-1 rounded-xl text-[14px] font-bold"
                  style={{ background: T.bad, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
                >
                  {confirm.reset ? 'Повернути' : 'Видалити'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
