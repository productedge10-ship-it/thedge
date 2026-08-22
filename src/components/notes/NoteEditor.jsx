import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import {
  X, ImagePlus, Link2, Calendar, Check, Loader2, Maximize2, Folder,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { notify } from '../../utils/notify';
import { uploadImage, uploadDataUrl, isHttpUrl, isDataUrl } from '../../lib/imageStore';
import { uid } from '../../lib/notesStore';
import TagPicker, { TagChip } from './TagPicker';

/* ==================================================================
   Редактор нотатки.

   Порядок полів = порядок думки: спершу пишеш, потім показуєш, потім
   позначаєш. Тому графіки стоять одразу під текстом, а не в кінці
   серед службових полів — до нотатки трейдера картинка належить так
   само, як і слова.

   Зона графіків зроблена як у TDA і навмисно тим самим жестом:
   Ctrl+V, перетягування, клік. Людина, яка навчилась вставляти
   графік у план, не має вчитись цього вдруге в нотатках.

   Головна відмінність від TDA: там дозволено тільки посилання, бо
   план з десятком блоків завантажувався б хвилину. Тут скрін з
   буфера і файл теж потрібні — і саме вони йдуть через стиснення в
   сховище, а не в базу рядком.
================================================================== */

const MAX_IMAGES = 8;

export default function NoteEditor({
  initial, tree, folders = [], userId, onTreeChange, onCancel, onSave, onImage,
}) {
  const [form, setForm] = useState(initial);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(0);
  const [linkOpen, setLinkOpen] = useState(!!initial.chart_link);

  const fileRef = useRef(null);
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
    /* Чуже посилання лишаємо як є: воно вже десь лежить, важить
       нуль і вантажиться швидше за будь-яку нашу копію. */
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

  /* ------------------------------------------------------------------
     Збереження.

     Старі нотатки містять base64 у полі images — вони писались до
     того, як з'явилось сховище. Переносимо їх мовчки й тільки при
     збереженні: окрема кнопка «мігрувати» вимагала б від людини
     розуміти, що взагалі відбувається з її картинками.
  ------------------------------------------------------------------ */
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving || busy) return;
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

  const canSave = (form.title.trim() || form.description.trim()) && !busy && !saving;
  const images = form.images || [];
  const empty = !images.length && !busy;

  /* ================================================================ */

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onCancel}
      className="fixed inset-0 z-[210] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
        className="my-auto w-full max-w-[780px] overflow-hidden rounded-3xl"
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)',
        }}
      >
        {/* ─── шапка ─── */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-7"
          style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {form.id ? 'Редагування' : 'Нова нотатка'}
            </span>
            <AnimatePresence>
              {busy > 0 && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold"
                  style={{ fontFamily: T.sans, color: T.acc }}
                >
                  <Loader2 size={12} strokeWidth={2.8} className="animate-spin" />
                  стискаю {busy}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={onCancel}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-7">
          {/* ─── заголовок ─── */}
          <input
            autoFocus
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Про що ця нотатка?"
            className="w-full border-none bg-transparent outline-none"
            style={{
              fontFamily: T.display,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: T.text,
            }}
          />
          <div className="mt-3 h-px w-full" style={{ background: T.line }} />

          {/* ─── текст ───
              Без рамки й без сірої підкладки: підкладка перетворювала
              головне поле вікна на службове, а рамка ще й обводила
              його як форму. Лишається курсор і місце під слова. */}
          <TextareaAutosize
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Пиши як думаєш. Ctrl+V вставить скрін або лінк на графік прямо сюди."
            minRows={5}
            spellCheck={false}
            className="mt-4 w-full resize-none border-none bg-transparent outline-none"
            style={{ fontFamily: T.sans, fontSize: 16, lineHeight: 1.8, color: T.text }}
          />

          {/* ─── графіки ───
              Висота їде плавно з порожньої зони в сітку, як у TDA:
              картка не стрибає, коли перший скрін нарешті долетів. */}
          <motion.div
            layout
            transition={{ duration: 0.35, ease: EASE }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
            onDrop={onDrop}
            className="mt-6 overflow-hidden rounded-2xl transition-colors duration-300"
            style={{
              background: drag ? `rgba(${T.accRgb},0.05)` : T.sunken,
              border: `1px ${empty ? 'dashed' : 'solid'} ${drag ? T.acc : empty ? T.lineHi : T.line}`,
            }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {empty ? (
                <motion.button
                  key="drop"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.985 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2.5 px-6 py-9"
                >
                  <motion.span
                    animate={drag ? { scale: 1.12, y: -2 } : { scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                    className="flex"
                  >
                    <ImagePlus
                      size={26}
                      strokeWidth={1.6}
                      style={{ color: drag ? T.acc : T.text4, transition: 'color .3s' }}
                    />
                  </motion.span>
                  <span
                    className="text-[14.5px] font-semibold transition-colors duration-300"
                    style={{ fontFamily: T.sans, color: drag ? T.acc : T.text3 }}
                  >
                    {drag ? 'Відпусти — заберемо' : 'Скрін, файл або лінк на графік'}
                  </span>
                  <span className="text-[12.5px] font-medium" style={{ fontFamily: T.sans, color: T.text4 }}>
                    Ctrl+V · перетягни · клікни щоб вибрати
                  </span>
                </motion.button>
              ) : (
                <motion.div
                  key="grid"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="flex flex-wrap gap-2.5 p-2.5"
                >
                  {images.map((src, i) => (
                    <motion.div
                      key={src}
                      layout
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ duration: 0.26, ease: EASE }}
                      className="group/img relative h-[104px] w-[156px] overflow-hidden rounded-xl"
                      style={{ border: `1px solid ${T.line}`, background: T.surface }}
                    >
                      <img
                        src={src}
                        alt=""
                        onClick={() => onImage(src)}
                        className="h-full w-full cursor-zoom-in object-cover transition-transform duration-500 group-hover/img:scale-[1.06]"
                      />
                      {/* Кнопки з'являються поверх затемнення — на
                          світлому графіку білу іконку інакше не видно */}
                      <div
                        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/img:opacity-100"
                        style={{ background: 'linear-gradient(180deg, rgba(6,6,8,0.55), transparent 55%)' }}
                      />
                      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity duration-200 group-hover/img:opacity-100">
                        <button
                          onClick={() => onImage(src)}
                          title="На весь екран"
                          className="grid h-7 w-7 place-items-center rounded-lg transition-colors"
                          style={{ background: 'rgba(10,10,12,0.86)', border: `1px solid ${T.line}`, color: T.text2, backdropFilter: 'blur(8px)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = T.text2)}
                        >
                          <Maximize2 size={12} strokeWidth={2.4} />
                        </button>
                        <button
                          onClick={() => patch({ images: images.filter((_, j) => j !== i) })}
                          title="Прибрати"
                          className="grid h-7 w-7 place-items-center rounded-lg transition-colors"
                          style={{ background: 'rgba(10,10,12,0.86)', border: `1px solid ${T.line}`, color: T.text2, backdropFilter: 'blur(8px)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.45)`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
                        >
                          <X size={12} strokeWidth={2.8} />
                        </button>
                      </div>
                    </motion.div>
                  ))}

                  {/* місця, що вже їдуть */}
                  {Array.from({ length: busy }).map((_, i) => (
                    <motion.div
                      key={`busy-${i}`}
                      layout
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      className="grid h-[104px] w-[156px] place-items-center rounded-xl"
                      style={{ border: `1px dashed ${T.lineHi}`, background: T.surface }}
                    >
                      <Loader2 size={17} strokeWidth={2.4} className="animate-spin" style={{ color: T.acc }} />
                    </motion.div>
                  ))}

                  {images.length + busy < MAX_IMAGES && (
                    <motion.button
                      layout
                      onClick={() => fileRef.current?.click()}
                      className="group/add grid h-[104px] w-[156px] place-items-center rounded-xl transition-colors duration-300"
                      style={{ border: `1px dashed ${drag ? T.acc : T.lineHi}`, color: drag ? T.acc : T.text4 }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.acc; e.currentTarget.style.color = T.acc; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = drag ? T.acc : T.lineHi; e.currentTarget.style.color = drag ? T.acc : T.text4; }}
                    >
                      <ImagePlus size={19} strokeWidth={1.9} className="transition-transform duration-300 group-hover/add:scale-110" />
                    </motion.button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { takeFiles(e.target.files); e.target.value = ''; }}
          />

          {/* ─── теги ─── */}
          <div className="mt-7">
            <p className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Теги
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(form.tags || []).map((t) => (
                <TagChip key={t} id={t} tree={tree} showPath onRemove={(id) => patch({ tags: form.tags.filter((x) => x !== id) })} />
              ))}
              <TagPicker
                multi
                tree={tree}
                onTreeChange={onTreeChange}
                value={form.tags || []}
                onChange={(tags) => patch({ tags })}
                label={(form.tags || []).length ? 'Ще тег' : 'Додати тег'}
                width={320}
              />
            </div>
          </div>

          {/* ─── папка ───
              Показується тільки коли папки заведені: інакше це поле
              про механізм, якого людина ще не бачила. */}
          {folders.length > 0 && (
            <div className="mt-6">
              <p className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                <Folder size={12} strokeWidth={2.4} />
                Папка
              </p>
              <div className="flex flex-wrap gap-2">
                {[{ id: null, name: 'Без папки', color: T.text4 }, ...folders].map((f) => {
                  const on = (form.folder_id || null) === f.id;
                  return (
                    <button
                      key={f.id || 'none'}
                      onClick={() => patch({ folder_id: f.id })}
                      className="flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold transition-colors"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `${f.color}1f` : T.sunken,
                        border: `1px solid ${on ? f.color : T.line}`,
                        color: on ? T.text : T.text3,
                      }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.color }} />
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── тиха смуга: дата · посилання ───
              Раніше тут стояло три ряди контролів, з яких два були
              про картинки. Тепер картинки живуть вище своєю зоною, і
              внизу лишається те, що справді службове.

              Поле посилання згорнуте: воно потрібне рідко, а місце
              під заголовком забирало щоразу. */}
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <label
              className="flex h-11 items-center gap-2.5 rounded-xl px-3.5"
              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            >
              <Calendar size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
              <input
                type="date"
                value={form.session_date}
                onChange={(e) => patch({ session_date: e.target.value })}
                className="bg-transparent text-[14px] outline-none"
                style={{ fontFamily: T.sans, color: T.text2, colorScheme: 'dark' }}
              />
            </label>

            {linkOpen ? (
              <div
                className="flex h-11 min-w-[220px] flex-1 items-center gap-2.5 rounded-xl px-3.5"
                style={{ background: T.sunken, border: `1px solid ${T.line}` }}
              >
                <Link2 size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
                <input
                  value={form.chart_link}
                  onChange={(e) => patch({ chart_link: e.target.value })}
                  placeholder="Посилання на джерело"
                  className="w-full bg-transparent text-[14px] outline-none"
                  style={{ fontFamily: T.sans, color: T.text }}
                />
                {!form.chart_link && (
                  <button onClick={() => setLinkOpen(false)} style={{ color: T.text4 }}>
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setLinkOpen(true)}
                className="flex h-11 items-center gap-2.5 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors"
                style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.lineHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
              >
                <Link2 size={15} strokeWidth={2.2} />
                Посилання
              </button>
            )}
          </div>
        </div>

        {/* ─── дії ─── */}
        <div
          className="flex items-center justify-between gap-2.5 px-5 py-4 sm:px-8"
          style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}
        >
          <span className="hidden text-[12.5px] sm:block" style={{ fontFamily: T.sans, color: T.text4 }}>
            {images.length > 0 ? `${images.length} з ${MAX_IMAGES} зображень` : ''}
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              onClick={onCancel}
              className="h-11 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-colors"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text2)}
            >
              Скасувати
            </button>
            <button
              onClick={submit}
              disabled={!canSave}
              className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-transform active:scale-[0.98]"
              style={{
                background: T.acc,
                color: 'var(--edge-on-acc, #0A0A0C)',
                fontFamily: T.sans,
                opacity: canSave ? 1 : 0.4,
                cursor: canSave ? 'pointer' : 'not-allowed',
                boxShadow: canSave ? `0 6px 20px -6px rgba(${T.accRgb},0.55)` : 'none',
              }}
            >
              {saving
                ? <Loader2 size={15} strokeWidth={3} className="shrink-0 animate-spin" />
                : <Check size={15} strokeWidth={3} className="shrink-0" />}
              {form.id ? 'Зберегти' : 'Створити'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
