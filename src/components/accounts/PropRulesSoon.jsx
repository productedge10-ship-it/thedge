import { FileCheck2, Bell, Newspaper, BookOpen } from 'lucide-react';
import { T } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import PageHeader from '../ui/PageHeader';

/* ==================================================================
   «Правила пропа» — скоро.

   Заглушка, поки монітор не наповнений: сторінка вже в меню, а даних
   ще немає. Нескінченна анімація — «ми скануємо правила»: кільця від
   іконки й рядок-скан, що біжить по рядках-заглушках. Без градієнтів,
   лише один акцентний колір.
   Вимкнути заглушку: VITE_PROP_RULES_LIVE=1 (або ?live=1 в адресі —
   подивитись справжню сторінку до релізу).
================================================================== */

const CSS = `
@keyframes prs-ring { 0% { transform: scale(0.55); opacity: 0.55; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes prs-scan { 0% { transform: translateY(-10px); opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translateY(168px); opacity: 0; } }
@keyframes prs-row { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.8; } }
@keyframes prs-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
.prs-ring { animation: prs-ring 3.2s cubic-bezier(0.2, 0.6, 0.3, 1) infinite; }
.prs-scan { animation: prs-scan 3.6s ease-in-out infinite; }
.prs-row { animation: prs-row 3.6s ease-in-out infinite; }
.prs-blink { animation: prs-blink 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .prs-ring, .prs-scan, .prs-row, .prs-blink { animation-duration: 9s; } }
`;

const ROWS = [0.78, 0.52, 0.9, 0.64, 0.7, 0.45];

export default function PropRulesSoon() {
  const points = [
    [BookOpen, tx('Правила простою мовою', 'Rules in plain language'), tx('Ліміти, новини, вихідні — без юридичної мови', 'Limits, news, weekends — no legalese')],
    [Bell, tx('Сповіщення про зміни', 'Change alerts'), tx('Проп змінив правила — ти дізнаєшся першим', 'Your prop changed its rules — you hear first')],
    [Newspaper, tx('Червоні новини твого пропа', 'Red news for your prop'), tx('Нагадаємо вийти з позиції до заборонених новин', 'We will remind you to close before restricted news')],
  ];

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
      <style>{CSS}</style>
      <PageHeader kicker={tx('Рахунки', 'Accounts')} title={tx('Правила мого пропа', 'My prop rules')} />

      <div className="grid items-center gap-6 rounded-3xl p-6 sm:p-9 md:grid-cols-[minmax(0,1fr)_320px]" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.acc, background: `rgba(${T.accRgb},0.10)`, border: `1px solid rgba(${T.accRgb},0.32)` }}>
            <span className="prs-blink h-1.5 w-1.5 rounded-full" style={{ background: T.acc }} />
            {tx('Готуємо', 'In the works')}
          </div>
          <h2 className="m-0 mt-4 text-[34px] font-bold leading-[1.05] sm:text-[46px]" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}>
            Coming Soon
          </h2>
          <p className="m-0 mt-3 max-w-[520px] text-[15px] leading-[1.6]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {tx('Ми збираємо правила пропфірм, розкладаємо їх простою мовою і стежимо за змінами щодня. Почнемо з FTMO.', 'We are collecting prop firm rules, laying them out in plain language and watching for changes every day. Starting with FTMO.')}
          </p>

          <div className="mt-6 grid gap-2.5">
            {points.map(([Icon, title, sub]) => (
              <div key={title} className="flex items-start gap-3 rounded-xl px-3.5 py-3" style={{ background: 'var(--edge-sunken)' }}>
                <Icon size={18} style={{ color: T.acc, marginTop: 2 }} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>{title}</div>
                  <div className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Живий «скан» правил */}
        <div className="relative mx-auto w-full max-w-[320px]" aria-hidden="true">
          <div className="relative mx-auto grid h-[96px] w-[96px] place-items-center">
            {[0, 1.07, 2.14].map((d) => (
              <span key={d} className="prs-ring absolute inset-0 rounded-full" style={{ border: `1.5px solid ${T.acc}`, animationDelay: `${d}s` }} />
            ))}
            <span className="relative grid h-[64px] w-[64px] place-items-center rounded-2xl" style={{ background: `rgba(${T.accRgb},0.12)`, border: `1px solid rgba(${T.accRgb},0.4)` }}>
              <FileCheck2 size={28} style={{ color: T.acc }} />
            </span>
          </div>

          <div className="relative mt-7 overflow-hidden rounded-2xl p-4" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
            <div className="grid gap-3.5">
              {ROWS.map((w, i) => (
                <div key={i} className="prs-row flex items-center gap-2.5" style={{ animationDelay: `${i * 0.28}s` }}>
                  <span className="h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: `rgba(${T.accRgb},0.35)` }} />
                  <span className="h-2.5 rounded-full" style={{ width: `${w * 100}%`, background: 'rgba(255,255,255,0.12)' }} />
                </div>
              ))}
            </div>
            <span className="prs-scan pointer-events-none absolute left-3 right-3 top-3 h-[2px] rounded-full" style={{ background: T.acc, boxShadow: `0 0 12px rgba(${T.accRgb},0.7)` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
