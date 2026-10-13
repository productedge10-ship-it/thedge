import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, X } from 'lucide-react';
import { T } from '../../lib/theme';
import { t as tx } from '../../lib/lang';

/* ==================================================================
   Тимчасове повідомлення про збій автоімпорту.

   Показується один раз кожному, хто заходить у застосунок, до UNTIL.
   Після цієї хвилини зникає саме — прибирати з коду можна будь-коли.
   Щоб показати нове повідомлення, зміни ID (тоді його побачать і ті,
   хто закрив попереднє).
================================================================== */
const ID = 'autoimport-2026-10-13';
const UNTIL = new Date('2026-10-13T13:00:00+03:00'); // 13:00 за Києвом
const KEY = `edge-notice-${ID}`;

export default function MaintenanceNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (Date.now() >= UNTIL.getTime()) return;
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* приватний режим */ }
    if (!seen) setOpen(true);
    const t = setTimeout(() => setOpen(false), Math.max(0, UNTIL.getTime() - Date.now()));
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* ок */ }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: 'rgba(5,5,10,0.6)', backdropFilter: 'blur(4px)' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[420px] rounded-2xl p-6"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 40px 90px -30px rgba(0,0,0,0.9)', animation: 'edgeNoticeIn .2s ease-out' }}
      >
        <style>{'@keyframes edgeNoticeIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}'}</style>
        <button type="button" onClick={close} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5" style={{ color: T.text3 }} aria-label={tx('Закрити', 'Close')}>
          <X size={17} />
        </button>
        <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: 'rgba(240,176,74,0.14)', color: '#f0b04a' }}>
          <Wrench size={20} />
        </div>
        <h2 className="mt-4 text-[18px] font-bold leading-snug" style={{ color: T.text }}>
          {tx('Автоімпорт MT5 тимчасово не працює', 'MT5 auto-import is temporarily down')}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: T.text2 }}>
          {tx(
            'Сьогодні проводимо технічні роботи на сервері. Нові угоди з MetaTrader почнуть підтягуватись знову до 13:00 за Києвом — усе, що ти наторгуєш за цей час, підтягнеться автоматично.',
            'We are doing server maintenance today. New MetaTrader trades will start syncing again by 13:00 Kyiv time — everything you trade meanwhile will be imported automatically.',
          )}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: T.text2 }}>
          {tx('Журнал, аналітика й бектести працюють як завжди. Перепрошуємо за незручності.', 'The journal, analytics and backtests work as usual. Sorry for the inconvenience.')}
        </p>
        <button
          type="button"
          onClick={close}
          className="mt-5 w-full rounded-xl py-2.5 text-[14px] font-semibold"
          style={{ background: '#5b4bf5', color: '#fff' }}
        >
          {tx('Зрозуміло', 'Got it')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
