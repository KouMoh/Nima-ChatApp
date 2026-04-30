import React from 'react';

export const IndianKanoonLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
        {/* Decorative circular rings (orange) */}
        <div className="absolute inset-0 border-[3px] border-[#df6a17] rounded-full opacity-30" />
        <div className="absolute inset-[4px] border-[3px] border-[#df6a17] rounded-full" />
        
        {/* Styled 'ik' logo part (blue) */}
        <div className="relative z-10 flex items-center justify-center -translate-x-[1px]">
            <svg viewBox="0 0 100 100" className="w-8 h-8 fill-[#16469d]" xmlns="http://www.w3.org/2000/svg">
                {/* stylized 'ik' path - simplified for clarity and boldness */}
                <circle cx="30" cy="20" r="14" /> {/* the 'i' dot */}
                <path d="M16 40h28v45H16z" /> {/* bold backbone */}
                <path d="M44 40l30 0l-30 22v10l30 22l-30 0l-15-12v-30z" className="hidden" /> {/* placeholder */}
                <path d="M44 40l32 0l-18 18l18 22l-32 0l-12-15v-10z" /> {/* k arms connection */}
            </svg>
        </div>
      </div>
      <div className="flex flex-col items-start -space-y-1">
        <span className="text-[#df6a17] text-[13px] font-black italic tracking-widest uppercase mb-[2px]">API</span>
        <span className="text-[#16469d] text-[18px] font-bold tracking-tighter" style={{ fontFamily: 'sans-serif' }}>kanoon</span>
      </div>
    </div>
  );
};
