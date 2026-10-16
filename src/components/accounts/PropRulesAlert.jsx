import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';
import { T } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { loadPropContext, sameFirm, ruleText, PROP_CHANGE_EVENT as EVENT } from '../../lib/propRules';

/* ==================================================================
   Модалка «твій проп змінив правила».

   Показуємо сама лише серйозні (major) зміни, схвалені адміном, для
   фірм, де в людини є активний рахунок, і лише ті, що з'явились після
   відкриття рахунку. «Зрозуміло» пише prop_rule_seen — більше не
   вискакує. Відкрити повторно можна зі сторінки «Правила мого пропа»
   (openPropChange).
================================================================== */


export default function PropRulesAlert() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [change, setChange] = useState(null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    const on = (e) => { setManual(true); setChange(e.detail); };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    (async () => {
      const ctx = await loadPropContext(user.id);
      if (!alive || !ctx?.changes?.length) return;
      const { data: seen } = await supabase.from('prop_rule_seen').select('change_id').eq('user_id', user.id);
      const done = new Set((seen || []).map((s) => s.change_id));
      const fresh = ctx.changes.find((c) => c.severity === 'major' && !done.has(c.id)
        && ctx.accounts.some((a) => sameFirm(a.firm_name, c.firm)
          && (!a.rules_program || a.rules_program === c.program)
          && new Date(c.decided_at || c.created_at) > new Date(a.created_at)));
      if (alive && fresh) { setManual(false); setChange(fresh); }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const close = async () => {
    const c = change;
    setChange(null);
    if (c && user?.id && !manual) {
      await supabase.from('prop_rule_seen').upsert({ user_id: user.id, change_id: c.id }, { onConflict: 'user_id,change_id', ignoreDuplicates: true });
    }
  };

  return createPortal(
    <AnimatePresence>
      {change && (
        <motion.div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }} onClick={close}>
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[560px] overflow-hidden"
            style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 22 }}
            role="dialog" aria-modal="true"
          >
            <div style={{ height: 3, background: T.warn }} />
            <button type="button" onClick={close} aria-label="Закрити" className="absolute right-4 top-4 rounded-lg p-1.5" style={{ color: T.text3 }}>
              <X size={18} />
            </button>
            <div className="p-6 sm:p-7">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(var(--edge-warn-rgb),0.1)', border: '1px solid rgba(var(--edge-warn-rgb),0.3)' }}>
                <ShieldAlert size={20} style={{ color: T.warn }} />
              </div>
              <h2 className="m-0 text-[21px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text }}>
                {change.firm} змінив правила
              </h2>
              <p className="mb-0 mt-1 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>
                Програма {change.program} · {new Date(change.decided_at || change.created_at).toLocaleDateString('uk-UA')}
              </p>

              {change.conclusion && (
                <p className="mb-0 mt-4 text-[15px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>{change.conclusion}</p>
              )}

              <div className="mt-4 overflow-hidden rounded-xl" style={{ border: '1px solid var(--edge-line)' }}>
                <div className="grid grid-cols-[1.2fr_1fr_1fr] text-[11px] font-bold uppercase tracking-wider" style={{ color: T.text4, background: 'var(--edge-sunken)', fontFamily: T.sans }}>
                  <div className="px-3 py-2">Правило</div><div className="px-3 py-2">Було</div><div className="px-3 py-2">Стало</div>
                </div>
                {(change.diff || []).map((d) => (
                  <div key={d.field} className="grid grid-cols-[1.2fr_1fr_1fr] text-[13px]" style={{ borderTop: '1px solid var(--edge-line)', fontFamily: T.sans }}>
                    <div className="px-3 py-2.5" style={{ color: T.text3 }}>{d.label}</div>
                    <div className="px-3 py-2.5" style={{ color: T.text4, textDecoration: 'line-through' }}>{ruleText(d.field, d.old)}</div>
                    <div className="px-3 py-2.5 font-semibold" style={{ color: T.text }}>{ruleText(d.field, d.new)}</div>
                  </div>
                ))}
              </div>

              <p className="mb-0 mt-3 text-[12px]" style={{ color: T.text4, fontFamily: T.sans }}>
                Зазвичай нові правила діють для рахунків, куплених після зміни. Перевір у кабінеті пропа, чи стосується це твого.
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <button type="button" onClick={close} className="h-11 rounded-xl px-5 text-[14px] font-bold" style={{ background: T.acc, color: '#0A0A0C', fontFamily: T.sans }}>
                  Зрозуміло
                </button>
                <button type="button" onClick={() => { close(); navigate('/prop-rules'); }} className="h-11 rounded-xl px-5 text-[14px] font-bold"
                  style={{ background: 'transparent', color: T.text2, border: '1px solid var(--edge-line)', fontFamily: T.sans }}>
                  Усі правила пропа
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
