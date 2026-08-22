import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Radio } from 'lucide-react';
import TdaBlock from './TdaBlock';
import { T, EASE, SPRING } from './planTheme';

export default function UpdatesList({ updates, onAdd, onSave }) {
  const empty = updates.length === 0;

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <motion.button
          onClick={onAdd}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={SPRING}
          className="group flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold no-print"
          style={{
            background: `rgba(${T.accRgb},0.10)`,
            border: `1px solid rgba(${T.accRgb},0.25)`,
            color: T.acc,
            fontFamily: T.sans,
          }}
        >
          <Plus size={14} strokeWidth={3} className="transition-transform duration-300 group-hover:rotate-90" />
          Додати апдейт
        </motion.button>

        {!empty && (
          <span
            className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums"
            style={{ fontFamily: T.sans, color: T.text3 }}
          >
            {updates.length} {updates.length === 1 ? 'запис' : 'записів'}
          </span>
        )}
      </div>

      {empty ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center"
          style={{ background: T.sunken, border: `1px dashed ${T.line}` }}
        >
          <Radio size={24} strokeWidth={1.6} style={{ color: T.text4 }} />
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold" style={{ color: T.text2, fontFamily: T.sans }}>
              Поки що тихо
            </span>
            <span className="max-w-[320px] text-[14px] font-medium leading-relaxed" style={{ color: T.text4 }}>
              Фіксуй тут зміни по ходу сесії — коли структура ламається або ринок іде не за планом.
            </span>
          </div>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {updates.map((u) => (
              <motion.div
                layout
                key={u.id}
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <TdaBlock
                  id={u.id}
                  tf={u.tf}
                  image={u.image}
                  text={u.text}
                  isDimmed={u.isDimmed}
                  onSave={onSave}
                  eyebrow={u.date}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
