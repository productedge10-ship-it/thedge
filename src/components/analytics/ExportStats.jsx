import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Link2, ImageDown, Printer, Check, Loader2, Sparkles, Copy,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/notify';
import { T, SPRING } from '../../lib/theme';
import {
  METRICS, DEFAULT_METRICS, buildCard, renderCardSvg, svgToPng, download,
  saveCard,
} from '../../lib/statCard';

/* ==================================================================
   Експорт статистики.

   Зліва — вибір того, що показувати, справа — картка, яка
   перемальовується на кожен клік. Людина бачить результат до того,
   як натисне «зберегти», тому не треба експортувати тричі, щоб
   підібрати набір цифр.
================================================================== */

export default function ExportStats({ open, onClose, stats, period }) {
  const { user } = useAuth();

  const [picked, setPicked] = useState(DEFAULT_METRICS);
  /* Картка англійською — її показують у X і Discord, де українські
     підписи одразу звужують аудиторію до своїх */
  const [title, setTitle] = useState('Net Performance');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(null);   // 'link' | 'png' | null
  const [link, setLink] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  /* нове відкриття — чистий стан, щоб не тягнути минулий лінк */
  useEffect(() => { if (open) setLink(null); }, [open]);

  const card = useMemo(
    () => buildCard(stats, { title, period, metrics: picked, author }),
    [stats, title, period, picked, author],
  );

  const svg = useMemo(() => renderCardSvg(card), [card]);

  const toggle = (id) =>
    setPicked((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      /* вісім — стеля сітки на картці; далі цифри стають дрібними
         й постер перестає читатись з першого погляду */
      if (s.length >= 8) {
        notify.error('Максимум вісім', 'Постер має читатись за секунду, а не вивчатись.');
        return s;
      }
      return [...s, id];
    });

  /* ---------- дії ---------- */

  const makeLink = async () => {
    if (!user?.id) return;
    setBusy('link');
    try {
      const id = await saveCard(user.id, card);
      const url = `${window.location.origin}/shared/stats/${id}`;
      setLink(url);
      await navigator.clipboard.writeText(url);
      notify.success('Лінк готовий', 'Цифри в ньому заморожені — вони більше не зміняться.');
    } catch (e) {
      notify.error('Не вдалось створити лінк', e.message);
    } finally {
      setBusy(null);
    }
  };

  const savePng = async () => {
    setBusy('png');
    try {
      const blob = await svgToPng(svg, 2);
      download(blob, `edge-stats-${new Date().toISOString().slice(0, 10)}.png`);
      notify.success('Картинку збережено', '2400×1350 — вистачить для будь-якої соцмережі.');
    } catch {
      notify.error('Не вдалось зробити картинку', 'Спробуй ще раз або збережи як PDF.');
    } finally {
      setBusy(null);
    }
  };

  const savePdf = () => {
    /* Друк відкритої картки — найчесніший PDF без сторонніх бібліотек:
       браузер сам віддає вектор, тому цифри лишаються різкими. */
    const w = window.open('', '_blank');
    if (!w) { notify.error('Вікно заблоковано', 'Дозволь спливаючі вікна для цього сайту.'); return; }
    w.document.write(`<!doctype html><html><head><title>${card.title}</title>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Roboto:wght@400;700;800&display=swap">
      <style>
        @page { size: 1200px 675px; margin: 0; }
        html,body { margin:0; padding:0; background:#0A0A0C; }
        svg { display:block; width:100%; height:auto; }
      </style></head><body>${svg}</body></html>`);
    w.document.close();
    /* даємо шрифтам долетіти — інакше в друк піде системний Arial */
    setTimeout(() => { w.focus(); w.print(); }, 900);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
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
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.985 }}
            transition={SPRING}
            className="my-auto w-full max-w-[1120px] overflow-hidden rounded-3xl"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)',
            }}
          >
            {/* ─────────── Шапка ─────────── */}
            <div
              className="relative flex items-center gap-3.5 px-5 py-4 sm:px-6"
              style={{ borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})` }}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: `rgba(${T.accRgb},0.09)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
              >
                <Sparkles size={17} strokeWidth={2.1} style={{ color: T.acc }} />
              </span>
              <div className="min-w-0 pr-10">
                <div className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.acc }}>
                  Експорт
                </div>
                <h3 className="mt-0.5 text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                  Картка статистики
                </h3>
              </div>
              <button
                onClick={onClose}
                className="absolute right-5 top-4 grid h-9 w-9 place-items-center rounded-xl transition-colors duration-200"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text3; }}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>

            <div className="grid max-h-[70vh] grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_360px]">
              {/* ─────────── Прев'ю ─────────── */}
              <div className="order-1 p-5 sm:p-6 lg:order-none">
                <div
                  className="overflow-hidden rounded-2xl"
                  style={{ border: `1px solid ${T.line}`, boxShadow: '0 24px 60px -34px rgba(0,0,0,0.9)' }}
                >
                  {/* Картка вставлена інлайном, а не картинкою: так до неї
                      застосовується Space Grotesk, яким набрано логотип. */}
                  <div
                    className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </div>

                <p className="mt-3 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  1200×675 — формат, під який заточені превʼю в X, Telegram і Discord.
                </p>
              </div>

              {/* ─────────── Налаштування ─────────── */}
              <div
                className="order-2 flex flex-col gap-5 p-5 sm:p-6 lg:order-none"
                style={{ borderLeft: `1px solid ${T.line}` }}
              >
                <div>
                  <label
                    className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em]"
                    style={{ fontFamily: T.sans, color: T.text4 }}
                  >
                    Заголовок · англійською
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Net Performance"
                    className="h-[42px] w-full rounded-xl px-3.5 text-[14px] outline-none transition-colors duration-200"
                    style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em]"
                    style={{ fontFamily: T.sans, color: T.text4 }}
                  >
                    Підпис
                  </label>
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="нік або імʼя — необовʼязково"
                    className="h-[42px] w-full rounded-xl px-3.5 text-[14px] outline-none transition-colors duration-200"
                    style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                  />
                </div>

                <div className="min-h-0 flex-1">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span
                      className="text-[12px] font-bold uppercase tracking-[0.12em]"
                      style={{ fontFamily: T.sans, color: T.text4 }}
                    >
                      Показники
                    </span>
                    <span className="text-[12.5px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                      {picked.length} / 8
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {METRICS.map((m) => {
                      const on = picked.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggle(m.id)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200"
                          style={{
                            background: on ? `rgba(${T.accRgb},0.08)` : T.sunken,
                            border: `1px solid ${on ? T.lineAcc : T.line}`,
                          }}
                        >
                          <span
                            className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md transition-colors duration-200"
                            style={{
                              background: on ? T.acc : 'transparent',
                              border: `1px solid ${on ? T.acc : T.lineHi}`,
                            }}
                          >
                            {on && <Check size={11} strokeWidth={3.6} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className="block truncate text-[13.5px] font-semibold"
                              style={{ fontFamily: T.sans, color: on ? T.text : T.text2 }}
                            >
                              {m.label}
                            </span>
                            <span className="block truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                              {m.hint}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ─────────── Дії ─────────── */}
            <div
              className="flex flex-col gap-3 px-5 py-4 sm:px-6"
              style={{ borderTop: `1px solid ${T.line}`, background: T.surfaceHi }}
            >
              <AnimatePresence>
                {link && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                    style={{ background: T.sunken, border: `1px solid ${T.lineAcc}` }}
                  >
                    <Link2 size={14} strokeWidth={2.3} style={{ color: T.acc }} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-[13px]" style={{ fontFamily: T.mono, color: T.text2 }}>
                      {link}
                    </span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(link); notify.success('Скопійовано'); }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                      style={{ color: T.text3 }}
                    >
                      <Copy size={13} strokeWidth={2.4} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-wrap items-center gap-2.5">
                <span className="mr-auto hidden text-[12.5px] sm:block" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Посилання зберігає цифри такими, як зараз
                </span>

                <button
                  onClick={savePdf}
                  className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold transition-colors duration-200"
                  style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
                >
                  <Printer size={15} strokeWidth={2.2} />
                  PDF
                </button>

                <button
                  onClick={savePng}
                  disabled={busy === 'png'}
                  className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold transition-colors duration-200"
                  style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
                >
                  {busy === 'png'
                    ? <Loader2 size={15} className="animate-spin" />
                    : <ImageDown size={15} strokeWidth={2.2} />}
                  Картинка
                </button>

                <button
                  onClick={makeLink}
                  disabled={busy === 'link'}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 sm:flex-none"
                  style={{
                    background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
                    boxShadow: `0 8px 22px -10px rgba(${T.accRgb},0.7)`,
                    opacity: busy === 'link' ? 0.6 : 1,
                  }}
                >
                  {busy === 'link'
                    ? <Loader2 size={15} strokeWidth={3} className="animate-spin" />
                    : <Link2 size={15} strokeWidth={2.6} />}
                  Посилання
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
