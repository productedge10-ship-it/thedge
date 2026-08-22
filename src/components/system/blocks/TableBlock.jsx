import { Plus, X } from 'lucide-react';
import { T } from '../../../lib/theme';

/* ==================================================================
   Таблиця.
   Перший рядок — шапка. Клітинки редагуються прямо на місці,
   рядки й колонки додаються кнопками по краях, зайві прибираються
   хрестиком, який зʼявляється тільки при наведенні.
================================================================== */

export default function TableBlock({ block, onChange }) {
  const rows = block.rows?.length ? block.rows : [['', ''], ['', '']];
  const cols = rows[0]?.length || 2;

  const setCell = (r, c, v) => {
    const next = rows.map((row) => [...row]);
    next[r][c] = v;
    onChange({ rows: next });
  };

  const addRow = () => onChange({ rows: [...rows, Array(cols).fill('')] });
  const addCol = () => onChange({ rows: rows.map((r) => [...r, '']) });
  const delRow = (i) => rows.length > 2 && onChange({ rows: rows.filter((_, x) => x !== i) });
  const delCol = (i) => cols > 1 && onChange({ rows: rows.map((r) => r.filter((_, x) => x !== i)) });

  return (
    <div className="group/table w-full">
      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${T.line}` }}>
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group/row">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="relative p-0"
                    style={{
                      borderRight: c < cols - 1 ? `1px solid ${T.line}` : 'none',
                      borderBottom: r < rows.length - 1 ? `1px solid ${T.line}` : 'none',
                      background: r === 0 ? T.sunken : 'transparent',
                    }}
                  >
                    {/* прибрати колонку */}
                    {r === 0 && cols > 1 && (
                      <button
                        onClick={() => delCol(c)}
                        title="Прибрати колонку"
                        className="absolute -top-2 left-1/2 z-10 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-md opacity-0 transition-opacity duration-200 group-hover/table:opacity-100"
                        style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                      >
                        <X size={10} strokeWidth={3} />
                      </button>
                    )}

                    <input
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      placeholder={r === 0 ? 'Колонка' : '—'}
                      className="w-full bg-transparent px-3 py-2.5 text-[14px] outline-none transition-colors duration-200"
                      style={{
                        fontFamily: T.sans,
                        color: r === 0 ? T.text : T.text2,
                        fontWeight: r === 0 ? 700 : 400,
                      }}
                      onFocus={(e) => (e.currentTarget.style.background = `rgba(${T.accRgb},0.05)`)}
                      onBlur={(e) => (e.currentTarget.style.background = 'transparent')}
                    />
                  </td>
                ))}

                {/* прибрати рядок */}
                <td className="w-0 p-0">
                  {r > 0 && rows.length > 2 && (
                    <button
                      onClick={() => delRow(r)}
                      title="Прибрати рядок"
                      className="absolute -ml-1 grid h-5 w-5 place-items-center rounded-md opacity-0 transition-opacity duration-200 group-hover/table:opacity-100"
                      style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                    >
                      <X size={10} strokeWidth={3} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex gap-2 opacity-0 transition-opacity duration-200 group-hover/table:opacity-100">
        {[
          { label: 'рядок', fn: addRow },
          { label: 'колонку', fn: addCol },
        ].map((a) => (
          <button
            key={a.label}
            onClick={a.fn}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors duration-200"
            style={{ fontFamily: T.sans, color: T.text4, border: `1px solid ${T.line}` }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
          >
            <Plus size={12} strokeWidth={2.8} /> {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
