import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, MessageSquare, FileText, Download } from 'lucide-react';

interface FindingsPanelProps {
  findings: string;
  isOpen: boolean;
  onClose: () => void;
}

export const FindingsPanel: React.FC<FindingsPanelProps> = ({ findings, isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-y-0 right-0 lg:relative w-full sm:w-[400px] border-l border-white/5 bg-black/50 lg:bg-black/20 backdrop-blur-3xl flex flex-col overflow-hidden z-40 shadow-[-20px_0_50px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="p-8 flex flex-col gap-8 h-full">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black uppercase tracking-[-2px] flex items-center gap-3 italic">
                <Sparkles className="w-6 h-6 text-indigo-500" />
                Case Binder
              </h2>
              <button 
                onClick={onClose} 
                className="text-zinc-600 hover:text-white p-3 hover:bg-white/5 rounded-2xl transition-all"
                id="close-findings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-10">
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-700 text-[10px] font-black uppercase tracking-[4px]">Inference Stream</p>
                  <span className="text-[9px] bg-indigo-500/10 text-indigo-500 px-3 py-1 rounded-full border border-indigo-500/20 font-black uppercase tracking-widest shadow-inner">AI Synthesized</span>
                </div>
                
                {findings ? (
                   <div className="bg-white/[0.03] border border-white/5 p-6 rounded-[28px] text-zinc-100 leading-relaxed whitespace-pre-wrap font-serif italic shadow-2xl text-base tracking-tight border-glow">
                      {findings}
                   </div>
                ) : (
                  <div className="text-center py-24 border border-dashed border-white/5 rounded-[40px] flex flex-col items-center gap-6 group">
                    <MessageSquare className="w-12 h-12 text-zinc-800 group-hover:text-indigo-900 transition-colors" />
                    <p className="text-zinc-600 text-xs italic font-medium max-w-[200px] leading-relaxed">System awaiting cognitive input to hypothesize legal findings.</p>
                  </div>
                )}
              </section>

              <section className="space-y-6">
                <p className="text-zinc-700 text-[10px] font-black uppercase tracking-[4px]">Forensic Archives</p>
                <div className="space-y-3">
                  <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[28px] flex items-center justify-center text-zinc-700 italic text-[10px] font-medium tracking-tight">
                    Repository empty. No artifacts uploaded.
                  </div>
                </div>
              </section>
            </div>

            <div className="pt-8 border-t border-white/5 mt-auto">
              <button 
                className="w-full flex items-center justify-center gap-4 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[24px] text-[10px] font-black uppercase tracking-[4px] transition-all shadow-xl shadow-indigo-600/20 active:scale-95 group"
                id="export-findings"
              >
                <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                Export Forensic Brief
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
