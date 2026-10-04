import { T } from '../../lib/theme';
import { REVIEW_MIN, reviewHint } from '../../lib/tradeStats';

/* Одна підказка «розбери ще кілька угод» на всі місця, де аналіз
   прихований через нерозібрані угоди. Смужка показує, що до мети
   близько: десять угод, а не весь журнал. */
export default function ReviewProgress({ reviewed = 0, align = 'center' }) {
  const pct = Math.min(100, (Math.min(reviewed, REVIEW_MIN) / REVIEW_MIN) * 100);
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 260,
        alignItems: align === 'center' ? 'center' : 'stretch',
        margin: align === 'center' ? '0 auto' : 0, textAlign: align,
      }}
    >
      <span style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.45, color: T.text2 }}>
        {reviewHint(reviewed)}
      </span>
      <div
        role="progressbar" aria-valuemin={0} aria-valuemax={REVIEW_MIN} aria-valuenow={Math.min(reviewed, REVIEW_MIN)}
        style={{ width: '100%', height: 4, borderRadius: 999, background: `rgba(${T.accRgb},0.14)`, overflow: 'hidden' }}
      >
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 999, background: T.acc }} />
      </div>
    </div>
  );
}
