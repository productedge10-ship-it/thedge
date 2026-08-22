import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ textToCopy, size = 16, className = "text-zinc-500 hover:text-[var(--edge-text)] transition-colors p-1.5", style }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = (e) => {
    e.stopPropagation();
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className={className} style={style} title="Скопіювати">
      {copied ? <Check size={size} className="text-emerald-500" /> : <Copy size={size} />}
    </button>
  );
}

export function InputWithCopy({ label, value, setValue, dotColor, textColor }) {
  const noSpinnerClass = "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]";
  
  return (
    <div className="relative flex items-center bg-black/40 border border-[#333] rounded-xl overflow-hidden focus-within:border-blue-500/50 transition-all">
      <div className={`absolute left-4 w-2 h-2 rounded-full ${dotColor} shadow-[0_0_10px_currentColor]`}></div>
      <input 
        type="number" 
        value={value} 
        onChange={(e) => setValue(e.target.value)} 
        className={`w-full bg-transparent pl-10 pr-12 py-4 ${textColor} font-mono text-sm outline-none placeholder:text-zinc-700 ${noSpinnerClass}`} 
        placeholder={label} 
      />
      <div className="absolute right-3 flex items-center justify-center">
        {value && <CopyButton textToCopy={value} />}
      </div>
    </div>
  );
}