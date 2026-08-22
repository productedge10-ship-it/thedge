import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, RotateCcw, Eye, EyeOff, Check, Moon, Sun, ZapOff,
  User, Target, BookOpen, Palette, Sparkles, LayoutGrid,
} from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { useSettings } from '../../context/SettingsContext';
import { NAV, MOTION, FX, PSY, HIDEABLE, GOALS, goalById, OPEN_EVENT } from '../../lib/settings';
import { THEMES } from '../../lib/themes';

/* ==================================================================
   Налаштування.

   Три групи, і порядок у них не випадковий: спершу як до людини
   звертатись, потім скільки руху вона готова терпіти, і аж потім
   довгий список розділів. Найдовше — останнім, інакше вікно
   виглядає як таблиця, а не як налаштування.

   Ніякої кнопки «Зберегти». Кожен перемикач діє одразу й одразу
   їде в базу — стан, який треба підтверджувати, породжує питання
   «а воно збереглось?» і жодної користі не дає.
================================================================== */

/* Розділи. Порядок від «про мене» до «що прибрати»: спершу те, що
   людина хоче налаштувати одразу, і аж наприкінці довгий список
   пунктів меню. */
const TABS = [
  { id: 'profile', label: 'Профіль', icon: User, hint: 'Як до тебе звертатись' },
  { id: 'goal', label: 'Ціль тижня', icon: Target, hint: 'Те, що показує плашка «Тиждень» у Лаунчпаді' },
  { id: 'journal', label: 'Журнал', icon: BookOpen, hint: 'Скільки питань ставити після кожної угоди' },
  { id: 'look', label: 'Тема', icon: Palette, hint: 'Світла чи темна — з переходом по діагоналі' },
  { id: 'motion', label: 'Рух і світло', icon: Sparkles, hint: 'Скільки руху ти готовий терпіти за шість годин перед екраном' },
  { id: 'menu', label: 'Розділи', icon: LayoutGrid, hint: 'Прибери те, чим не користуєшся — дані лишаться' },
];

