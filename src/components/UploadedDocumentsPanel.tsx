import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Upload, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';

interface UploadedDocumentsPanelProps {
  documents: any[];
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

export const UploadedDocumentsPanel: React.FC<UploadedDocumentsPanelProps> = ({ 
  documents, isOpen, onClose, onUpload, isUploading 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    e.target.value = '';
  };

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
              <h2 className="text-2xl font-black uppercase tracking-[-2px] flex items-center gap-3 italic text-white">
                <FileText className="w-6 h-6 text-zinc-400" />
                Uploads
              </h2>
              <button 
                onClick={onClose} 
                className="text-zinc-600 hover:text-white p-3 hover:bg-white/5 rounded-2xl transition-all"
                title="Close panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
              {documents.length === 0 ? (
                <div className="text-center py-24 border border-dashed border-white/5 rounded-[40px] flex flex-col items-center gap-6 group">
                  <FileText className="w-12 h-12 text-zinc-800 transition-colors" />
                  <p className="text-zinc-600 text-xs italic font-medium max-w-[200px] leading-relaxed">No documents uploaded to this session yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <div key={doc.id} className="bg-white/[0.03] border border-white/5 p-4 rounded-[20px] flex flex-col gap-2">
                       <div className="flex items-center gap-3 text-white">
                         <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                           <FileText className="w-5 h-5" />
                         </div>
                         <div className="min-w-0 flex-1">
                           <p className="text-sm font-semibold truncate">{doc.name}</p>
                           <p className="text-[10px] text-zinc-500 font-mono">
                             {doc.createdAt?.toDate ? doc.createdAt.toDate().toLocaleDateString() : 'Just now'}
                           </p>
                         </div>
                       </div>
                       {doc.text && <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed mt-2 italic border-l-2 border-white/10 pl-3">{doc.text}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-8 border-t border-white/5 mt-auto">
              <input 
                type="hidden" 
                ref={fileInputRef} 
                className="hidden" 
              />
              <input 
                type="file" 
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || !auth.currentUser}
                className={cn(
                  "w-full flex items-center justify-center gap-4 py-5 rounded-[24px] text-[10px] font-black uppercase tracking-[4px] transition-all shadow-xl active:scale-95 group",
                  isUploading || !auth.currentUser
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-white hover:bg-zinc-200 text-black shadow-white/20"
                )}
              >
                {isUploading ? (
                  <span className="animate-pulse">Uploading...</span>
                ) : (
                  <>
                    <Upload className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                    Upload Document
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
