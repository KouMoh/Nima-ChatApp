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
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1, width: 400 }}
          exit={{ x: 400, opacity: 0 }}
          className="fixed inset-y-0 right-0 lg:relative border-l border-[#27272a] bg-[#0a0a0a] flex flex-col overflow-hidden z-40 transition-all duration-300"
        >
          <div className="p-6 flex flex-col gap-6 h-full">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#3b82f6]" />
                Case Binder
              </h2>
              <button 
                onClick={onClose} 
                className="text-zinc-500 hover:text-white p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                id="close-findings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8">
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Legal Insights & Findings</p>
                  <span className="text-[10px] bg-[#3b82f6]/10 text-[#3b82f6] px-2 py-0.5 rounded-full border border-[#3b82f6]/20 font-bold uppercase">AI Synthesized</span>
                </div>
                
                {findings ? (
                   <div className="bg-[#18181b] border border-[#27272a] p-4 rounded-xl text-zinc-300 leading-relaxed whitespace-pre-wrap font-serif italic shadow-inner text-sm">
                      {findings}
                   </div>
                ) : (
                  <div className="text-center py-16 border border-dashed border-zinc-800 rounded-2xl flex flex-col items-center gap-4">
                    <MessageSquare className="w-10 h-10 text-zinc-800" />
                    <p className="text-zinc-600 text-xs italic max-w-[180px]">Continue the discussion to generate relevant legal findings and summaries.</p>
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Case Documents</p>
                <div className="space-y-2">
                  <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center justify-center text-zinc-600 italic text-xs">
                    No documents attached to this case node.
                  </div>
                </div>
              </section>
            </div>

            <div className="pt-6 border-t border-zinc-800 mt-auto">
              <button 
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#3b82f6] hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                id="export-findings"
              >
                <Download className="w-4 h-4" />
                Export Case Summary
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