export default function SettingsModal() {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('profile');
  const [nick, setNick] = useState(s.nickname);

  useEffect(() => { setNick(s.nickname); }, [s.nickname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hiddenCount = s.hiddenNav.length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          className="fixed inset-0 z-[95] flex items-stretch justify-center p-0 sm:p-6"
          style={{ background: 'rgba(6,6,8,0.72)', backdropFilter: 'blur(14px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.995 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex w-full max-w-[1080px] overflow-hidden sm:rounded-3xl"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              boxShadow: '0 50px 140px -40px rgba(0,0,0,0.95)',
            }}
          >
            {/* ---------- рейка розділів ----------

                Довгий сувій із семи блоків читався як анкета: щоб
                дійти до розділів меню, треба було проїхати повз усе
                інше. Тепер зліва список, справа один блок — видно, з
                чого налаштування складаються, і нічого не гортається
                повз. */}
            <div
              className="hidden w-[248px] shrink-0 flex-col p-5 sm:flex"
              style={{ background: T.sunken, borderRight: `1px solid ${T.line}` }}
            >
              <h2
                className="mb-1 text-[19px] font-bold leading-none"
                style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}
              >
                Налаштування
              </h2>
              <p className="mb-5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.5 }}>
                Зміни діють одразу й переїжджають між пристроями
              </p>

              <div className="flex flex-col gap-0.5">
                {TABS.map((t) => {
                  const on = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-200"
                      style={{ color: on ? T.text : T.text3 }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                    >
                      {on && (
                        <motion.span
                          layoutId="set-lamp"
                          className="absolute inset-0 rounded-xl"
                          style={{
                            background: `rgba(${T.accRgb},0.12)`,
                            boxShadow: `inset 0 0 0 1px ${T.accLine}`,
                          }}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                      <t.icon size={15} strokeWidth={2.2} className="relative shrink-0" style={{ color: on ? T.acc : 'currentColor' }} />
                      <span className="relative text-[13.5px] font-semibold" style={{ fontFamily: T.sans }}>
                        {t.label}
                      </span>
                      {t.id === 'menu' && hiddenCount > 0 && (
                        <span
                          className="relative ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                          style={{ fontFamily: T.mono, background: T.surface, color: T.text4 }}
                        >
                          {hiddenCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={s.reset}
                className="mt-auto flex h-10 items-center gap-2 rounded-xl px-3 text-[12.5px] font-semibold transition-colors duration-200"
                style={{ fontFamily: T.sans, border: `1px solid ${T.line}`, color: T.text4 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
              >
                <RotateCcw size={13} strokeWidth={2.4} /> Повернути все як було
              </button>
            </div>

            {/* ---------- вміст ---------- */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div
                className="flex shrink-0 items-center gap-3 px-6 py-4"
                style={{ borderBottom: `1px solid ${T.line}` }}
              >
                <div className="min-w-0">
                  <div className="text-[16px] font-bold leading-none" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                    {TABS.find((t) => t.id === tab)?.label}
                  </div>
                  <div className="mt-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {TABS.find((t) => t.id === tab)?.hint}
                  </div>
                </div>

                <button
                  onClick={() => setOpen(false)}
                  className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-200"
                  style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              </div>

              {/* Мобільна рейка — горизонтальним рядком, бо збоку її нема куди подіти */}
              <div
                className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-2.5 sm:hidden"
                style={{ borderBottom: `1px solid ${T.line}` }}
              >
                {TABS.map((t) => {
                  const on = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                        border: `1px solid ${on ? T.accLine : T.line}`,
                        color: on ? T.acc : T.text3,
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
              {tab === 'profile' && (
              <>
              {/* ---------- як звертатись ---------- */}
              <Section title="Як до тебе звертатись">
                <input
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  onBlur={() => s.set({ nickname: nick.trim() })}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  maxLength={32}
                  placeholder="Нікнейм — інакше візьмемо початок пошти"
                  className="h-12 w-full rounded-xl px-4 text-[14px] outline-none"
                  style={{
                    fontFamily: T.sans,
                    background: T.sunken,
                    border: `1px solid ${T.line}`,
                    color: T.text,
                  }}
                />
              </Section>

              </>
              )}

              {tab === 'goal' && (
              <>
              {/* ---------- ціль на тиждень ---------- */}
              <Section
                title="Ціль на тиждень"
                hint="Те, що показує плашка «Тиждень» у Лаунчпаді"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {GOALS.map((g) => {
                    const on = (s.goal?.type || 'clean') === g.id;
                    return (
                      <button
                        key={g.id}
                        onClick={() => s.set({ goal: { type: g.id, value: on ? s.goal.value : g.def } })}
                        className="rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
                        style={{
                          background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                          border: `1px solid ${on ? T.accLine : T.line}`,
                        }}
                      >
                        <span className="block text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: on ? T.acc : T.text }}>
                          {g.label}
                        </span>
                        <span className="mt-0.5 block text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.45 }}>
                          {g.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Повзунок замість поля вводу: ціль на тиждень — це
                    вибір з десятка розумних значень, а не довільне
                    число, і клавіатура тут тільки заважає. */}
                {(s.goal?.type || 'clean') !== 'none' && (
                  <div
                    className="mt-2.5 flex items-center gap-3.5 rounded-xl px-3.5 py-3"
                    style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                  >
                    <span className="shrink-0 text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
                      Скільки
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={goalById(s.goal?.type).max}
                      step={1}
                      value={s.goal?.value ?? goalById(s.goal?.type).def}
                      onChange={(e) => s.set({ goal: { type: s.goal.type, value: Number(e.target.value) } })}
                      className="min-w-0 flex-1"
                      style={{ accentColor: T.acc }}
                    />
                    <span
                      className="w-[74px] shrink-0 text-right text-[14px] font-bold tabular-nums"
                      style={{ fontFamily: T.mono, color: T.acc }}
                    >
                      {s.goal?.value} {goalById(s.goal?.type).unit}
                    </span>
                  </div>
                )}
              </Section>

              </>
              )}

              {tab === 'journal' && (
              <>
              {/* ---------- глибина розбору ---------- */}
              <Section
                title="Розбір угоди"
                hint="Скільки питань про себе ставити після кожної угоди"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row">
                  {PSY.map((p) => {
                    const on = (s.psyMode || 'full') === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => s.set({ psyMode: p.id })}
                        className="flex-1 rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
                        style={{
                          background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                          border: `1px solid ${on ? T.accLine : T.line}`,
                        }}
                      >
                        <span className="block text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: on ? T.acc : T.text }}>
                          {p.label}
                        </span>
                        <span className="mt-0.5 block text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.4 }}>
                          {p.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.5 }}>
                  У короткому режимі решта питань лишається в угоді під розкриттям — просто перестає бути обовʼязковою.
                </p>
              </Section>

              </>
              )}

              {tab === 'look' && (
              <>
              {/* ---------- тема ---------- */}
              <Section title="Тема" hint="Перемикається з переходом по діагоналі — щоб не било по очах">
                <div className="flex gap-1.5">
                  {THEMES.map((th) => {
                    const on = s.theme === th.id;
                    const Ico = th.id === 'light' ? Sun : Moon;
                    return (
                      <button
                        key={th.id}
                        onClick={() => !on && s.setTheme(th.id)}
                        className="flex flex-1 items-center gap-2.5 rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
                        style={{
                          background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                          border: `1px solid ${on ? T.accLine : T.line}`,
                        }}
                      >
                        <Ico size={16} strokeWidth={2.3} style={{ color: on ? T.acc : T.text3 }} />
                        <span className="min-w-0">
                          <span
                            className="block text-[13.5px] font-bold"
                            style={{ fontFamily: T.sans, color: on ? T.acc : T.text }}
                          >
                            {th.label}
                          </span>
                          <span
                            className="mt-0.5 block text-[11.5px]"
                            style={{ fontFamily: T.sans, color: T.text4 }}
                          >
                            {th.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              </>
              )}

              {tab === 'motion' && (
              <>
              {/* ---------- рух ---------- */}
              <Section
                title="Анімації"
                hint="Скільки руху ти готовий терпіти за шість годин перед екраном"
              >
                {/* Окремий рубильник понад трьома режимами: коли людина
                    хоче тиші, вона хоче її одразу, а не збирати з частин */}
                <button
                  onClick={s.killMotion}
                  className="mb-2.5 flex h-11 w-full items-center gap-2.5 rounded-xl px-3.5 text-[13.5px] font-bold transition-colors duration-200"
                  style={{
                    fontFamily: T.sans,
                    background: T.sunken,
                    border: `1px solid ${T.line}`,
                    color: T.text2,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
                >
                  <ZapOff size={15} strokeWidth={2.4} /> Вимкнути всі анімації
                </button>

                <div className="flex flex-col gap-1.5 sm:flex-row">
                  {MOTION.map((m) => {
                    const on = s.motion === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => s.set({ motion: m.id })}
                        className="flex-1 rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
                        style={{
                          background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                          border: `1px solid ${on ? T.accLine : T.line}`,
                        }}
                      >
                        <span
                          className="block text-[13.5px] font-bold"
                          style={{ fontFamily: T.sans, color: on ? T.acc : T.text }}
                        >
                          {m.label}
                        </span>
                        <span
                          className="mt-0.5 block text-[11.5px]"
                          style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.4 }}
                        >
                          {m.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Перемикач гасне не тільки на «вимкнених», а й на
                    «спокійних»: той режим сам по собі прибирає фон, і
                    активний тумблер поруч обіцяв би те, чого не буде. */}
                <Toggle
                  label="Живий фон"
                  hint={s.motion === 'calm'
                    ? 'Спокійні анімації вже прибирають фон'
                    : 'Крапки, що дрейфують і розходяться від курсора'}
                  on={s.liveBg && s.motion === 'full'}
                  disabled={s.motion !== 'full'}
                  onClick={() => s.set({ liveBg: !s.liveBg })}
                />
              </Section>

              {/* ---------- світло за курсором ---------- */}
              <Section
                title="Світло за курсором"
                hint="Ореол, що йде за мишкою по картках. Окремо від анімацій — можна лишити рух і прибрати світло"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  {FX.map((f) => {
                    const off = s.motion === 'off';
                    const on = !off && s.fx === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => s.set({ fx: f.id })}
                        disabled={off}
                        className="rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
                        style={{
                          background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                          border: `1px solid ${on ? T.accLine : T.line}`,
                          opacity: off ? 0.45 : 1,
                          cursor: off ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <span className="flex items-center gap-2">
                          {/* Смужка яскравості замість опису словами:
                              різницю між «ледь помітно» і «помірно»
                              простіше побачити, ніж прочитати. */}
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              background: f.value
                                ? `rgba(${T.accRgb},${Math.max(0.18, f.value)})`
                                : 'transparent',
                              border: `1px solid ${f.value ? T.accLine : T.lineHi}`,
                            }}
                          />
                          <span className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: on ? T.acc : T.text }}>
                            {f.label}
                          </span>
                        </span>
                        <span
                          className="mt-0.5 block text-[11.5px]"
                          style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.4 }}
                        >
                          {f.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {s.motion === 'off' && (
                  <p className="mt-2.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.5 }}>
                    Анімації вимкнені — світло теж не вмикається. Поверни рух, щоб налаштувати яскравість.
                  </p>
                )}
              </Section>

              </>
              )}

              {tab === 'menu' && (
              <>
              {/* ---------- розділи ---------- */}
              <Section
                title="Розділи в меню"
                hint={hiddenCount
                  ? `${hiddenCount} прибрано. Сховане не видаляється — дані лишаються, зникає тільки пункт.`
                  : 'Прибери те, чим не користуєшся. Дані лишаться, зникне тільки пункт меню.'}
              >
                <div className="flex flex-col gap-4">
                  {NAV.map((g) => (
                    <div key={g.group}>
                      <div
                        className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]"
                        style={{ fontFamily: T.sans, color: T.text4 }}
                      >
                        {g.group}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {g.items.map((it) => {
                          const canHide = HIDEABLE.some((h) => h.to === it.to);
                          const off = s.hiddenNav.includes(it.to);

                          return (
                            <button
                              key={it.to}
                              disabled={!canHide}
                              onClick={() => s.toggleNav(it.to)}
                              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-200"
                              style={{
                                fontFamily: T.sans,
                                background: off ? 'transparent' : T.sunken,
                                border: `1px ${off ? 'dashed' : 'solid'} ${T.line}`,
                                color: off ? T.text4 : T.text2,
                                cursor: canHide ? 'pointer' : 'default',
                                opacity: canHide ? 1 : 0.55,
                              }}
                            >
                              {off
                                ? <EyeOff size={13} strokeWidth={2.3} />
                                : <Eye size={13} strokeWidth={2.3} />}
                              {it.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              </>
              )}
            </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="mb-6 last:mb-0">
      <h3
        className="mb-1 text-[14.5px] font-bold"
        style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}
      >
        {title}
      </h3>
      {hint && (
        <p className="mb-3 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.55 }}>
          {hint}
        </p>
      )}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Toggle({ label, hint, on, disabled, onClick }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="mt-2 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors duration-200"
      style={{
        background: T.sunken,
        border: `1px solid ${T.line}`,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
          {label}
        </span>
        <span className="mt-0.5 block text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {hint}
        </span>
      </span>

      <span
        className="ml-auto grid h-6 w-11 shrink-0 place-items-center rounded-full transition-colors duration-200"
        style={{ background: on ? T.acc : T.line }}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className="grid h-5 w-5 place-items-center rounded-full"
          style={{
            background: on ? 'var(--edge-bg, #0A0A0C)' : T.text4,
            marginLeft: on ? 20 : -20,
          }}
        >
          {on && <Check size={11} strokeWidth={3.4} style={{ color: T.acc }} />}
        </motion.span>
      </span>
    </button>
  );
}
