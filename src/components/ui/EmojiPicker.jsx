import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { T } from '../../lib/theme';
import { EMOJI_GROUPS, searchEmoji } from '../../lib/emoji';

/* ==================================================================
   Вибір емодзі.

   Зроблено як системна панель на маку: пошук угорі, вкладки груп,
   сітка. Різниця одна, і вона навмисна — тут не кілька тисяч
   символів, а сотня відібраних: у довгому списку доводиться шукати
   навіть тоді, коли точно знаєш, чого хочеш.

   Пошук — українською, за змістом («графік», «борщ», «ризик»), бо
   людина думає словом, а не назвою символа з таблиці Unicode.
================================================================== */

export default function EmojiPicker({ value, onPick, onClear, color = T.acc, onClose }) {
  const [tab, setTab] = useState(EMOJI_GROUPS[0].id);
  const [q, setQ] = useState('');
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  /* Клік повз панель закриває її — інакше вона лишалась би висіти
     над формою, поки не вибереш щось, а «нічого не вибирати» це теж
     відповідь. */
  useEffect(() => {
    if (!onClose) return undefined;
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('keydown', esc, true);
    };
  }, [onClose]);

  const found = useMemo(() => searchEmoji(q), [q]);
  const items = found || (EMOJI_GROUPS.find((g) => g.id === tab)?.items || []).map(([e, k]) => ({ e, k }));

  return (
    <div
      ref={boxRef}
      className="w-[292px] overflow-hidden rounded-2xl"
      style={{ background: '#14141b', border: '1px solid #2c2c38', boxShadow: `0 28px 60px -20px #000, 0 0 0 1px ${color}1a` }}
    >
      <div className="p-2.5 pb-0">
        <div
          className="flex h-9 items-center gap-2 rounded-[10px] px-2.5"
          style={{ background: '#ffffff08', border: '1px solid #22222c' }}
        >
          <Search size={13} strokeWidth={1.9} style={{ color: '#8b8998', flex: 'none' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук: графік, ідея, борщ…"
            className="w-full border-none bg-transparent text-[12.5px] outline-none"
            style={{ fontFamily: T.sans, color: T.text }}
          />
          {q && (
            <button onClick={() => setQ('')} style={{ color: '#8b8998', flex: 'none' }}>
              <X size={12} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>

      {!found && (
        <div className="flex gap-1 px-2.5 pt-2.5">
          {EMOJI_GROUPS.map((g) => {
            const on = tab === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setTab(g.id)}
                className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold"
                style={{
                  fontFamily: T.sans,
                  background: on ? `${color}20` : 'transparent',
                  border: `1px solid ${on ? `${color}5e` : 'transparent'}`,
                  color: on ? '#ffffff' : '#8b8998',
                  transition: 'all .14s',
                }}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="max-h-[196px] overflow-auto p-2.5">
        {items.length === 0 ? (
          <div className="px-1 py-6 text-center text-[12px]" style={{ fontFamily: T.sans, color: '#6f6d7d' }}>
            Нічого не знайшлось
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {items.map(({ e }) => {
              const on = value === e;
              return (
                <button
                  key={e}
                  onClick={() => onPick(e)}
                  className="grid h-8 place-items-center rounded-lg text-[17px]"
                  style={{
                    background: on ? `${color}24` : 'transparent',
                    border: `1px solid ${on ? `${color}73` : 'transparent'}`,
                    transition: 'all .12s',
                  }}
                  onMouseEnter={(ev) => { if (!on) ev.currentTarget.style.background = '#ffffff0f'; }}
                  onMouseLeave={(ev) => { if (!on) ev.currentTarget.style.background = 'transparent'; }}
                >
                  {e}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {onClear && (
        <button
          onClick={onClear}
          className="w-full py-2.5 text-[12px] font-semibold"
          style={{ fontFamily: T.sans, borderTop: '1px solid #22222c', color: value ? '#b3b1c0' : '#6f6d7d' }}
        >
          Без емодзі — звичайна іконка
        </button>
      )}
    </div>
  );
}
