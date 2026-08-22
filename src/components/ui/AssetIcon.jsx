import React from 'react';

export const CURRENCY_TO_FLAG = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', AUD: 'au', 
  CAD: 'ca', CHF: 'ch', NZD: 'nz', CNH: 'cn', HKD: 'hk',
  SGD: 'sg', MXN: 'mx', NOK: 'no', SEK: 'se', DKK: 'dk'
};

export default function AssetIcon({ symbol, category }) {
  const cleanSymbol = symbol.replace('/', '').toUpperCase();

  if (category?.toLowerCase().includes('crypto') || category?.toLowerCase().includes('cryptocurrencies')) {
    const coin = symbol.split('/')[0].toLowerCase().trim();
    const cryptoUrl = `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${coin}.svg`;
    return (
      <img src={cryptoUrl} alt={symbol} className="w-6 h-6 rounded-full object-contain bg-zinc-900/50" 
        onError={(e) => { e.target.src = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/generic.svg'; }} 
      />
    );
  }

  if (category?.toLowerCase().includes('forex') || cleanSymbol.length === 6) {
    const base = cleanSymbol.substring(0, 3);
    const quote = cleanSymbol.substring(3, 6);
    const flag1 = CURRENCY_TO_FLAG[base] || 'un';
    const flag2 = CURRENCY_TO_FLAG[quote] || 'un';

    return (
      <div className="flex items-center relative w-9 h-6 select-none">
        <img src={`https://flagcdn.com/${flag1}.svg`} alt={base} className="w-5 h-5 rounded-full object-cover border-2 border-[#0A0A0C] z-10 absolute left-0 shadow-md" />
        <img src={`https://flagcdn.com/${flag2}.svg`} alt={quote} className="w-5 h-5 rounded-full object-cover border-2 border-[#0A0A0C] absolute left-3.5 shadow-md" />
      </div>
    );
  }

  if (cleanSymbol.includes('XAU') || cleanSymbol.includes('GOLD')) {
    return <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 border border-amber-500/30 flex items-center justify-center text-[9px] font-black text-black shadow-lg shadow-amber-500/10">Au</div>;
  }

  if (cleanSymbol.includes('WTI') || cleanSymbol.includes('BRENT') || cleanSymbol.includes('OIL')) {
    return <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300">🛢️</div>;
  }

  return <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center text-[8px] font-black text-blue-400 tracking-tighter uppercase shadow-inner">{cleanSymbol.substring(0, 3)}</div>;
}