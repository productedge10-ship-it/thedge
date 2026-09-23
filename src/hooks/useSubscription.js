import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { readSubscription } from '../lib/billing';

/* ==================================================================
   Стан підписки для інтерфейсу.

   Важливо розуміти межі цього хука: він вирішує, ЩО ПОКАЗАТИ, а не
   що дозволено. Будь-яка перевірка в браузері — це підказка для
   чесної людини, і не більше: код видно в DevTools, і `isPro` там
   ставиться в `true` за півхвилини.

   Справжній замок стоїть у базі: функція `is_pro()` і політики RLS
   на платних таблицях. Тут — лише про те, малювати замочок чи ні.

   `ready` окремо від `isPro` не для краси. Поки відповідь не
   прийшла, обидва стани хибні: показати замок на Pro-акаунті —
   образливо, показати відкритий розділ на Free — а потім забрати
   його на очах — гірше. Тому до готовності не показуємо нічого.
================================================================== */

export default function useSubscription() {
  const { user } = useAuth();
  const [state, setState] = useState({
    plan: 'free', status: 'inactive', validUntil: null, trialUsed: false, isPro: false, ready: false,
  });

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setState({ plan: 'free', status: 'inactive', validUntil: null, trialUsed: false, isPro: false, ready: true });
      return;
    }
    try {
      const s = await readSubscription();
      setState({ ...s, ready: true });
    } catch {
      /* Мережа впала — не видаємо Pro «про всяк випадок», але й не
         блокуємо те, що вже відкрито: ready лишається false, і
         інтерфейс просто не малює нічого про тарифи. */
      setState((p) => ({ ...p, ready: false }));
    }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  /* Повернення з платіжної сторінки. WayForPay кидає людину назад
     одразу, а колбек до нас може доїхати на секунду пізніше — тому
     не один запит, а кілька з паузами. Без цього людина повертається
     після оплати й бачить той самий замок. */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('paid')) return undefined;

    let n = 0;
    const t = setInterval(() => {
      n += 1;
      refresh();
      if (n >= 6) clearInterval(t);
    }, 1500);

    return () => clearInterval(t);
  }, [refresh]);

  return { ...state, refresh };
}
