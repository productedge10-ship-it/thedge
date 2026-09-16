// 1. React та анімації
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 2. Іконки (Lucide)
import { Send, X, Clock, Loader2, AlertCircle, Timer } from 'lucide-react';

// 3. База даних та Контекст (шляхи оновлено під нову папку)
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// 4. Утиліти
import { notify } from '../../utils/notify';
import { openSettings } from '../../lib/settings';

const PRESETS = [
  { label: '10s (Тест)', ms: 10 * 1000 },
  { label: '15m', ms: 15 * 60 * 1000 },
  { label: '30m', ms: 30 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '2h', ms: 120 * 60 * 1000 }
];

export default function TgAlertModal({ isOpen, onClose, pair }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasChatId, setHasChatId] = useState(false);
  
  // Стани для таймера
  const [message, setMessage] = useState('');
  const [delayMs, setDelayMs] = useState(30 * 60 * 1000);
  const [isCustom, setIsCustom] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');

  useEffect(() => {
    if (isOpen) checkConnection();
  }, [isOpen]);

  async function checkConnection() {
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('tg_chat_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      setHasChatId(!!data?.tg_chat_id);
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  }


  const handleSaveAlert = async (e) => {
    e.preventDefault();
    const finalDelayMs = isCustom ? (customMinutes || 0) * 60 * 1000 : delayMs;

    setLoading(true);
    try {
      const alertTime = new Date(Date.now() + finalDelayMs).toISOString();
      const { error } = await supabase.from('tg_alerts').insert([{
        user_id: user.id,
        pair: pair || 'Unknown',
        message: message || 'Час перевірити графік!',
        alert_time: alertTime,
        is_sent: false
      }]);

      if (error) throw error;
      notify.success('Таймер встановлено');
      onClose();
      setMessage('');
    } catch (err) {
      notify.error('Помилка', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#111] border border-[#222] w-full max-w-[380px] rounded-3xl shadow-2xl relative z-10 overflow-hidden font-sans"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
        
        <div className="p-8">
          {checking ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Синхронізація з базою...</span>
            </div>
          ) : !hasChatId ? (
            /* Підключення переїхало в налаштування.

               Тут воно просило вставити свій chat_id руками — і це було
               незручно (його ще треба десь дізнатись) та діряво
               (вставивши чужий, можна було отримувати чужі сповіщення).
               Тепер привʼязка робиться одноразовим кодом у
               «Налаштування → Telegram», а звідси туди просто ведемо. */
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-500">
                <Send size={28} />
              </div>

              <div>
                <h3 className="mb-2 text-xl font-black uppercase tracking-tight text-[var(--edge-text)]">
                  Telegram не підключений
                </h3>
                <p className="text-sm font-medium leading-relaxed text-gray-400">
                  Нагадування приходять у чат — спершу треба привʼязати бота
                  до акаунта. Це робиться один раз і займає пів хвилини.
                </p>
              </div>

              <button
                onClick={() => { onClose(); openSettings('telegram'); }}
                className="w-full rounded-xl bg-blue-600 py-4 text-xs font-black uppercase text-[var(--edge-text)] shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 active:scale-95"
              >
                Відкрити налаштування
              </button>
            </div>
          ) : (
            // ==========================================
            // КРОК 2: НАЛАШТУВАННЯ ТАЙМЕРА (Якщо ID є)
            // ==========================================
            <form onSubmit={handleSaveAlert} className="space-y-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[var(--edge-surface-hi)] rounded-full flex items-center justify-center border border-[#333] text-blue-500 shadow-inner">
                    <Send size={20} className="-ml-0.5 mt-0.5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[var(--edge-text)] uppercase tracking-wider leading-none mb-1.5">TG Alert</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{pair || 'ПАРА НЕ ВИБРАНА'}</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-[var(--edge-text)] transition-colors"><X size={16} /></button>
              </div>

              <div className="space-y-4">
                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={12}/> Час сповіщення
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.label} type="button"
                      onClick={() => { setIsCustom(false); setDelayMs(p.ms); }}
                      className={`py-2.5 rounded-xl text-xs font-black transition-all border ${!isCustom && delayMs === p.ms ? 'bg-blue-600 text-[var(--edge-text)] border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-[var(--edge-surface-hi)] text-gray-400 border-[#333] hover:bg-[#222]'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustom(true)}
                    className={`py-2.5 rounded-xl text-xs font-black transition-all border ${isCustom ? 'bg-blue-600 text-[var(--edge-text)] border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-[var(--edge-surface-hi)] text-gray-400 border-[#333] hover:bg-[#222]'}`}
                  >
                    СВІЙ ЧАС
                  </button>
                </div>

                <AnimatePresence>
                  {isCustom && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="flex items-center gap-3 bg-[var(--edge-surface-hi)] border border-[#333] rounded-xl p-2.5 focus-within:border-blue-500 transition-colors">
                        <Timer size={16} className="text-gray-500 ml-2" />
                        <input
                          type="number"
                          value={customMinutes}
                          onChange={(e) => setCustomMinutes(e.target.value)}
                          placeholder="Хвилини..."
                          className="w-full bg-transparent outline-none text-[var(--edge-text)] text-sm font-black"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-3">
                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <AlertCircle size={12}/> Коментар
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Добавте свій опис"
                  className="w-full bg-[var(--edge-surface-hi)] border border-[#333] rounded-2xl p-4 text-sm text-gray-300 outline-none focus:border-[#555] transition-colors resize-none h-24 placeholder:text-gray-600"
                />
              </div>

              <button 
                type="submit" 
                disabled={loading || (isCustom && !customMinutes)} 
                className="w-full bg-[var(--edge-info)] hover:bg-blue-500 text-[var(--edge-text)] font-black uppercase tracking-widest py-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Поставити Таймер
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}