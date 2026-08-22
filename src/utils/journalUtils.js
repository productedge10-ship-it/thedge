// src/utils/journalUtils.js

export const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getToday = () => formatDate(new Date());

export const getThisWeek = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  return { from: formatDate(start), to: formatDate(new Date()) };
};

export const getThisMonth = () => {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return { from: formatDate(start), to: formatDate(new Date()) };
};

export const getLast3Months = () => {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() - 3, d.getDate());
  return { from: formatDate(start), to: formatDate(new Date()) };
};

export const parseDateString = (dateStr) => {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m - 1, d);
};

export const getTradeProfit = (trade, accountsMap) => {
  if (trade.rr === null || trade.rr === undefined) return null;
  const rr = parseFloat(trade.rr);
  if (isNaN(rr)) return null;

  let riskValue = 0;
  const riskStr = String(trade.risk || '').trim();
  
  if (riskStr.includes('$')) {
    riskValue = parseFloat(riskStr.replace(/[^0-9.]/g, ''));
  } else if (riskStr.includes('%')) {
    const percent = parseFloat(riskStr.replace(/[^0-9.]/g, ''));
    const accSize = accountsMap[trade.account_name] || 0;
    riskValue = accSize * (percent / 100);
  } else {
    const val = parseFloat(riskStr);
    if (!isNaN(val)) {
      if (val <= 10) { 
        const accSize = accountsMap[trade.account_name] || 0;
        riskValue = accSize * (val / 100);
      } else { 
        riskValue = val;
      }
    }
  }

  if (riskValue > 0) {
     return riskValue * rr;
  }
  return null; 
};