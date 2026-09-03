import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Pencil, Trash2, ExternalLink, Archive, ArchiveRestore, Share2, Copy, Pin, PinOff,
  FolderInput, ChevronLeft, ChevronRight, Image as ImageIcon, Link as LinkIcon, Check,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { notify } from '../../utils/notify';
import { TagChip } from './TagPicker';
import { renderMd, mdPlain, toggleCheck } from '../../lib/mdLite';
import { cardOf, cardColor } from '../../lib/noteCard';

/* ==================================================================
   Читалка нотатки.

   Дві колонки: зліва сам запис, справа те, що про нього відомо, і що
   з ним можна зробити. Розділення не декоративне — у лівій колонці
   немає жодного елемента керування, тому текст читається як текст, а
   не як картка в інтерфейсі.

   Колір нотатки тут не акцент на дрібниці, а тон усього вікна:
   підкладка, лінійка під заголовком, крапки списків і цитата беруть
   його. Так відкрита нотатка впізнається так само, як її картка на
   полиці.
================================================================== */

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

function HeadBtn({ icon: Icon, label, onClick, danger }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={onClick}
      title={label}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px]"
      style={{
        background: hov ? (danger ? '#ff8f8f24' : '#ffffff16') : '#ffffff08',
        border: `1px solid ${hov ? (danger ? '#ff8f8f66' : '#3d3d4c') : '#23232e'}`,
        color: hov ? (danger ? '#ff9d9d' : '#ffffff') : '#a5a3b3',
        transition: 'all .16s',
      }}
    >
      <Icon size={15} strokeWidth={1.8} />
    </button>
  );
}

/* Рядок у правій колонці: дія, а не кнопка форми. Тому підсвічується
   кольором самої нотатки, а не акцентом застосунку. */
