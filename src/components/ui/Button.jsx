import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/* ==================================================================
   Кнопка застосунку.

   Чотири ролі:
     primary     — головна дія екрана, одна на екран;
     secondary   — решта дій поруч із нею;
     ghost       — третинні дії в тулбарах і картках;
     destructive — видалення й інше незворотне.
   Три розміри: sm 32 / md 40 / lg 44 (lg — лендінг і порожні стани).

   Вигляд живе в index.css (.edge-btn*), а не в інлайн-стилях: ховер,
   натиск, фокус і вимкнений стан — псевдокласи, і вони однакові на
   кожній кнопці без жодного onMouseEnter.

   `as="a"` + href — для переходів, які мусять лишатись посиланням
   (відкрити в новій вкладці, пошуковик бачить адресу).
================================================================== */

const ICON = { sm: 14, md: 16, lg: 16 };

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    disabled = false,
    block = false,
    as = 'button',
    type = 'button',
    className = '',
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const iconOnly = !children && (Icon || IconRight);
  const px = ICON[size] || 16;
  const off = disabled || loading;

  const cls = [
    'edge-btn',
    `edge-btn--${variant}`,
    `edge-btn--${size}`,
    block && 'edge-btn--block',
    iconOnly && 'edge-btn--icon',
    className,
  ].filter(Boolean).join(' ');

  /* Спінер стає на місце іконки — тоді ширина кнопки не змінюється й
     сусіди в ряду не смикаються. Якщо іконки немає, підпис ховається
     (visibility, а не display: місце під ним лишається), а спінер
     лягає по центру поверх. */
  const spin = <Loader2 size={px} strokeWidth={2.4} className="edge-btn__spin" aria-hidden />;
  const lead = loading && Icon ? spin : Icon ? <Icon size={px} strokeWidth={2.2} aria-hidden /> : null;
  const overlay = loading && !Icon;

  const content = (
    <>
      {lead}
      {children != null && (
        <span className={overlay ? 'edge-btn__label--hidden' : undefined}>{children}</span>
      )}
      {IconRight && <IconRight size={px} strokeWidth={2.2} aria-hidden />}
      {overlay && <span className="edge-btn__spinner-over">{spin}</span>}
    </>
  );

  if (as === 'a') {
    /* У посилання немає атрибута disabled: вимикаємо через aria й
       гасимо клік, інакше «вимкнене» посилання все одно переходить. */
    return (
      <a
        ref={ref}
        className={cls}
        aria-disabled={off || undefined}
        aria-busy={loading || undefined}
        tabIndex={off ? -1 : undefined}
        onClick={(e) => {
          if (off) { e.preventDefault(); return; }
          onClick?.(e);
        }}
        {...rest}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      /* Під час завантаження — aria-disabled, а не disabled: справжній
         disabled скидає фокус із кнопки, і людина з клавіатурою
         втрачає місце, де була. Клік блокує pointer-events у CSS і
         перевірка нижче. */
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (off) { e.preventDefault(); return; }
        onClick?.(e);
      }}
      {...rest}
    >
      {content}
    </button>
  );
});

export default Button;
