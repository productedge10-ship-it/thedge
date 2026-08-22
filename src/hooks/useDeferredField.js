import { useCallback, useEffect, useRef, useState } from 'react';

/* ==================================================================
   Поле, яке не гальмує.

   Проблема: кожна натиснута клавіша піднімала стан у DailyPlan, а той
   перемальовував усе — чотири блоки ТДА з base64-картинками, список
   оновлень, таби, прогрес. На довгих планах ввід відчутно затинався.

   Рішення: текст живе локально й малюється миттєво, а нагору їде
   через паузу в наборі. Значення ззовні (перемикання плану, завантаження
   з бази) підхоплюється — але тільки якщо це справді чуже значення,
   а не відлуння того, що ми самі щойно віддали.
================================================================== */

export default function useDeferredField(value, onCommit, delay = 350) {
  const [draft, setDraft] = useState(value ?? '');
  const pushedRef = useRef(value ?? '');   // останнє, що ми віддали нагору
  const timerRef = useRef(null);
  const commitRef = useRef(onCommit);
  const draftRef = useRef(draft);

  commitRef.current = onCommit;
  draftRef.current = draft;

  /* Значення прийшло ззовні */
  useEffect(() => {
    const incoming = value ?? '';
    if (incoming !== pushedRef.current) {
      pushedRef.current = incoming;
      setDraft(incoming);
    }
  }, [value]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const v = draftRef.current;
    if (v !== pushedRef.current) {
      pushedRef.current = v;
      commitRef.current(v);
    }
  }, []);

  const onType = useCallback((v) => {
    setDraft(v);
    draftRef.current = v;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pushedRef.current = draftRef.current;
      commitRef.current(draftRef.current);
    }, delay);
  }, [delay]);

  /* Розмонтування — останній шанс віддати недописане */
  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      if (draftRef.current !== pushedRef.current) commitRef.current(draftRef.current);
    }
  }, []);

  /* valueRef — актуальний текст просто зараз. Потрібен сусіднім діям
     (вставка картинки, приглушення), бо проп ще тримає старе значення,
     поки не спрацював дебаунс, і вони затирали щойно надруковане. */
  return { draft, onType, flush, valueRef: draftRef };
}