function ActionRow({ icon: Icon, name, kbd, color, onClick, active }) {
  const [hov, setHov] = useState(false);
  const on = hov || active;

  return (
    <button
      onClick={onClick}
      className="flex h-[38px] w-full items-center gap-2.5 rounded-[11px] px-3"
      style={{
        background: on ? `${color}14` : '#ffffff06',
        border: `1px solid ${on ? `${color}4d` : '#1e1e27'}`,
        color: on ? '#ffffff' : '#b3b1c0',
        transition: 'all .16s',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <Icon size={14} strokeWidth={1.8} style={{ flex: 'none', color: on ? color : '#a3a1b2' }} />
      <span className="min-w-0 flex-1 text-left text-[13px] font-semibold" style={{ fontFamily: T.sans }}>{name}</span>
      {kbd && (
        <span
          className="shrink-0 rounded-md px-1.5 py-[2px] text-[10px]"
          style={{ fontFamily: T.mono, background: '#ffffff0d', border: '1px solid #26262f', color: '#8b8998' }}
        >
          {kbd}
        </span>
      )}
    </button>
  );
}

const SideLabel = ({ children }) => (
  <span className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.7px', color: '#9a98ab' }}>
    {children}
  </span>
);

/* «2 год тому» замість дати з хвилинами: у нотатці важливо не коли
   саме, а наскільки давно її чіпали. */
const since = (iso) => {
  const t = new Date(iso || 0).getTime();
  if (!t) return '—';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'вчора';
  if (days < 31) return `${days} дн тому`;
  return `${Math.round(days / 30)} міс тому`;
};

const wordsIn = (text) => {
  const clean = mdPlain(text).trim();
  return clean ? clean.split(/\s+/).length : 0;
};

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

export default function NoteReader({
  note, tree, fmtDate, folders = [], onClose, onEdit, onDelete, onArchive,
  onMove, onTagClick, onImage, onToggleCheck, onPin, onTrade,
  onPrev, onNext,
}) {
  const contentBox = useContentBox();
  const [moveOpen, setMoveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  /* E — редагувати, стрілки — сусідні нотатки. Esc закриває шаром
     вище, на сторінці: там черга шарів, і читалка в ній не остання. */
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') { e.preventDefault(); onEdit(); }
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEdit, onPrev, onNext]);

  if (!note) return null;

  const images = (note.images || []).filter((x) => typeof x === 'string');
  const card = cardOf(note);
  const c = cardColor(note, () => null) || T.acc;
  const folder = folders.find((f) => f.id === note.folder_id) || null;
  const words = wordsIn(note.description);

  /* Сучасний буфер обміну доступний не завжди: без https, без
     жесту користувача або з вимкненим дозволом він мовчки відмовляє.
     Тому за ним стоїть старий спосіб через прихований textarea — він
     працює скрізь, де взагалі є браузер. */
  const putInBuffer = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* пробуємо інакше */ }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const copyText = async () => {
    const text = [note.title, '', note.description].join('\n').trim();
    if (await putInBuffer(text)) {
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
      return;
    }
    notify.error('Не вдалось скопіювати', 'Браузер не дав доступ до буфера.');
  };

  const share = async () => {
    const text = [note.title, '', mdPlain(note.description)].join('\n').trim();
    if (navigator.share) {
      try { await navigator.share({ title: note.title || 'Нотатка', text }); return; } catch { /* скасували */ }
    }
    if (await putInBuffer(text)) notify.success('Скопійовано', 'Нотатка в буфері — можна вставляти.');
    else notify.error('Не вдалось поділитись', 'Браузер не дав доступ ані до буфера, ані до системного вікна.');
  };

  const facts = [
    ['Створено', fmtDate(note.created_at)],
    ['Змінено', since(note.updated_at || note.created_at)],
    ['Обсяг', `${words} ${plural(words, 'слово', 'слова', 'слів')}`],
    ['Вкладень', String(images.length)],
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed bottom-0 top-0 z-[200] overflow-y-auto"
      style={{
        left: contentBox ? contentBox.left : 0,
        width: contentBox ? contentBox.width : '100%',
        background: 'rgba(4,4,7,0.62)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex min-h-full items-center justify-center px-6 py-8">
        <motion.article
          initial={{ opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.99 }}
          transition={{ duration: 0.3, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full rounded-[24px]"
          style={{
            maxWidth: 1000,
            background: `linear-gradient(170deg, ${c}16, #0e0e13 26%, #0b0b10)`,
            border: '1px solid #23232e',
            boxShadow: `0 50px 110px -40px #000, 0 0 0 1px ${c}14`,
          }}
        >
          <span
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ borderRadius: '24px 24px 0 0', background: `linear-gradient(90deg,transparent,${c}cc 30%,#8b7cffcc 70%,transparent)` }}
          />

          {/* ─── шапка ─── */}
          <div className="flex items-center justify-between gap-5 py-4 pl-[22px] pr-[18px]" style={{ borderBottom: '1px solid #1c1c25' }}>
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl text-[17px]"
                style={{ background: `${c}20`, border: `1px solid ${c}5e`, boxShadow: `inset 0 1px 0 ${c}4d` }}
              >
                {card.icon || <ImageIcon size={17} strokeWidth={1.7} style={{ color: c }} />}
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex items-center gap-[7px] rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                    style={{ background: `${c}1c`, border: `1px solid ${c}42`, color: `${c}f2`, fontFamily: T.sans }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px 1px ${c}cc` }} />
                    {folder?.name || 'Без папки'}
                  </span>
                  <span className="text-[10.5px] uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.2px', color: '#6f6d7d' }}>
                    {fmtDate(note.created_at)}
                  </span>
                </div>
                <div className="mt-1 truncate text-[12px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>
                  змінено {since(note.updated_at || note.created_at)} · {words} {plural(words, 'слово', 'слова', 'слів')}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onEdit}
                className="relative flex h-9 items-center gap-2 overflow-hidden rounded-[11px] px-4"
                style={{
                  background: 'linear-gradient(180deg,#5546f8,#3f30e8)',
                  boxShadow: `0 10px 24px -12px ${A(0.7)}, inset 0 1px 0 #ffffff33`,
                  transition: 'all .2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(180deg,#6355ff,#4a3bf5)'; e.currentTarget.style.boxShadow = `0 14px 32px -12px ${A(0.85)}, inset 0 1px 0 #ffffff4d`; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(180deg,#5546f8,#3f30e8)'; e.currentTarget.style.boxShadow = `0 10px 24px -12px ${A(0.7)}, inset 0 1px 0 #ffffff33`; }}
              >
                <Pencil size={14} strokeWidth={1.9} style={{ color: '#fff' }} />
                <span className="text-[12.5px] font-bold" style={{ fontFamily: T.sans, color: '#ffffff' }}>Редагувати</span>
              </button>

              <HeadBtn icon={Share2} label="Поділитись" onClick={share} />
              {onArchive && (
                <HeadBtn
                  icon={note.archived ? ArchiveRestore : Archive}
                  label={note.archived ? 'Повернути зі стрічки' : 'В архів'}
                  onClick={onArchive}
                />
              )}
              <HeadBtn icon={Trash2} label="Видалити" onClick={onDelete} danger />

              <span className="mx-0.5 h-6 w-px" style={{ background: '#22222c' }} />
              <HeadBtn icon={X} label="Закрити (Esc)" onClick={onClose} />
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 232px' }}>

            {/* ─────────── сам запис ─────────── */}
            <div className="min-w-0 px-[30px] pb-[26px] pt-7" style={{ borderRight: '1px solid #1c1c25' }}>
              <h1
                className="text-[30px] font-bold sm:text-[38px]"
                style={{ fontFamily: T.display, color: '#ffffff', letterSpacing: '-1.6px', lineHeight: 1.06 }}
              >
                {note.title || 'Без назви'}
              </h1>

              {(note.tags || []).length > 0 && (
                <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                  {note.tags.map((t) => (
                    <TagChip key={t} id={t} tree={tree} showPath onClick={() => onTagClick(t)} />
                  ))}
                </div>
              )}

              {/* Лінійка кольору нотатки замість звичайного розділювача:
                  вона ж єдине, що відділяє шапку запису від тексту. */}
              <div className="my-5 h-px" style={{ background: `linear-gradient(90deg, ${c}66, transparent 70%)` }} />

              <div
                style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: '#cfcddb', minHeight: 236 }}
              >
                {note.description?.trim()
                  ? renderMd(note.description, {
                    accent: c,
                    text: '#cfcddb',
                    muted: '#8b8998',
                    line: '#26262f',
                    /* Галочку ставлять під час читання: чекліст існує
                       саме для того, щоб його проходити. */
                    onToggle: onToggleCheck ? (i) => onToggleCheck(toggleCheck(note.description, i)) : undefined,
                  })
                  : <span style={{ color: '#6f6d7d' }}>Тут порожньо — сам текст ще не написаний.</span>}
              </div>

              {(images.length > 0 || note.chart_link) && (
                <div className="mt-6 flex flex-wrap items-center gap-2 pt-[18px]" style={{ borderTop: '1px solid #1a1a23' }}>
                  <span className="mr-0.5 text-[10.5px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '1.7px', color: '#9a98ab' }}>
                    Вкладення
                  </span>

                  {images.map((src, i) => (
                    <button
                      key={src}
                      onClick={() => onImage(src)}
                      className="flex items-center gap-2 rounded-[10px] py-1.5 pl-2 pr-3"
                      style={{ background: '#ffffff08', border: '1px solid #22222c', transition: 'all .16s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff12'; e.currentTarget.style.borderColor = '#33333f'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.borderColor = '#22222c'; }}
                    >
                      <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-md" style={{ border: '1px solid #23232e' }}>
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </span>
                      <span className="text-[12px] font-semibold" style={{ fontFamily: T.sans, color: '#c2c0ce' }}>
                        скрін {i + 1}
                      </span>
                    </button>
                  ))}

                  {note.chart_link && (
                    <a
                      href={note.chart_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: '#ffffff08', border: '1px solid #22222c', color: '#c2c0ce', fontFamily: T.sans }}
                    >
                      <ExternalLink size={13} strokeWidth={1.9} style={{ color: c }} />
                      джерело
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* ─────────── про запис ─────────── */}
            <div className="flex min-w-0 flex-col gap-[18px] px-[18px] pb-5 pt-[22px]">
              <div>
                <SideLabel>Про нотатку</SideLabel>
                <div className="mt-2.5 flex flex-col gap-px">
                  {facts.map(([k, v], i) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2.5 rounded-[9px] px-2.5 py-2"
                      style={{ background: i % 2 ? 'transparent' : '#ffffff05' }}
                    >
                      <span className="text-[12px]" style={{ fontFamily: T.sans, color: '#8b8998' }}>{k}</span>
                      <span className="shrink-0 text-[11.5px]" style={{ fontFamily: T.mono, color: '#c2c0ce' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <SideLabel>Дії</SideLabel>
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <ActionRow
                    icon={copied ? Check : Copy}
                    name={copied ? 'Скопійовано' : 'Копіювати текст'}
                    kbd="⌘C"
                    color={c}
                    active={copied}
                    onClick={copyText}
                  />

                  {onPin && (
                    <ActionRow
                      icon={card.pin ? PinOff : Pin}
                      name={card.pin ? 'Відкріпити' : 'Закріпити'}
                      color={c}
                      active={card.pin}
                      onClick={() => onPin(!card.pin)}
                    />
                  )}

                  {onMove && folders.length > 0 && (
                    <ActionRow
                      icon={FolderInput}
                      name="Перемістити"
                      color={c}
                      active={moveOpen}
                      onClick={() => setMoveOpen((v) => !v)}
                    />
                  )}

                  {card.trade && onTrade && (
                    <ActionRow
                      icon={LinkIcon}
                      name={card.trade.name}
                      color={c}
                      onClick={() => onTrade(card.trade)}
                    />
                  )}
                </div>

                {/* Перекласти на іншу полицю — прямо звідси. Заходити
                    для цього в редагування означало б відкривати форму
                    зміни тексту заради того, щоб текст не чіпати. */}
                {moveOpen && (
                  <div
                    className="absolute left-0 right-0 z-30 mt-2 overflow-auto rounded-[14px] p-1.5"
                    style={{ top: '100%', maxHeight: 220, background: '#14141b', border: '1px solid #2c2c38', boxShadow: '0 24px 50px -18px #000' }}
                  >
                    {[{ id: null, name: 'Без папки', color: '#6b6980' }, ...folders].map((f) => {
                      const on = (note.folder_id || null) === f.id;
                      return (
                        <button
                          key={f.id || 'none'}
                          onClick={() => { onMove(f.id); setMoveOpen(false); }}
                          className="flex h-[34px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-semibold"
                          style={{ fontFamily: T.sans, background: on ? `${f.color}20` : 'transparent', color: on ? '#ffffff' : '#b3b1c0' }}
                        >
                          <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: f.color }} />
                          <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
                          {on && <Check size={13} strokeWidth={2.2} style={{ flex: 'none' }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── підвал ─── */}
          <div
            className="flex items-center justify-between gap-5 py-3 pl-[22px] pr-[18px]"
            style={{ borderTop: '1px solid #1c1c25', background: '#0a0a0e', borderRadius: '0 0 24px 24px' }}
          >
            <div className="hidden items-center gap-3.5 sm:flex">
              {[{ k: 'E', t: 'редагувати' }, { k: 'esc', t: 'закрити' }].map(({ k, t }) => (
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

            {/* Сусідні нотатки: читання рідко закінчується на одній, а
                повертатись у список заради наступної — зайвий крок. */}
            <div className="ml-auto flex items-center gap-2">
              {[
                { on: onPrev, icon: ChevronLeft, name: 'Назад', side: 'left' },
                { on: onNext, icon: ChevronRight, name: 'Далі', side: 'right' },
              ].map(({ on, icon: Icon, name, side }) => (
                <button
                  key={name}
                  onClick={on || undefined}
                  disabled={!on}
                  title={side === 'left' ? 'Попередня нотатка (←)' : 'Наступна нотатка (→)'}
                  className="flex h-[34px] items-center gap-[7px] rounded-[10px] px-3"
                  style={{
                    background: '#ffffff08',
                    border: '1px solid #23232e',
                    opacity: on ? 1 : 0.4,
                    cursor: on ? 'pointer' : 'not-allowed',
                    transition: 'all .16s',
                  }}
                  onMouseEnter={(e) => { if (on) { e.currentTarget.style.background = '#ffffff14'; e.currentTarget.style.borderColor = '#353542'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.borderColor = '#23232e'; }}
                >
                  {side === 'left' && <Icon size={13} strokeWidth={2} style={{ color: '#a3a1b2' }} />}
                  <span className="text-[12px] font-semibold" style={{ fontFamily: T.sans, color: '#c2c0ce' }}>{name}</span>
                  {side === 'right' && <Icon size={13} strokeWidth={2} style={{ color: '#a3a1b2' }} />}
                </button>
              ))}
            </div>
          </div>
        </motion.article>
      </div>
    </motion.div>
  );
}
