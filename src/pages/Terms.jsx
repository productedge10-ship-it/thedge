import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { T, useEdgeFonts } from '../lib/theme';
import { TERMS, TERMS_VERSION, OWNER } from '../lib/terms';

/* ==================================================================
   Умови користування.

   Публічна сторінка без входу: на неї посилаються і форма реєстрації,
   і футер, і людина, яка ще нічого не вирішила.

   Верстка тут одна колонка й бічний навігатор — той самий прийом, що
   в шерингу плану. Юридичний текст читають не підряд, а шукаючи свій
   абзац: «а що там про повернення грошей». Список розділів, який
   видно завжди, відповідає на це швидше за будь-який пошук по
   сторінці.
================================================================== */

export default function Terms() {
  useEdgeFonts();
  const [active, setActive] = useState(TERMS[0].id);

  const ids = useMemo(() => TERMS.map((s) => s.id), []);

  /* Підсвічування поточного розділу. IntersectionObserver, а не
     розрахунок на кожен скрол: другий варіант рахує геометрію
     п'ятнадцяти секцій шістдесят разів на секунду заради одного
     підсвіченого рядка. */
  useEffect(() => {
    const seen = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.intersectionRatio));
        const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) setActive(best[0]);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: [0, 0.25, 0.6, 1] },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.text }}>
      <div className="mx-auto w-[92%] max-w-[1120px] pb-28 pt-8 lg:pt-12">

        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-[13.5px] font-semibold transition-colors duration-200"
          style={{ fontFamily: T.sans, color: T.text3 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
        >
          <ArrowLeft size={15} strokeWidth={2.4} />
          На головну
        </Link>

        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
          Edge Journal
        </div>
        <h1
          className="mb-3 text-[32px] font-bold leading-none sm:text-[44px]"
          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
        >
          Умови користування
        </h1>
        <p className="mb-10 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          Чинна редакція від {TERMS_VERSION}
        </p>

        {/* Головне — вгорі й окремо. Пункт про те, що ми не даємо
            фінансових порад, вирішує найбільше непорозумінь, і ховати
            його дев'ятим розділом означає, що його не прочитають. */}
        <div
          className="mb-12 flex gap-4 rounded-2xl p-5"
          style={{ background: `rgba(${T.warnRgb},0.07)`, border: `1px solid rgba(${T.warnRgb},0.22)` }}
        >
          <ShieldAlert size={20} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: T.warn }} />
          <div>
            <div className="mb-1.5 text-[15px] font-bold" style={{ fontFamily: T.display, color: T.warn }}>
              Коротко, якщо читати немає часу
            </div>
            <p className="text-[14.5px] leading-[1.65]" style={{ fontFamily: T.sans, color: T.text2 }}>
              Edge Journal — щоденник, а не порадник. Ми не даємо фінансових рекомендацій, не торгуємо
              за вас і не відповідаємо за ваші рішення. Відповіді штучного інтелекту можуть бути
              помилковими. Торгівля може коштувати вам усього депозиту.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
          {/* навігатор */}
          <aside className="order-2 shrink-0 lg:order-1 lg:w-[230px]">
            <nav className="lg:sticky lg:top-8">
              <div
                className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.18em]"
                style={{ fontFamily: T.sans, color: T.text4 }}
              >
                Розділи
              </div>
              <div className="flex flex-col">
                {TERMS.map((s, i) => {
                  const on = s.id === active;
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="flex items-baseline gap-2.5 py-[7px] text-[13.5px] transition-colors duration-200"
                      style={{ fontFamily: T.sans, color: on ? T.acc : T.text3 }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                    >
                      <span className="text-[11px] tabular-nums" style={{ fontFamily: T.mono, color: on ? T.acc : T.text4 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className={on ? 'font-semibold' : ''}>{s.title}</span>
                    </a>
                  );
                })}
              </div>
            </nav>
          </aside>

          {/* текст */}
          <div className="order-1 min-w-0 flex-1 lg:order-2">
            {TERMS.map((s, i) => (
              <section key={s.id} id={s.id} className="mb-12" style={{ scrollMarginTop: 80 }}>
                <div className="mb-4 flex items-baseline gap-3">
                  <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2
                    className="text-[21px] font-bold leading-tight sm:text-[24px]"
                    style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
                  >
                    {s.title}
                  </h2>
                </div>

                <div className="flex flex-col gap-3.5 pl-[34px]">
                  {s.blocks.map((b, bi) => (
                    <p
                      key={bi}
                      className="text-[15px] leading-[1.72]"
                      style={{ fontFamily: T.sans, color: T.text2 }}
                    >
                      {b}
                    </p>
                  ))}

                  {s.callout && (
                    <p
                      className="mt-1 rounded-xl px-4 py-3 text-[14.5px] leading-[1.6]"
                      style={{
                        fontFamily: T.sans,
                        color: T.text,
                        background: `rgba(${T.accRgb},0.08)`,
                        borderLeft: `2px solid ${T.acc}`,
                      }}
                    >
                      {s.callout}
                    </p>
                  )}
                </div>
              </section>
            ))}

            <div className="mt-16 border-t pt-6 text-[13px] leading-[1.7]" style={{ borderColor: T.line, fontFamily: T.sans, color: T.text4 }}>
              {OWNER.name} · {OWNER.email} · редакція {TERMS_VERSION}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
