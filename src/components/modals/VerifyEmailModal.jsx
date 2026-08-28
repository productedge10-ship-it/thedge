import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MailCheck, X, Loader2, Check, ShieldAlert } from 'lucide-react';

import { T, SPRING } from '../../lib/theme';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/notify';
import { OPEN_EVENT } from '../../lib/emailGate';

/* ==================================================================
   Підтвердження пошти.

   Правила, за якими це зроблено:

   • Не двері, а нагадування. Людина заходить у застосунок і працює;
     підтвердження потрібне лише для дій, що створюють дані. Замкнені
     двері на першому екрані втрачають більше людей, ніж дає перевірка.
   • Закрити можна завжди — але модалка повертається наступного сеансу.
     Один сеанс тиші, не вічний.
   • Кулдаун показуємо цифрами. Supabase все одно не дасть слати
     частіше ніж раз на хвилину, і мовчазна кнопка, яка «не працює»,
     виглядає як поломка.
================================================================== */

/* Пауза між листами. Supabase тримає свій ліміт на сервері (поле
   «Minimum interval per user» у SMTP-налаштуваннях) — це лише чесний
   відлік для очей, щоб кнопка не здавалась зламаною. */
const COOLDOWN = 60;

/* Ключ обовʼязково з id користувача. Зі спільним ключем закрите
   «пізніше» переживало вихід і вхід під іншим акаунтом: sessionStorage
   тримається за вкладку, а не за сесію Supabase, і новий користувач
   успадковував чуже рішення разом із тишею замість нагадування. */
const dismissKey = (id) => `edge:verify-email:dismissed:${id}`;

