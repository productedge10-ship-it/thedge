import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/* ==================================================================
   Невеликі довідники користувача — активи, сесії, рахунки.

   Вони не міняються по дорозі, але потрібні щоразу, коли людина
   відкриває форму. Тягнути їх з бази на кожне відкриття означає
   порожній список на пів секунди при кожному кліку, тому перший
   запит кешується в модулі, а наступні відкриття миттєві. Мутації
   (додав / видалив) одразу оновлюють і кеш, і UI, тому застарілих
   даних ніхто не бачить.

   Кеш живе до перезавантаження сторінки — для довідників на
   десяток рядків цього досить.
================================================================== */

/* Кеш експортується: рахунки в TradeModal читаються й оновлюються
   поза хуком (там своя логіка вибору активного рахунку), і їм
   потрібен доступ до того самого сховища, інакше список розʼїдеться
   з тим, що показує решта форми. */
export const listCache = { assets: null, sessions: null, accounts: null };

export default function useCachedList(cacheKey, table, select, order) {
  const [items, setItems] = useState(listCache[cacheKey] || []);

  useEffect(() => {
    if (listCache[cacheKey]) return;
    supabase.from(table).select(select).order(order)
      .then(({ data }) => {
        if (data) {
          listCache[cacheKey] = data;
          setItems(data);
        }
      });
  }, [cacheKey, table, select, order]);

  const update = (next) => {
    listCache[cacheKey] = next;
    setItems(next);
  };

  return [items, update];
}
