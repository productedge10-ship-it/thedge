/* ==================================================================
   Мініатюри для бібліотеки віджетів.

   У списку «додати віджет» була іконка, назва й рядок опису — і цього
   виявилось замало. Текст «скільки платить кожна торгова сесія» не
   каже, чи це стовпчики, список чи одне число; людина додає віджет
   наосліп, дивиться, прибирає. Мініатюра відповідає на це питання
   раніше за клік.

   Малюються голим SVG, а не recharts. Причина проста: у панелі їх
   одночасно до чотирнадцяти, і кожен повноцінний графік тягне за
   собою вимірювання контейнера й перерахунок на кожен ресайз. Тут же
   форма вигадана й незмінна — досить кількох шляхів.

   Це портрет, а не дані. Числа в мініатюрі не справжні й не мають
   ними прикидатись: тому ні підписів, ні осей, ні значень.
================================================================== */

const W = 96;
const H = 40;

/* Плавна крива через набір точок — щоб мініатюра не виглядала як
   ламана з трьох відрізків. */
const smooth = (pts) => pts.reduce((d, [x, y], i, a) => {
  if (!i) return `M${x},${y}`;
  const [px, py] = a[i - 1];
  const cx = (px + x) / 2;
  return `${d} C${cx},${py} ${cx},${y} ${x},${y}`;
}, '');

const SERIES = {
  spark: [[0, 34], [16, 28], [32, 30], [48, 20], [64, 22], [80, 11], [96, 6]],
  curve: [[0, 33], [14, 27], [28, 29], [42, 18], [56, 24], [70, 12], [84, 14], [96, 4]],
  dip: [[0, 8], [14, 10], [24, 30], [34, 12], [48, 14], [58, 32], [70, 13], [84, 15], [96, 9]],
};

export default function Preview({ shape, tone, id, compact }) {
  const gid = `pv-${id}`;
  /* Компактний варіант — для чіпів у бібліотеці: та сама форма,
     розтягнута під висоту батька. Малювати для них окремий набір
     мініатюр не було б за що: різниця лише в розмірі. */
  const box = { width: '100%', height: compact ? '100%' : H, display: 'block', overflow: 'visible' };

  /* ---------- крива з заливкою ---------- */
  if (shape === 'spark' || shape === 'curve' || shape === 'dip') {
    const pts = SERIES[shape];
    const line = smooth(pts);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={box}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.34" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={tone} strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  /* ---------- стовпці від нульової осі ---------- */
  if (shape === 'bars') {
    const bars = [10, -5, 16, 7, -9, 13, 4];
    const mid = H / 2;
    const step = W / bars.length;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={box}>
        <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(var(--edge-hair-rgb),0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {bars.map((v, i) => (
          <rect
            key={i}
            x={i * step + step * 0.22}
            y={v >= 0 ? mid - v : mid}
            width={step * 0.56}
            height={Math.abs(v)}
            rx="1.5"
            fill={v >= 0 ? tone : '#ff7b7b'}
            opacity={v >= 0 ? 0.9 : 0.75}
          />
        ))}
      </svg>
    );
  }

  /* ---------- список зі смугами ---------- */
  if (shape === 'rows') {
    const widths = [0.92, 0.66, 0.44, 0.28];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={box}>
        {widths.map((w, i) => (
          <g key={i}>
            <rect x="0" y={i * 10.5} width={W} height="7.5" rx="2.5" fill="rgba(var(--edge-hair-rgb),0.03)" />
            <rect x="0" y={i * 10.5} width={W * w} height="7.5" rx="2.5" fill={tone} opacity={0.42 - i * 0.07} />
          </g>
        ))}
      </svg>
    );
  }

  /* ---------- дві половини ---------- */
  if (shape === 'split') {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={box}>
        <rect x="0" y="6" width="44" height="28" rx="5" fill={tone} opacity="0.2" />
        <rect x="0" y="6" width="44" height="28" rx="5" fill="none" stroke={tone} strokeOpacity="0.45" vectorEffect="non-scaling-stroke" />
        <rect x="52" y="6" width="44" height="28" rx="5" fill="#ff7b7b" opacity="0.16" />
        <rect x="52" y="6" width="44" height="28" rx="5" fill="none" stroke="#ff7b7b" strokeOpacity="0.4" vectorEffect="non-scaling-stroke" />
        <rect x="8" y="14" width="20" height="4" rx="2" fill={tone} opacity="0.75" />
        <rect x="8" y="22" width="12" height="3" rx="1.5" fill="rgba(var(--edge-hair-rgb),0.17)" />
        <rect x="60" y="14" width="16" height="4" rx="2" fill="#ff7b7b" opacity="0.7" />
        <rect x="60" y="22" width="12" height="3" rx="1.5" fill="rgba(var(--edge-hair-rgb),0.17)" />
      </svg>
    );
  }

  /* ---------- кільце ---------- */
  if (shape === 'ring') {
    const r = 15;
    const c = 2 * Math.PI * r;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={box}>
        <g transform={`translate(${W / 2} ${H / 2})`}>
          <circle r={r} fill="none" stroke="rgba(var(--edge-hair-rgb),0.07)" strokeWidth="5" />
          <circle
            r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * 0.29} transform="rotate(-90)"
          />
        </g>
      </svg>
    );
  }

  /* ---------- шкала ---------- */
  if (shape === 'gauge') {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={box}>
        <rect x="0" y="9" width={W} height="7" rx="3.5" fill="rgba(var(--edge-hair-rgb),0.05)" />
        <rect x="0" y="9" width={W * 0.72} height="7" rx="3.5" fill={tone} opacity="0.85" />
        <rect x="0" y="26" width="34" height="5" rx="2.5" fill="rgba(var(--edge-hair-rgb),0.08)" />
        <rect x="62" y="26" width="34" height="5" rx="2.5" fill={tone} opacity="0.35" />
      </svg>
    );
  }

  /* ---------- смуги серій ---------- */
  if (shape === 'streak') {
    const cells = [1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1];
    const step = W / cells.length;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={box}>
        {cells.map((v, i) => (
          <rect
            key={i}
            x={i * step + 1} y={v ? 6 : 20} width={step - 2} height={v ? 14 : 14} rx="2.5"
            fill={v ? tone : '#ff7b7b'} opacity={v ? 0.8 : 0.55}
          />
        ))}
      </svg>
    );
  }

  /* ---------- велике число ---------- */
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={box}>
      <rect x="0" y="4" width="52" height="15" rx="4" fill={tone} opacity="0.28" />
      <rect x="0" y="25" width="34" height="6" rx="3" fill="rgba(var(--edge-hair-rgb),0.08)" />
    </svg>
  );
}