export default function VerifyEmailModal() {
  const { user, emailVerified, refreshProfile, sendVerification } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [left, setLeft] = useState(0);
  const timer = useRef(null);

  /* Повернення з листа. Параметр ?verified=1 — лише натяк від сервера,
     а не доказ: його може дописати будь-хто в адресному рядку. Тому
     спершу перечитуємо профіль і повідомляємо про успіх тільки якщо
     прапорець справді стоїть у базі. Інакше застосунок радісно вітав
     би з підтвердженням, якого не було. */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('verified');
    if (!status) return;

    let alive = true;

    (async () => {
      if (status === '1') {
        const fresh = await refreshProfile();
        if (!alive) return;

        if (fresh?.email_verified) {
          if (user?.id) sessionStorage.removeItem(dismissKey(user.id));
          notify.success('Пошту підтверджено', 'Тепер доступні всі можливості.');
        } else {
          notify.error('Не вдалось підтвердити', 'Спробуйте ще раз — надішліть новий лист.');
        }
      } else {
        notify.error('Не вдалось підтвердити', 'Посилання застаріле або вже використане. Надішліть нове.');
      }
    })();

    params.delete('verified');
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true });

    return () => { alive = false; };
  }, [location.search, location.pathname, navigate, refreshProfile, user?.id]);

  /* emailVerified === undefined означає «ще не знаємо» — у цей момент
     показувати нічого не можна, інакше модалка блимне й тому, хто
     давно підтвердив. */
  useEffect(() => {
    if (emailVerified !== false || !user?.id) { setOpen(false); return undefined; }
    if (sessionStorage.getItem(dismissKey(user.id))) return undefined;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [emailVerified, user?.id]);

  /* Відкриття ззовні — коли натиснули заблоковану кнопку або пункт у
     налаштуваннях. Тут «Пізніше» не враховуємо: людина щойно попросила
     дію сама, і ховати відповідь через давнє закриття було б дивно. */
  useEffect(() => {
    const onOpen = () => { if (emailVerified === false) setOpen(true); };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [emailVerified]);

  useEffect(() => () => clearInterval(timer.current), []);

  const startCooldown = useCallback(() => {
    setLeft(COOLDOWN);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) { clearInterval(timer.current); return 0; }
        return v - 1;
      });
    }, 1000);
  }, []);

  const send = async () => {
    setSending(true);
    try {
      const { error } = await sendVerification();
      if (error) throw error;
      setSent(true);
      startCooldown();
    } catch (e) {
      /* Найчастіша помилка тут — саме ліміт Supabase. Показати сирий
         англійський текст означало б злякати людину без потреби. */
      const raw = String(e?.message || '');
      const seconds = raw.match(/after (\d+) seconds?/i)?.[1];
      if (seconds) {
        startCooldown();
        notify.error('Зачекайте трохи', `Наступний лист можна надіслати через ${seconds} с.`);
      } else {
        notify.error('Не вдалось надіслати', raw || 'Спробуйте ще раз за хвилину.');
      }
    } finally {
      setSending(false);
    }
  };

  const dismiss = () => {
    if (user?.id) sessionStorage.setItem(dismissKey(user.id), '1');
    setOpen(false);
  };

  if (!user) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}
          className="fixed inset-0 z-[350] flex items-center justify-center p-4"
          style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(12px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={SPRING}
            className="relative w-full max-w-[440px] overflow-hidden rounded-3xl"
            style={{
              background: T.bg,
              border: `1px solid ${T.line}`,
              boxShadow: '0 50px 120px -40px rgba(0,0,0,0.98)',
            }}
          >
            {/* Акцентна риска згори — той самий прийом, що в решті вікон */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, rgba(${T.accRgb},0.7), transparent)` }}
            />

            <button
              onClick={dismiss}
              aria-label="Закрити"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl transition-colors"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.surfaceHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = T.surface; }}
            >
              <X size={16} strokeWidth={2.4} />
            </button>

            <div className="flex flex-col items-center px-7 pb-7 pt-9 text-center">
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl"
                style={{
                  background: sent ? `rgba(${T.okRgb},0.12)` : `rgba(${T.accRgb},0.12)`,
                  border: `1px solid ${sent ? `rgba(${T.okRgb},0.3)` : `rgba(${T.accRgb},0.3)`}`,
                }}
              >
                {sent
                  ? <Check size={24} strokeWidth={2.4} style={{ color: T.ok }} />
                  : <MailCheck size={24} strokeWidth={2} style={{ color: T.acc }} />}
              </span>

              <h2
                className="mt-5 text-[22px] font-bold"
                style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
              >
                {sent ? 'Лист надіслано' : 'Підтвердіть пошту'}
              </h2>

              <p className="mt-2.5 text-[14px] leading-relaxed" style={{ fontFamily: T.sans, color: T.text2 }}>
                {sent ? (
                  <>
                    Перевірте <b style={{ color: T.text }}>{user.email}</b> — усередині посилання
                    на підтвердження. Якщо листа немає, зазирніть у теку «Спам».
                  </>
                ) : (
                  <>
                    Надішлемо посилання на <b style={{ color: T.text }}>{user.email}</b>.
                    Один клік — і все готово.
                  </>
                )}
              </p>

              {!sent && (
                <div
                  className="mt-5 flex w-full items-start gap-3 rounded-2xl px-4 py-3.5 text-left"
                  style={{ background: T.surface, border: `1px solid ${T.line}` }}
                >
                  <ShieldAlert size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: T.acc }} />
                  <p className="text-[13px] leading-relaxed" style={{ fontFamily: T.sans, color: T.text2 }}>
                    Поки пошта не підтверджена, не вийде створювати акаунти й записувати угоди.
                    Решта застосунку працює як зазвичай.
                  </p>
                </div>
              )}

              <button
                onClick={send}
                disabled={sending || left > 0}
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14.5px] font-bold transition-colors disabled:cursor-not-allowed"
                style={{
                  fontFamily: T.sans,
                  background: left > 0 ? T.surfaceHi : T.acc,
                  color: left > 0 ? T.text3 : 'var(--edge-bg, #0A0A0C)',
                  boxShadow: left > 0 ? 'none' : `0 12px 30px -12px rgba(${T.accRgb},0.8)`,
                }}
              >
                {sending && <Loader2 size={16} className="animate-spin" />}
                {left > 0
                  ? `Надіслати ще раз — ${left} с`
                  : sending
                    ? 'Надсилаємо…'
                    : sent ? 'Надіслати ще раз' : 'Надіслати посилання'}
              </button>

              <button
                onClick={dismiss}
                className="mt-3 text-[13px] font-semibold transition-colors"
                style={{ fontFamily: T.sans, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
              >
                Пізніше
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
