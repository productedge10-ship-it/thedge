import { T } from '../../lib/theme';

/* ==================================================================
   Порожній стан.

   Досі порожні списки показували велику напівпрозору іконку й рядок
   дрібним CAPS («NO ACCOUNTS YET») — і більше нічого. Людина бачила,
   що тут порожньо, але не бачила, що робити далі.

   Тут завжди три речі: що це за місце (title), навіщо його заповнювати
   (text, одне речення) і перша дія (action — зазвичай
   <Button variant="primary">). Без розмиття фону й світіння: порожній
   стан — підказка, а не вітрина.

   compact — для порожнечі всередині картки чи віджета, де повний
   варіант на пів екрана виглядав би як помилка.
================================================================== */

export default function EmptyState({ icon: Icon, title, text, action, compact = false, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16 sm:py-20'} ${className}`}
      style={{
        border: `1px dashed ${T.lineHi}`,
        borderRadius: compact ? 10 : 14,
      }}
    >
      {Icon && (
        /* Іконка в кольорі text3, а не прозора text4: вона пояснює, що
           саме тут мало б лежати, і мусить читатись. */
        <Icon size={compact ? 20 : 28} strokeWidth={1.8} style={{ color: T.text3 }} aria-hidden />
      )}
      {title && (
        <div
          className={compact ? 'text-[14px] font-semibold' : 'mt-1 text-[17px] font-semibold'}
          style={{ fontFamily: T.sans, color: T.text }}
        >
          {title}
        </div>
      )}
      {text && (
        <p
          className={`m-0 max-w-[420px] leading-[1.55] ${compact ? 'text-[13px]' : 'text-[14px]'}`}
          style={{ fontFamily: T.sans, color: T.text3 }}
        >
          {text}
        </p>
      )}
      {action && <div className={compact ? 'mt-1' : 'mt-3'}>{action}</div>}
    </div>
  );
}
