import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/* ==================================================================
   Стан сторінки, який живе в базі.

   Було: завдання, помодоро й чекліст лежали в localStorage — інший
   браузер показував порожнечу, а чистка кешу зносила все.
   Стало: документ у таблиці user_state під ключем, з локальним
   дзеркалом для миттєвого старту й роботи без мережі.

   Правила, які тут важливі:
   • нічого не пишемо в базу, поки не завантажились — інакше свіжий
     порожній стан затре те, що вже накопичено;
   • при першому запуску забираємо дані зі старого localStorage-ключа
     і одразу відправляємо в базу, щоб нічого не загубилось;
   • запис іде із затримкою, бо стан міняється на кожен клік.
================================================================== */

const readLocal = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
};

const writeLocal = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватний режим */ }
};

export default function useCloudState(key, initial, options = {}) {
  const { legacyKey, normalize, delay = 700 } = options;
  const { user } = useAuth();

  const mirrorKey = `edge_cloud_${key}`;
  const norm = useCallback((v) => (normalize ? normalize(v) : v), [normalize]);

  /* Стартуємо з локального дзеркала — сторінка не блимає порожнечею */
  const [value, setValue] = useState(() => {
    const local = readLocal(mirrorKey) ?? (legacyKey ? readLocal(legacyKey) : undefined);
    return local === undefined ? initial : norm(local);
  });

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  /* ---------- завантаження ---------- */
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from('user_state')
        .select('data')
        .eq('user_id', user.id)
        .eq('key', key)
        .maybeSingle();

      if (!alive) return;

      if (!error && data?.data !== undefined && data.data !== null) {
        const fromCloud = norm(data.data);
        setValue(fromCloud);
        writeLocal(mirrorKey, fromCloud);
        setReady(true);
        return;
      }

      /* У базі порожньо — переносимо те, що лишилось на цьому пристрої */
      const legacy = legacyKey ? readLocal(legacyKey) : undefined;
      const local = readLocal(mirrorKey) ?? legacy;
      const seed = local === undefined ? initial : norm(local);

      setValue(seed);
      setReady(true);

      await supabase.from('user_state').upsert(
        { user_id: user.id, key, data: seed },
        { onConflict: 'user_id,key' },
      );
    })();

    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id, key]);

  /* ---------- запис ---------- */
  const push = useCallback(async (next) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase.from('user_state').upsert(
        { user_id: user.id, key, data: next },
        { onConflict: 'user_id,key' },
      );
    } finally {
      setSaving(false);
    }
  }, [user?.id, key]);

  useEffect(() => {
    if (!ready || !user?.id) return undefined;
    writeLocal(mirrorKey, value);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => push(value), delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [value, ready, user?.id]);

  /* Закриття вкладки — дозаписуємо негайно */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && ready) push(valueRef.current);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [ready, push]);

  return [value, setValue, { ready, saving }];
}
