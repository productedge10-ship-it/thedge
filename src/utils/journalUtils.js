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

/* Гроші по угоді.

   Порядок джерел важливий, і саме його тут бракувало.

   1. profit_money — те, що реально порахував брокер: чистий результат
      з комісією і свопом. Для імпортованих угод це єдина правда, і
      питати замість неї наш перерахунок «ризик × RR» безглуздо.
   2. ризик × RR — для угод, заведених руками, де жодних грошей від
      брокера немає.
   3. null — коли ризик не заповнений. Саме звідси й бралась дивина:
      у R угода рахувалась, а в доларах зникала, тож підсумки збігались
      тільки в тих, хто заповнює ризик завжди. */
export const getTradeProfit = (trade, accountsMap) => {
  const money = Number(trade?.profit_money);
  if (trade?.profit_money !== null && trade?.profit_money !== undefined && Number.isFinite(money)) {
    return money;
  }

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