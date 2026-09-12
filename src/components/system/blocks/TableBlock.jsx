import { T } from '../../../lib/theme';

/* ==================================================================
   Таблиця (макет «System Section v2»).
   Перший рядок — шапка (моноширинний лейбл). Рамок і заливки немає,
   лише hairline під шапкою й між рядками. Колонка/рядок видаляються
   хрестиком, що зʼявляється при наведенні на клітинку.
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

  const delBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, borderRadius: 5,
    background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text4,
    fontSize: 8, cursor: 'pointer',
  };

  return (
    <div className="group/table w-full">
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group/row">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="group/cell relative"
                    style={{
                      padding: 0,
                      borderBottom: r === 0 ? `1px solid ${T.lineHi}` : `1px solid ${T.line}`,
                    }}
                  >
                    {r === 0 && cols > 1 && (
                      <button
                        onClick={() => delCol(c)}
                        title="Прибрати колонку"
                        className="absolute -top-[9px] right-1 z-10 opacity-0 transition-opacity duration-150 group-hover/cell:opacity-100"
                        style={delBtn}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                      >
                        ✕
                      </button>
                    )}
                    {r > 0 && c === cols - 1 && rows.length > 2 && (
                      <button
                        onClick={() => delRow(r)}
                        title="Прибрати рядок"
                        className="absolute right-[-30px] top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
                        style={{ ...delBtn, width: 19, height: 19 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                      >
                        ✕
                      </button>
                    )}

                    <input
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      placeholder={r === 0 ? 'Колонка' : '—'}
                      className="w-full bg-transparent outline-none transition-colors duration-150 placeholder:opacity-40"
                      style={
                        r === 0
                          ? {
                              fontFamily: T.mono,
                              fontSize: 10,
                              fontWeight: 400,
                              letterSpacing: '0.22em',
                              textTransform: 'uppercase',
                              color: T.text4,
                              padding: '0 16px 12px 0',
                            }
                          : {
                              fontFamily: c === 0 ? T.mono : T.sans,
                              fontSize: c === 0 ? 14 : 15.5,
                              fontWeight: c === 0 ? 500 : 400,
                              color: c === 0 ? T.text : T.text2,
                              padding: '16px 16px 16px 0',
                            }
                      }
                      onFocus={(e) => (e.currentTarget.style.background = `rgba(${T.accRgb},0.05)`)}
                      onBlur={(e) => (e.currentTarget.style.background = 'transparent')}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3.5 flex gap-2">
        <button
          onClick={addRow}
          className="rounded-[9px] px-[14px] py-[8px] text-[12.5px] font-medium transition-colors duration-150"
          style={{ fontFamily: T.sans, color: T.acc, background: `rgba(${T.accRgb},0.08)`, border: `1px solid rgba(${T.accRgb},0.28)` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.accRgb},0.16)`; e.currentTarget.style.color = '#b3a8ff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `rgba(${T.accRgb},0.08)`; e.currentTarget.style.color = T.acc; }}
        >
          + рядок
        </button>
        <button
          onClick={addCol}
          className="rounded-[9px] px-[14px] py-[8px] text-[12.5px] transition-colors duration-150"
          style={{ fontFamily: T.sans, fontWeight: 400, color: T.text4, background: 'transparent', border: `1px solid ${T.line}` }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
        >
          + колонку
        </button>
      </div>
    </div>
  );
}
