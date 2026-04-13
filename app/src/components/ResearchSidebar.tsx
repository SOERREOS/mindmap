'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResearchSubNode, ResearchMainNode } from '@/lib/api';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

interface ResearchSidebarProps {
  node: (ResearchSubNode | ResearchMainNode) | null;
  onClose: () => void;
  userRole: string;
}

export default function ResearchSidebar({ node, onClose, userRole }: ResearchSidebarProps) {
  const isMobile = useIsMobile();
  const [memo, setMemo] = useState('');

  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (node) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, onClose]);

  // 노드 선택 시 해당 노드 전용 메모 불러오기 (간이 구현: 로컬 스토리지)
  useEffect(() => {
    if (node) {
      const saved = localStorage.getItem(`memo-${node.label}`);
      setMemo(saved || '');
    }
  }, [node]);

  const saveMemo = (val: string) => {
    setMemo(val);
    if (node) {
      localStorage.setItem(`memo-${node.label}`, val);
    }
  };

  return (
    <AnimatePresence>
      {node && (
          <motion.div
            initial={isMobile ? { y: '100%' } : { x: '100%' }}
            animate={isMobile ? { y: 0 } : { x: 0 }}
            exit={isMobile ? { y: '100%' } : { x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 sm:top-0 sm:bottom-auto sm:left-auto sm:right-0 z-[101] h-[85vh] sm:h-screen w-full sm:w-[420px] bg-[#08081a]/97 backdrop-blur-[40px] border-t sm:border-t-0 sm:border-l border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] sm:shadow-[-30px_0_60px_rgba(0,0,0,0.6)] flex flex-col rounded-t-3xl sm:rounded-none"
          >
            {/* 모바일 드래그 핸들 */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {/* Header */}
            <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[10px] tracking-[0.4em] text-white/30 uppercase mb-1">Research Data</p>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide truncate">{node.label}</h2>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors text-white/40 shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 custom-scrollbar mobile-scroll space-y-8 sm:space-y-10">
              
              {/* Perspective Info */}
              <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/5">
                <p className="text-[11px] text-[#4dd0e1] tracking-[0.2em] uppercase mb-2 font-semibold">User Perspective</p>
                <p className="text-white/70 text-sm leading-relaxed">
                  현재 <span className="text-white font-bold">{userRole}</span>의 관점으로 분석된 데이터입니다.
                </p>
              </div>

              {/* Summary & Details */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-white/40 tracking-widest uppercase">Overview</h3>
                <p className="text-white/90 text-lg leading-relaxed font-light">{node.summary}</p>
                {node.details && (
                  <p className="text-white/60 text-sm leading-relaxed pt-2">{node.details}</p>
                )}
              </section>

              {/* Inspiration Trigger */}
              {node.inspiration && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-[#c084fc]/60 tracking-widest uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
                    Creative Spark
                  </h3>
                  <div className="bg-[#c084fc]/5 border border-[#c084fc]/20 rounded-2xl p-5">
                    <p className="text-[#c084fc] italic font-medium">"{node.inspiration}"</p>
                  </div>
                </section>
              )}

              {/* Action Items */}
              {node.actionItems && node.actionItems.length > 0 && (
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#4ade80]/60 tracking-widest uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                    Action Ideas
                  </h3>
                  <ul className="grid gap-3">
                    {node.actionItems.map((item, i) => (
                      <li key={i} className="flex gap-3 text-white/70 text-sm bg-white/5 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                        <span className="text-[#4ade80] font-mono">{String(i + 1).padStart(2, '0')}</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Strategic Questions */}
              {node.questions && node.questions.length > 0 && (
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#fb923c]/60 tracking-widest uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" />
                    Strategic Questions
                  </h3>
                  <div className="space-y-3">
                    {node.questions.map((q, i) => (
                      <div key={i} className="text-white/80 text-sm leading-relaxed pl-4 border-l-2 border-[#fb923c]/30">
                        {q}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Notepad */}
              <section className="space-y-4 pt-6">
                <h3 className="text-sm font-semibold text-white/40 tracking-widest uppercase">My Notes</h3>
                <textarea
                  value={memo}
                  onChange={(e) => saveMemo(e.target.value)}
                  placeholder="아이디어를 메모하세요..."
                  className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl p-5 text-white/80 text-sm outline-none focus:border-white/25 transition-all resize-none placeholder:text-white/10"
                />
              </section>

            </div>

            {/* Footer */}
            <div className="px-6 sm:px-8 py-5 sm:py-6 border-t border-white/5 bg-black/20 safe-bottom shrink-0">
              <button
                onClick={onClose}
                className="w-full py-4 rounded-full bg-white text-black font-bold text-sm tracking-widest hover:bg-white/90 active:scale-95 transition-all uppercase"
              >
                Keep Researching
              </button>
            </div>
          </motion.div>
      )}
    </AnimatePresence>
  );
}
