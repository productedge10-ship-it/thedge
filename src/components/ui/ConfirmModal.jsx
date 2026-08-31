import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { T, EASE } from '../../lib/theme';

/* ==================================================================
   Підтвердження незворотної дії.

   Одне вікно на всі «точно видалити?»: раніше кожна сторінка ліпила
   своє, і вони розʼїжджались і за шириною, і за словами на кнопках.

   Дві речі, які вирішують, чи це вікно допомагає, чи заважає:

   • Кнопка називає дію, а не відповідь. «Так» і «Ні» змушують
     перечитати питання, щоб зрозуміти, на що ти тиснеш; «Видалити»
     говорить саме за себе.
   • Небезпечна кнопка не є типовою. Esc і клік повз вікно закривають
     його без наслідків, а Enter нічого не підтверджує — випадкове
     натискання не має нічого стирати.
================================================================== */

export default function ConfirmModal({
  open,
  title,
  text,
  detail,
  confirmLabel = 'Видалити',
  cancelLabel = 'Скасувати',
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const tone = danger ? T.bad : T.acc;
  const toneRgb = danger ? T.badRgb : T.accRgb;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 sm:p-6"
      style={{ background: 'rgba(8,8,11,0.78)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        transition={{ duration: 0.26, ease: EASE }}
        /* 520px, а не «маленьке віконце»: на великому екрані вузька
           картка виглядає як системний алерт із чужої операційки. */
        className="w-full"
        style={{
          maxWidth: 520,
          borderRadius: 20,
          background: T.surface,
          border: `1px solid ${T.line}`,
          boxShadow: '0 40px 100px -34px rgba(0,0,0,0.92)',
        }}
      >
        <div style={{ padding: '30px 32px 24px' }}>
          <span
            className="grid place-items-center"
            style={{
              width: 52, height: 52, borderRadius: 15,
              background: `rgba(${toneRgb},0.10)`,
              border: `1px solid rgba(${toneRgb},0.26)`,
              color: tone,
            }}
          >
            <AlertTriangle size={22} strokeWidth={1.9} />
          </span>

          <h2
            style={{
              fontFamily: T.display, marginTop: 20, fontSize: 22,
              fontWeight: 600, letterSpacing: '-0.3px', color: T.text,
            }}
          >
            {title}
          </h2>

          {text && (
            <p style={{ fontFamily: T.sans, marginTop: 10, fontSize: 15.5, lineHeight: '25px', color: T.text2 }}>
              {text}
            </p>
          )}

          {/* Що саме зникне. Без цього рядка людина підтверджує
              видалення «чогось», а не конкретного запису. */}
          {detail && (
            <div
              style={{
                marginTop: 16, padding: '14px 16px', borderRadius: 13,
                background: T.sunken, border: `1px solid ${T.line}`,
              }}
            >
              <p
                className="whitespace-pre-wrap"
                style={{ fontFamily: T.sans, fontSize: 15, lineHeight: '24px', color: T.text }}
              >
                {detail}
              </p>
            </div>
          )}
        </div>

        <div
          className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
          style={{ padding: '18px 24px', background: T.sunken, borderTop: `1px solid ${T.line}` }}
        >
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              fontFamily: T.sans, height: 48, padding: '0 24px', borderRadius: 13,
              border: `1px solid ${T.line}`, color: T.text2,
              fontSize: 15, fontWeight: 500, transition: 'all .18s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center justify-center"
            style={{
              fontFamily: T.sans, gap: 9, height: 48, padding: '0 26px', borderRadius: 13,
              background: tone, color: 'var(--edge-bg, #0A0A0C)',
              fontSize: 15, fontWeight: 600, transition: 'all .18s',
              opacity: busy ? 0.6 : 1,
              cursor: busy ? 'default' : 'pointer',
              boxShadow: `0 14px 32px -16px rgba(${toneRgb},0.9)`,
            }}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
