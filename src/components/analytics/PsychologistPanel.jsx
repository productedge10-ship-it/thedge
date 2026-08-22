import React, { useState, useRef, useEffect, useMemo } from 'react';
import { BrainCircuit, Loader2, Send, Sparkles } from 'lucide-react';
import { Panel } from './ui';
import { EMOTION_LABEL, r1, signed } from './data';

function buildBrief(s) {
  return {
    trades: s.trades.length,
    netR: +s.net.toFixed(1),
    winRate: s.wr,
    profitFactor: +s.pf.toFixed(2),
    expectancyR: +s.expectancy.toFixed(2),
    maxDrawdownR: +s.maxDD.toFixed(1),
    planAdherencePct: s.adherence,
    mistakeRatePct: s.mistakeRate,
    tiltCostR: +s.tiltCost.toFixed(1),
    avgRafterLoss: +s.avgAfterLoss.toFixed(2),
    avgRafterWin: +s.avgAfterWin.toFixed(2),
    byEmotion: s.emotionStats.map((e) => ({ emotion: e.emotion, n: e.trades, avgR: e.avg, wr: e.wr })),
    topMistakes: s.mistakeLedger.slice(0, 3).map((m) => ({ name: m.name, n: m.count, costR: m.cost })),
    bySession: s.bySession,
    byDayOfWeek: s.byDow,
    topAssets: s.byAsset.slice(0, 3).map((a) => ({ asset: a.key, netR: a.net, wr: a.wr })),
    worstAssets: s.byAsset.slice(-2).map((a) => ({ asset: a.key, netR: a.net, wr: a.wr })),
    setups: s.bySetup.map((a) => ({ setup: a.key, netR: a.net, wr: a.wr, n: a.trades })),
  };
}

function localVerdict(s) {
  const worst = [...s.emotionStats].sort((a, b) => a.avg - b.avg)[0];
  const best = [...s.emotionStats].sort((a, b) => b.avg - a.avg)[0];
  const bestDay = [...s.byDow].sort((a, b) => b.avg - a.avg)[0];
  const bestSes = [...s.bySession].sort((a, b) => b.net - a.net)[0];
  const worstSes = [...s.bySession].sort((a, b) => a.net - b.net)[0];
  const leak = s.mistakeLedger[0];
  return [
    `Твоя перевага живе в одному режимі: угоди в стані «${EMOTION_LABEL[best.emotion]}» дають ${signed(best.avg, 2)}R у середньому, а «${EMOTION_LABEL[worst.emotion]}» — ${signed(worst.avg, 2)}R. Це не ринок, це стан входу.`,
    `Найдорожча звичка — «${leak.name}»: ${leak.count} разів, ${r1(leak.cost)}R збитку. Прибрати її дешевше, ніж знайти новий сетап.`,
    `Після збитку середній результат ${signed(s.avgAfterLoss, 2)}R проти ${signed(s.avgAfterWin, 2)}R після прибутку. ${s.avgAfterLoss < s.avgAfterWin ? 'Пауза на 30 хвилин після мінуса — найдешевший фікс у журналі.' : 'Відновлюєшся після мінуса добре, це сильна сторона.'}`,
    `Час і місце: ${bestSes.session} дає ${signed(bestSes.net)}R, ${worstSes.session} — ${signed(worstSes.net)}R. Найсильніший день — ${bestDay.day} (${signed(bestDay.avg, 2)}R на угоду).`,
  ];
}

