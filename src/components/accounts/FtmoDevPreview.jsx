import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import PropRulesView from './PropRulesView';

/* DEV: правила FTMO з src/dev/ftmo-rules.json (scripts/ftmo-build.mjs) у тому
   вигляді, який побачить юзер. Лише npm run dev; у проді — «Coming Soon». */
export default function FtmoDevPreview() {
  const [data, setData] = useState(null);
  useEffect(() => { import('../../dev/ftmo-rules.json').then((m) => setData(m.default)).catch(() => setData(false)); }, []);
  if (data === false) return <div className="mb-6 text-[13px]" style={{ color: T.text3 }}>Немає src/dev/ftmo-rules.json — запусти node scripts/ftmo-build.mjs structured і rulebook.</div>;
  if (!data) return null;
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md px-2 py-1 text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.08em', background: 'rgba(251,191,36,0.14)', color: '#FBBF24' }}>dev</span>
        <span className="text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>так побачить юзер · дані з src/dev/ftmo-rules.json</span>
      </div>
      <PropRulesView firm="FTMO" data={data} />
    </div>
  );
}
