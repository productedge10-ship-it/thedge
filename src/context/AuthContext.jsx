import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/* ==================================================================
   Сесія користувача + статус підтвердження пошти.

   Чому статус береться з власної таблиці profiles, а не з
   auth.users.email_confirmed_at: у проєкті вимкнено «Confirm email»
   (інакше непідтверджений юзер не зміг би навіть зайти на сайт), а в
   цьому режимі Supabase проставляє email_confirmed_at усім одразу
   при реєстрації. Тобто поле є завжди й нічого не розрізняє.

   Прапорець у profiles клієнту доступний лише на читання: ставить
   його сервер (api/verify-email.js) після перевірки токена з листа.
   Тому «підтвердити себе» з консолі браузера неможливо.
================================================================== */

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState(null);
  /* Окремий прапорець готовності: поки профіль не прилетів, статус
     невідомий — і вважати пошту непідтвердженою не можна. Інакше
     модалка блимала б секунду кожному, хто давно підтвердив. */
  const [profileReady, setProfileReady] = useState(false);

  /* Повертає прочитане, щоб той, хто викликав, міг спиратись на
     справжній стан бази, а не на власні припущення. */
  const loadProfile = useCallback(async (id) => {
    if (!id) {
      setProfile(null);
      setProfileReady(true);
      return null;
    }
    /* maybeSingle, а не single: рядок створює тригер на auth.users, і
       теоретично можна спитати раніше, ніж він зʼявився. Це не
       помилка — просто «поки невідомо». */
    const { data } = await supabase
      .from('profiles')
      .select('email_verified, verified_at')
      .eq('id', id)
      .maybeSingle();

    setProfile(data ?? null);
    setProfileReady(true);
    return data ?? null;
  }, []);

  useEffect(() => {
    // Перевіряємо поточну сесію
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      loadProfile(session?.user?.id);
    });

    // Слухаємо зміни (вхід/вихід)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      loadProfile(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = () => supabase.auth.signOut();

  /* Витягнуто в окрему змінну не для краси: з user?.email прямо в
     списку залежностей компілятор React не береться зберігати
     мемоізацію і мовчки пропускає оптимізацію цих двох функцій. */
  const email = user?.email;

  /* Викликається після повернення з листа: сервер уже переписав
     прапорець у базі, лишається перечитати його в інтерфейс. */
  const refreshProfile = useCallback(() => loadProfile(user?.id), [loadProfile, user?.id]);

  /* Лист із посиланням. Свої токени не робимо — signInWithOtp просить
     Supabase згенерувати одноразовий, а шаблон листа веде його на наш
     /api/verify-email, де він і перевіряється.

     shouldCreateUser: false — якщо адреси раптом не виявиться в базі,
     краще помилка, ніж тихо створений порожній акаунт. */
  const sendVerification = useCallback(async () => {
    if (!email) return { error: new Error('Немає адреси') };
    return supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
  }, [email]);

  /* Зміна пароля з налаштувань. Свого поля «старий пароль» тут навмисно
     немає: лист доводить володіння скринькою, а це сильніша перевірка,
     ніж рядок, який міг лишитись у чужому браузері разом із сесією.

     Повертаємо в застосунок, а не на /auth: людина не виходила з
     акаунта й міняє пароль у налаштуваннях — викидати її на екран
     входу означало б вдавати, ніби вона розлогінилась. Мітка
     ?newpass=1 каже налаштуванням відкритись одразу з формою. */
  const sendPasswordReset = useCallback(async () => {
    if (!email) return { error: new Error('Немає адреси') };
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/app?newpass=1',
    });
  }, [email]);

  return (
    <AuthContext.Provider
      value={{
        user,
        signOut,
        /* undefined, поки статус невідомий — саме цим станом
           користуються модалка й блокування кнопок, щоб не смикатись
           до першої відповіді сервера. */
        emailVerified: profileReady ? profile?.email_verified === true : undefined,
        profileReady,
        refreshProfile,
        sendVerification,
        sendPasswordReset,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