export function PsychologistPanel({ stats }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy]);

  const brief = useMemo(() => buildBrief(stats), [stats]);

  const ask = async (question) => {
    if (!question.trim() || busy) return;
    const next = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content:
`Ти — трейдинг-психолог. Аналізуєш журнал трейдера і говориш українською, коротко, конкретно, без води й без компліментів заради компліментів. Спирайся ЛИШЕ на цифри нижче, називай їх прямо. Максимум 160 слів. Структура: спостереження → причина → одна дія на завтра.

ДАНІ ЖУРНАЛУ (JSON):
${JSON.stringify(brief)}

ПИТАННЯ ТРЕЙДЕРА: ${question}`,
            },
          ],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).map((c) => c.text || '').filter(Boolean).join('\n').trim();
      if (!text) throw new Error('empty');
      setMessages([...next, { role: 'ai', content: text }]);
    } catch (e) {
      setOffline(true);
      setMessages([...next, { role: 'ai', content: localVerdict(stats).join('\n\n'), local: true }]);
    } finally {
      setBusy(false);
    }
  };

  const chips = [
    'Розбери мій тиждень',
    'Де я зливаю найбільше R?',
    'Що прибрати з торгівлі назавжди?',
    'Чому я гірше торгую після збитку?',
  ];

  return (
    <Panel
      className="bg-gradient-to-b from-[#18181C] to-[#131316] border-[#1C1C21]"
      title={<><Sparkles size={13} /> AI-психолог</>}
      right={<span className="text-[10px] tracking-[0.1em] uppercase text-[#fbbf24] bg-[#241F0F] px-[9px] py-[4px] rounded-[20px]">{offline ? 'локальний розбір' : 'на звʼязку'}</span>}
    >
      <div className="max-h-[330px] overflow-y-auto flex flex-col gap-3 pr-1 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-[#7A7A85] p-[14px_8px_20px]">
            <BrainCircuit size={30} className="text-[#33333A] mb-[10px] mx-auto" />
            <p className="text-[12.5px] leading-[1.6] m-0">
              Я бачу всі {stats.trades.length} угод: емоції, помилки, сесії, час утримання.
              Питай про будь-що — відповім цифрами з твого журналу, а не загальними словами.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-[13px] leading-[1.62] rounded-xl p-[12px_14px] ${m.role === 'user' ? 'bg-[#221E3D] text-[#FAFAFA] self-end max-w-[92%]' : 'bg-[var(--edge-surface-hi)] text-[#B4B4BD] shadow-[inset_0_0_0_1px_#232328]'}`}>
            {m.role === 'ai' && <span className="block text-[9.5px] tracking-[0.13em] uppercase text-[#fbbf24] mb-[7px]">Психолог{m.local ? ' · офлайн' : ''}</span>}
            {m.content.split('\n').filter(Boolean).map((p, j) => <p key={j} className="mb-2 last:mb-0">{p}</p>)}
          </div>
        ))}
        {busy && <div className="flex items-center gap-[9px] text-[#7A7A85] text-[12px] bg-[var(--edge-surface-hi)] shadow-[inset_0_0_0_1px_#232328] rounded-xl p-[12px_14px]"><Loader2 size={14} className="animate-spin" /> Читаю журнал…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 my-[14px]">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => ask(c)}
            disabled={busy}
            className="text-[11.5px] px-[11px] py-[7px] rounded-[20px] text-[#7A7A85] shadow-[inset_0_0_0_1px_#232328] transition-all hover:enabled:text-[#FAFAFA] hover:enabled:shadow-[inset_0_0_0_1px_#3A3A44] disabled:opacity-45 disabled:cursor-default"
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-center bg-[var(--edge-surface-hi)] border border-[#232328] rounded-xl p-[6px_6px_6px_13px]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(input); }}
          placeholder="Напиши, що тебе турбує в торгівлі…"
          className="flex-1 bg-transparent border-none outline-none text-[#FAFAFA] text-[13px]"
        />
        <button
          onClick={() => ask(input)}
          disabled={busy || !input.trim()}
          aria-label="Надіслати"
          className="w-[34px] h-[34px] rounded-lg bg-[#8b7bff] text-[#0A0A0C] grid place-items-center disabled:bg-[#1C1C21] disabled:text-[#4A4A52] transition-colors"
        >
          <Send size={15} />
        </button>
      </div>
    </Panel>
  );
}