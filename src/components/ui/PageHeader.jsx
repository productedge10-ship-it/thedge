import { T } from '../../lib/theme';

/* ==================================================================
   Шапка сторінки застосунку.

   До неї кожна сторінка збирала шапку сама і майже всі — однаково:
   крапка зі світінням, моноширинний CAPS-підпис, назва градієнтом.
   Саме цей набір першим видає «згенерований» інтерфейс, а градієнт
   ще й з'їдав контраст на кінці слова.

   Тут назва суцільним кольором тексту. Характер дає гарнітура
   (Unbounded через .edge-page-title — той самий розмір 28/36/42, що й
   зараз), а не ефект. Над назвою — за бажанням звичайний підпис
   (розділ, хлібна крихта): без крапки, без CAPS, приглушений.

   actions — праворуч на широкому екрані й під назвою на вузькому.
   Головна дія там одна (Button variant="primary"), решта — secondary
   або ghost.
================================================================== */

export default function PageHeader({ kicker, title, subtitle, actions, children, className = '' }) {
  return (
    <header className={`mb-7 sm:mb-8 ${className}`}>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          {kicker && (
            <div className="mb-2.5 text-[13px] font-medium" style={{ fontFamily: T.sans, color: T.text3 }}>
              {kicker}
            </div>
          )}
          <h1 className="edge-page-title m-0" style={{ fontFamily: T.display, color: T.text }}>
            {title}
          </h1>
          {subtitle && (
            /* Ширину рядка обмежено: на моніторі підпис на всю ширину
               читається як окремий абзац, а не як пояснення до назви. */
            <p className="mb-0 mt-3 max-w-[640px] text-[15px] leading-[1.55]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2.5 md:w-auto md:justify-end">
            {actions}
          </div>
        )}
      </div>

      {children && <div className="mt-6">{children}</div>}
    </header>
  );
}
