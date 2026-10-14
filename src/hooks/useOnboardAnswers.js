import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { KEY, EMPTY, normalize, SAVED_EVENT } from '../lib/onboard';

/* Відповіді анкети лише для читання.

   Не через useCloudState: той після завантаження сам пише значення
   назад у базу, і другий його екземпляр міг би затерти щойно збережені
   відповіді старим «new». Тут тільки читаємо і слухаємо подію від
   анкети. */
export default function useOnboardAnswers() {
  const { user } = useAuth();
  const [v, setV] = useState(EMPTY);

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    supabase.from('user_state').select('data').eq('user_id', user.id).eq('key', KEY).maybeSingle()
      .then(({ data }) => { if (alive && data?.data) setV(normalize(data.data)); })
      .catch(() => {});
    const on = (e) => setV(normalize(e.detail));
    window.addEventListener(SAVED_EVENT, on);
    return () => { alive = false; window.removeEventListener(SAVED_EVENT, on); };
  }, [user?.id]);

  return v;
}
