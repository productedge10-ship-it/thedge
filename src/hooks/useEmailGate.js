import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { openVerifyEmail } from '../lib/emailGate';

/* ==================================================================
   Перепустка для дій, що створюють дані.

   Використання:

     const { blocked, guard } = useEmailGate();
     <button onClick={guard(openAddModal)} …>

   guard() повертає обгортку: якщо пошта підтверджена — виконує дію,
   якщо ні — показує модалку підтвердження замість неї.

   Кнопки навмисно НЕ робимо disabled. Сіра кнопка, яка не реагує на
   натискання, нічого не пояснює — людина вирішує, що сайт зламався.
   Клікабельна кнопка з поясненням у відповідь чесніша: видно і що
   саме заблоковано, і як це зняти.

   blocked === true лише коли статус точно відомий. Поки профіль
   вантажиться, emailVerified === undefined — і в цей момент ми нічого
   не блокуємо, щоб не ловити випадкову модалку на першому кліку.
================================================================== */

export default function useEmailGate() {
  const { emailVerified } = useAuth();
  const blocked = emailVerified === false;

  const guard = useCallback((action) => (...args) => {
    if (blocked) {
      openVerifyEmail();
      return undefined;
    }
    return action?.(...args);
  }, [blocked]);

  return { blocked, guard };
}
