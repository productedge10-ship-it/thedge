import { Globe, Check } from 'lucide-react';
import { T } from '../../lib/theme';
import { LANGS, useLang } from '../../lib/i18n';
import Popover from '../ui/Popover';

/* ==================================================================
   Перемикач мов.

   Не три прапорці в ряд: прапор — це країна, а не мова, і українець
   у Польщі щоразу тикає не туди. Тут короткий код поточної мови й
   випадайка з повними назвами.
================================================================== */

export default function LangSwitcher() {
  const { lang, setLang } = useLang();
  const current = LANGS.find((l) => l.id === lang) || LANGS[0];

  return (
    <Popover
      align="right"
      renderTrigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-label="Change language"
          className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            background: open ? T.surfaceHi : 'transparent',
            border: `1px solid ${open ? T.lineHi : T.line}`,
            color: open ? T.text : T.text3,
          }}
          onMouseEnter={(e) => { if (!open) { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; } }}
          onMouseLeave={(e) => { if (!open) { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; } }}
        >
          <Globe size={14} strokeWidth={2.2} />
          {current.short}
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="w-[190px] rounded-2xl p-1.5"
          style={{
            background: T.surface,
            border: `1px solid ${T.lineHi}`,
            boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)',
          }}
        >
          {LANGS.map((l) => {
            const on = l.id === lang;
            return (
              <button
                key={l.id}
                onClick={() => { setLang(l.id); close(); }}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors duration-150"
                style={{
                  fontFamily: T.sans,
                  color: on ? T.text : T.text3,
                  background: on ? `rgba(${T.accRgb},0.1)` : 'transparent',
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  className="w-[26px] shrink-0 text-[11.5px] font-bold"
                  style={{ fontFamily: T.mono, color: on ? T.acc : T.text4 }}
                >
                  {l.short}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                {on && <Check size={14} strokeWidth={3} style={{ color: T.acc }} />}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
