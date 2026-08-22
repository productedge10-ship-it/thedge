import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Pencil, Trash2, ExternalLink, Calendar, Archive, ArchiveRestore,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { TagChip } from './TagPicker';

/* ==================================================================
   Читалка нотатки.
   Модалка навмисно поводиться як окрема чиста сторінка: вузька
   колонка тексту, велика типографіка, нічого зайвого по краях.
   Керування зверху — тихе, зʼявляється, коли треба.
================================================================== */

export default function NoteReader({
  note, tree, fmtDate, folders = [], onClose, onEdit, onDelete, onArchive,
  onMove, onTagClick, onImage,
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!note) return null;
  const images = (note.images || []).filter((x) => typeof x === 'string');

  const IconBtn = ({ icon: Icon, label, onClick, danger }) => (
    <button
      onClick={onClick}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 active:scale-95"
      style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? `rgba(${T.badRgb},0.10)` : T.surfaceHi;
        e.currentTarget.style.borderColor = danger ? `rgba(${T.badRgb},0.35)` : T.lineHi;
        e.currentTarget.style.color = danger ? T.bad : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = T.surface;
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.color = T.text2;
      }}
    >
      <Icon size={15} strokeWidth={2.2} />
    </button>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.article
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-[860px] overflow-hidden rounded-3xl"
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)',
        }}
      >
        {/* тиха шапка */}
        <div
          className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5 sm:px-7"
          style={{
            borderBottom: `1px solid ${T.line}`,
            background: 'rgba(19,19,22,0.92)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <Calendar size={14} strokeWidth={2.2} style={{ color: T.text4 }} />
          <span className="text-[13.5px] font-medium" style={{ fontFamily: T.sans, color: T.text3 }}>
            {fmtDate(note.created_at)}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onEdit}
              className="flex h-9 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] font-semibold transition-all duration-200 active:scale-95"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
            >
              <Pencil size={14} strokeWidth={2.2} />
              Редагувати
            </button>
            {onArchive && (
              <IconBtn
                icon={note.archived ? ArchiveRestore : Archive}
                label={note.archived ? 'Повернути зі стрічки' : 'В архів'}
                onClick={onArchive}
              />
            )}
            <IconBtn icon={Trash2} label="Видалити" onClick={onDelete} danger />
            <IconBtn icon={X} label="Закрити (Esc)" onClick={onClose} />
          </div>
        </div>

        {/* сторінка */}
        <div className="px-5 pb-14 pt-9 sm:px-10 sm:pt-12">
          <div className="mx-auto w-full" style={{ maxWidth: 660 }}>
            <h1
              className="text-[30px] font-bold leading-[1.2] sm:text-[36px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}
            >
              {note.title}
            </h1>

            {(note.tags || []).length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {note.tags.map((t) => (
                  <TagChip key={t} id={t} tree={tree} showPath onClick={() => onTagClick(t)} />
                ))}
              </div>
            )}

            {/* Перекласти на іншу полицю — прямо звідси. Заходити для
                цього в редагування означало б відкривати форму зміни
                тексту заради того, щоб текст не чіпати. */}
            {onMove && folders.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Папка
                </span>
                {[{ id: null, name: 'Без папки', color: T.text4 }, ...folders].map((f) => {
                  const on = (note.folder_id || null) === f.id;
                  return (
                    <button
                      key={f.id || 'none'}
                      onClick={() => onMove(f.id)}
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `${f.color}1f` : 'transparent',
                        border: `1px solid ${on ? f.color : T.line}`,
                        color: on ? T.text : T.text3,
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.color }} />
                      {f.name}
                    </button>
                  );
                })}
              </div>
            )}

            {note.description && (
              <div
                className="mt-8 whitespace-pre-wrap"
                style={{
                  fontFamily: T.sans,
                  fontSize: 17,
                  lineHeight: 1.85,
                  color: '#E4E4E9',
                  letterSpacing: '0.003em',
                }}
              >
                {note.description}
              </div>
            )}

            {images.length > 0 && (
              <div className="mt-9 flex flex-col gap-4">
                {images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    onClick={() => onImage(src)}
                    className="w-full cursor-zoom-in rounded-2xl transition-transform duration-300 hover:scale-[1.01]"
                    style={{ border: `1px solid ${T.line}`, display: 'block' }}
                  />
                ))}
              </div>
            )}

            {note.chart_link && (
              <div className="mt-10 pt-7" style={{ borderTop: `1px solid ${T.line}` }}>
                <a
                  href={note.chart_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center gap-2.5 rounded-xl px-4 text-[14px] font-semibold transition-all duration-200"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
                >
                  <ExternalLink size={15} strokeWidth={2.2} style={{ color: T.acc }} />
                  Відкрити посилання
                </a>
              </div>
            )}
          </div>
        </div>
      </motion.article>
    </motion.div>
  );
}
