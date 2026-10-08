import { assetInfo, flagUrl } from '../../../lib/candles/assets';

/* Логотип інструмента: дві валюти внахльост, прапор країни індексу,
   монета для металу чи крипти. */
export default function SymbolLogo({ symbol, size = 22 }) {
  const { logo } = assetInfo(symbol);
  const ring = { boxShadow: '0 0 0 1.5px rgba(0,0,0,0.35)' };
  const circle = (s) => ({ width: s, height: s, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, ...ring });
  if (logo.kind === 'pair') {
    const s = Math.round(size * 0.78);
    return (
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <img src={flagUrl(logo.a)} alt="" draggable={false} className="absolute left-0 top-0 object-cover" style={circle(s)} />
        <img src={flagUrl(logo.b)} alt="" draggable={false} className="absolute bottom-0 right-0 object-cover" style={circle(s)} />
      </span>
    );
  }
  if (logo.kind === 'flag') {
    return <img src={flagUrl(logo.flag)} alt="" draggable={false} className="object-cover" style={circle(size)} />;
  }
  if (logo.kind === 'coin') {
    const q = Math.round(size * 0.48);
    return (
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <span className="grid place-items-center font-bold text-white" style={{ ...circle(size), background: logo.color, fontSize: size * 0.46, lineHeight: 1 }}>{logo.glyph}</span>
        {logo.quote && <img src={flagUrl(logo.quote)} alt="" draggable={false} className="absolute -bottom-0.5 -right-0.5 object-cover" style={circle(q)} />}
      </span>
    );
  }
  return <span className="grid place-items-center text-[10px] font-bold" style={{ ...circle(size), background: '#3a3f4b', color: '#fff' }}>{logo.text}</span>;
}
