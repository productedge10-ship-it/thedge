import { createContext, useContext, useEffect, useMemo } from 'react';
import { MotionConfig } from 'framer-motion';

import useCloudState from '../hooks/useCloudState';
import { KEY, DEFAULTS, normalize, fxValue } from '../lib/settings';
import { applyTheme } from '../lib/themes';
import { sweepTheme } from '../components/core/ThemeSweep';

/* ==================================================================
   Налаштування, доступні всьому застосунку.

   Через контекст, а не через окремий виклик useCloudState у кожному
   компоненті: інакше кожен отримав би власну копію стану, і зміна
   в одному місці не дійшла б до інших до перезавантаження.

   Тут же живуть два глобальні наслідки налаштувань — вимкнені
   анімації. Один для framer, другий для CSS: у нас є і те, і те, і
   вимикати треба обидва, інакше «вимкнено» виявиться напівправдою.
================================================================== */

const Ctx = createContext(null);

export function SettingsProvider({ children }) {
  const [value, setValue, meta] = useCloudState(KEY, DEFAULTS, { normalize });

  const settings = useMemo(() => normalize(value), [value]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('edge-no-motion', settings.motion === 'off');
    root.classList.toggle('edge-calm-motion', settings.motion === 'calm');
  }, [settings.motion]);

  /* Яскравість курсорного світла — одним числом на корені. Кожен шар
     світла в застосунку множить свою прозорість на нього, тому
     регулятор один, а слухаються його всі сторінки одразу.

     Вимкнені анімації забирають і світло: людина, яка попросила
     тиші, не має отримати статичну сторінку, по якій усе одно повзе
     ореол за мишкою. */
  useEffect(() => {
    const off = settings.motion === 'off';
    document.documentElement.style.setProperty(
      '--edge-fx',
      String(off ? 0 : fxValue(settings.fx)),
    );
  }, [settings.fx, settings.motion]);

  /* Тему при завантаженні ставимо без анімації: діагональ по екрану
     на кожному відкритті вкладки — це вже не ефект, а затримка. */
  useEffect(() => {
    applyTheme(settings.theme);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const api = useMemo(
    () => ({
      ...settings,
      ready: meta.ready,
      set: (patch) => setValue((v) => ({ ...normalize(v), ...patch })),

      /* Тема — окремо від решти налаштувань: спершу запускаємо
         діагональ, вона сама підмінить кольори в потрібний момент. */
      setTheme: (id) => {
        sweepTheme(id);
        setValue((v) => ({ ...normalize(v), theme: id }));
      },

      /* Один рубильник замість трьох перемикачів. Коли людина хоче
         тиші, вона хоче її одразу, а не збирати з частин. */
      killMotion: () => setValue((v) => ({ ...normalize(v), motion: 'off', liveBg: false })),
      toggleNav: (to) => setValue((v) => {
        const cur = normalize(v);
        const on = cur.hiddenNav.includes(to);
        return {
          ...cur,
          hiddenNav: on ? cur.hiddenNav.filter((x) => x !== to) : [...cur.hiddenNav, to],
        };
      }),
      reset: () => setValue(DEFAULTS),
    }),
    [settings, meta.ready, setValue],
  );

  return (
    <Ctx.Provider value={api}>
      {/* framer слухає це й перестає анімувати все, що ним зроблено */}
      <MotionConfig reducedMotion={settings.motion === 'off' ? 'always' : 'never'}>
        {children}
      </MotionConfig>
    </Ctx.Provider>
  );
}

/* Поза провайдером повертаємо значення за замовчуванням, а не падаємо:
   компонент може опинитись на публічній сторінці, де налаштувань немає. */
export function useSettings() {
  return useContext(Ctx) || {
    ...DEFAULTS,
    ready: false,
    set: () => {},
    setTheme: () => {},
    killMotion: () => {},
    toggleNav: () => {},
    reset: () => {},
  };
}
