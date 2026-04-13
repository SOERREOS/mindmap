'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import Mindmap, { type MindmapHandle } from '@/components/Mindmap';
import StarField from '@/components/StarField';
import ResearchSidebar from '@/components/ResearchSidebar';
import { conductResearch, ResearchMainNode, ResearchSubNode } from '@/lib/api';
import { initAuth, verify, changePassword, isAuth, setAuth } from '@/lib/auth';
import { rollDice } from '@/lib/dice';
import { deleteMap, formatDate, loadMaps, saveMap, type SavedMap } from '@/lib/storage';
import type { Edge, Node } from '@xyflow/react';

// ── 사용자 역할 정의 ───────────────────────────────────────────
const USER_ROLES = [
  { id: 'designer', label: '디자이너', emoji: '🎨' },
  { id: 'marketer', label: '마케터', emoji: '📈' },
  { id: 'writer', label: '작가', emoji: '✍️' },
];

// ── 해킹 주사위 ───────────────────────────────────────────────
const HACK_CHARS = '0123456789!@#$%^&*()[]{}<>|?/~ABCDEFGHIJKLMNabcdefghijklmn가나다라마바사아자';

function DiceAnimation({ onComplete }: { onComplete: (topic: string) => void }) {
  const topicRef = useRef(rollDice());
  const [phase, setPhase] = useState<'chaos' | 'snap' | 'hold'>('chaos');
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (phase !== 'chaos') return;
    const interval = setInterval(() => {
      const len = 5 + Math.floor(Math.random() * 9);
      setDisplay(Array.from({ length: len }, () => HACK_CHARS[Math.floor(Math.random() * HACK_CHARS.length)]).join(' '));
    }, 48);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setPhase('snap');
      setTimeout(() => { setPhase('hold'); setTimeout(() => onComplete(topicRef.current), 1000); }, 90);
    }, 1700);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [phase, onComplete]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full gap-8">
      <p className="text-white/15 text-[10px] tracking-[0.6em] uppercase select-none">주사위 굴리는 중</p>
      <div className="min-w-[280px] flex items-center justify-center min-h-[60px]">
        {phase === 'chaos' && (
          <div className="font-mono text-lg text-white/30 tracking-[0.15em] select-none">{display}</div>
        )}
        {(phase === 'snap' || phase === 'hold') && (
          <motion.div key="snap"
            initial={{ opacity: 0, scale: 0.85, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.08 }}
            className="font-mono text-3xl font-bold tracking-[0.25em] select-none"
            style={{ color: '#fff', textShadow: '0 0 40px rgba(255,255,255,0.9), 0 0 90px rgba(255,255,255,0.4)' }}>
            {topicRef.current}
          </motion.div>
        )}
      </div>
      <AnimatePresence>
        {phase === 'hold' && (
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="text-white/20 text-[10px] tracking-[0.45em] uppercase select-none">탐색 시작...</motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── 탐색 중 시각 화면 ─────────────────────────────────────────
function ThinkingScreen({ message }: { message?: string }) {
  return (
    <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-full gap-10">
      <div style={{ position: 'relative', width: 190, height: 190 }}>
        <svg width="190" height="190" viewBox="0 0 190 190" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <circle cx="95" cy="95" r="76" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.7"
            style={{ animation: 'ring-breathe 3.2s ease-in-out infinite' }} />
          <circle cx="95" cy="95" r="52" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.7"
            style={{ animation: 'ring-breathe 2.5s ease-in-out infinite', animationDelay: '0.4s' }} />
          <circle cx="95" cy="95" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.7"
            style={{ animation: 'ring-breathe 1.8s ease-in-out infinite', animationDelay: '0.8s' }} />
          <g style={{ transformOrigin: '95px 95px', animation: 'orbit 4.0s linear infinite' }}>
            <circle cx="95" cy="19" r="3.5" fill="#4dd0e1" style={{ filter: 'drop-shadow(0 0 6px #4dd0e1)' }} />
          </g>
          <g style={{ transformOrigin: '95px 95px', animation: 'orbit 6.2s linear infinite reverse' }}>
            <circle cx="95" cy="43" r="2.5" fill="#c084fc" style={{ filter: 'drop-shadow(0 0 5px #c084fc)' }} />
          </g>
          <g style={{ transformOrigin: '95px 95px', animation: 'orbit 2.8s linear infinite' }}>
            <circle cx="95" cy="67" r="2" fill="#4ade80" style={{ filter: 'drop-shadow(0 0 4px #4ade80)' }} />
          </g>
          <g style={{ transformOrigin: '95px 95px', animation: 'orbit 5.0s linear infinite', animationDelay: '-2.5s' }}>
            <circle cx="95" cy="19" r="2.5" fill="#fb923c" style={{ filter: 'drop-shadow(0 0 5px #fb923c)' }} />
          </g>
          <circle cx="95" cy="95" r="5" fill="rgba(255,255,255,0.92)"
            style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.9))', animation: 'ring-breathe 1.6s ease-in-out infinite' }} />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-4">
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', letterSpacing: '0.55em', textTransform: 'uppercase', animation: 'thinking-pulse 2.2s ease-in-out infinite' }}>
          AI 탐색 중
        </p>
        <AnimatePresence mode="wait">
          {message && (
            <motion.p 
              key={message}
              initial={{ opacity: 0, y: 5 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -5 }}
              className="text-[#c084fc]/50 text-[10px] tracking-[0.2em] font-medium"
            >
              {message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── 비밀번호 화면 ─────────────────────────────────────────────
function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [val, setVal] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    if (!val.trim()) return;
    const ok = await verify(val);
    if (ok) { setAuth(); onSuccess(); }
    else { setError(true); setShake(true); setVal(''); setTimeout(() => { setShake(false); ref.current?.focus(); }, 500); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full gap-5 px-6">
      <p className="text-white/18 text-[10px] tracking-[0.55em] uppercase">Restricted Access</p>
      <motion.div animate={shake ? { x: [-10, 10, -7, 7, -4, 4, 0] } : {}} transition={{ duration: 0.42 }}
        className="w-full max-w-[340px]">
        <input ref={ref} type="password" value={val}
          onChange={e => { setVal(e.target.value); setError(false); }}
          onKeyDown={e => e.key === 'Enter' && submit()} placeholder="password"
          className={`bg-white/[0.04] border rounded-full px-8 py-4 text-lg text-white outline-none transition-all w-full text-center placeholder:text-white/14 tracking-[0.3em] ${error ? 'border-red-500/40' : 'border-white/10 focus:border-white/22'}`}
        />
      </motion.div>
      <button onClick={submit}
        className="w-full max-w-[340px] py-4 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-sm tracking-widest active:scale-95 transition-transform">
        Enter
      </button>
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-red-400/50 text-xs tracking-[0.2em]">잘못된 비밀번호</motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── 비밀번호 변경 모달 ────────────────────────────────────────
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'new' | 'confirm' | 'done'>('new');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (confirm !== newPwd) { setError('비밀번호가 일치하지 않습니다'); return; }
    await changePassword(newPwd); setStep('done'); setTimeout(onClose, 1400);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(5,5,14,0.92)', backdropFilter: 'blur(24px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="flex flex-col items-center gap-5">
        <p className="text-white/20 text-[10px] tracking-[0.55em] uppercase">
          {step === 'done' ? 'Updated' : 'Change Password'}
        </p>
        {step === 'new' && (
          <input autoFocus type="password" value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newPwd.trim().length >= 4 && setStep('confirm')}
            placeholder="새 비밀번호 (4자 이상)"
            className="bg-white/[0.04] border border-white/10 focus:border-white/22 rounded-full px-10 py-4 text-lg text-white outline-none w-[300px] text-center placeholder:text-white/18" />
        )}
        {step === 'confirm' && (
          <>
            <input autoFocus type="password" value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()} placeholder="비밀번호 확인"
              className="bg-white/[0.04] border border-white/10 focus:border-white/22 rounded-full px-10 py-4 text-lg text-white outline-none w-[300px] text-center placeholder:text-white/18" />
            {error && <p className="text-red-400/50 text-xs">{error}</p>}
          </>
        )}
        {step === 'done' && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-white/35 text-sm tracking-[0.3em]">✓  변경 완료</motion.p>
        )}
        {step !== 'done' && (
          <button onClick={onClose} className="text-white/14 hover:text-white/30 text-xs tracking-widest transition-colors mt-1">취소</button>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── 저장된 맵 패널 (localStorage 폴백) ───────────────────────
function SavedMapsPanel({ onLoad, onClose }: { onLoad: (map: SavedMap) => void; onClose: () => void }) {
  const [maps, setMaps] = useState<SavedMap[]>([]);
  useEffect(() => { setMaps(loadMaps()); }, []);
  const remove = (id: string) => { deleteMap(id); setMaps(prev => prev.filter(m => m.id !== id)); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(5,5,14,0.88)', backdropFilter: 'blur(24px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        className="w-[380px] max-h-[70vh] flex flex-col"
        style={{ background: 'rgba(8,8,20,0.9)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '20px' }}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/5">
          <p className="text-white/40 text-[10px] tracking-[0.4em] uppercase">임시 저장 목록</p>
          <button onClick={onClose} className="text-white/20 hover:text-white/50 text-xs transition-colors">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-3">
          {maps.length === 0 ? (
            <p className="text-white/18 text-xs text-center py-10 tracking-wider">저장된 맵 없음</p>
          ) : maps.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
              <button onClick={() => { onLoad(m); onClose(); }} className="flex-1 text-left">
                <p className="text-white/70 text-sm font-medium">{m.root}</p>
                <p className="text-white/22 text-[10px] mt-0.5">{formatDate(m.savedAt)}</p>
              </button>
              <button onClick={() => remove(m.id)}
                className="text-white/10 hover:text-red-400/50 text-xs transition-colors opacity-0 group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── 호버 반응형 검색창 ────────────────────────────────────────
function InputWithHover({
  inputRef, value, onChange, onKeyDown, onSubmit,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="w-full max-w-[480px] px-4 flex flex-col gap-3">
      <motion.div
        animate={{ scale: hovered ? 1.02 : 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: '9999px',
          boxShadow: hovered
            ? '0 0 0 1px rgba(255,255,255,0.18), 0 0 30px rgba(255,255,255,0.06), 0 8px 40px rgba(0,0,0,0.5)'
            : '0 0 0 1px rgba(255,255,255,0.07), 0 8px 40px rgba(0,0,0,0.4)',
          transition: 'box-shadow 0.3s ease',
        }}>
        <input ref={inputRef} value={value} onChange={onChange} onKeyDown={onKeyDown}
          placeholder="단어를 입력하세요..."
          className="bg-white/[0.04] border border-white/10 rounded-full px-8 py-4 text-lg text-white outline-none focus:border-white/22 transition-colors w-full text-center placeholder:text-white/16"
        />
      </motion.div>
      {/* 모바일 전용 검색 버튼 */}
      <button
        onClick={onSubmit}
        className="sm:hidden w-full py-4 rounded-full bg-white text-black font-bold text-sm tracking-widest active:scale-95 transition-transform"
      >
        탐색하기
      </button>
    </div>
  );
}

// ── 메인 앱 ───────────────────────────────────────────────────
type AppStatus = 'idle' | 'dice' | 'thinking' | 'mapping';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [data, setData] = useState<{ root: string; children: ResearchMainNode[] } | null>(null);
  const [savedMapState, setSavedMapState] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  // --- New Creative Features State ---
  const [userRole, setUserRole] = useState(USER_ROLES[0].label);
  const [selectedNodeData, setSelectedNodeData] = useState<(ResearchSubNode | ResearchMainNode) | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  // ----------------------------------

  const inputRef = useRef<HTMLInputElement>(null);
  const mindmapRef = useRef<MindmapHandle | null>(null);

  useEffect(() => {
    initAuth().then(() => { setAuthed(isAuth()); setAuthReady(true); });
  }, []);

  const runResearch = async (kw: string) => {
    setSavedMapState(null);
    setStatus('thinking');
    setAiMessage('가장 적합한 지능형 엔진을 찾는 중..');
    setSelectedNodeData(null);
    try {
      const results = await conductResearch(kw, userRole, (msg) => setAiMessage(msg));
      setData({ root: kw, children: results });
      setStatus('mapping');
    } catch (err) {
      alert(err instanceof Error ? err.message : '리서치 실패.');
      setStatus('idle');
    }
  };

  const submit = async () => {
    const kw = inputValue.trim();
    if (!kw) return;
    setInputValue('');
    if (kw === '/reos') { setShowPwdModal(true); return; }
    if (kw === '영감 주사위') { setStatus('dice'); return; }
    await runResearch(kw);
  };

  const reset = () => {
    setStatus('idle'); setData(null); setSavedMapState(null); setSaved(false); setSelectedNodeData(null);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  // 저장 — 확장 노드 포함 전체 상태 + 파일 경로 선택
  const handleSave = async () => {
    if (!data) return;
    const state = mindmapRef.current?.getState();
    const nodes = state?.nodes ?? [];
    const edges = state?.edges ?? [];

    // localStorage 백업 (확장 노드 포함)
    saveMap(data.root, data.children, nodes, edges);

    const json = JSON.stringify({
      root: data.root,
      children: data.children,
      nodes,
      edges,
      savedAt: Date.now(),
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `mindmap-${data.root}.json`,
          types: [{ description: 'Mindmap JSON', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setSaved(true); setTimeout(() => setSaved(false), 2200);
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') { setSaved(true); setTimeout(() => setSaved(false), 2200); return; }
      }
    }
    // 폴백: 자동 다운로드
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mindmap-${data.root}.json`; a.click();
    URL.revokeObjectURL(url);
    setSaved(true); setTimeout(() => setSaved(false), 2200);
  };

  // 불러오기 — 파일 열기 (확장 노드 포함 복원)
  const handleLoadFromFile = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'Mindmap JSON', accept: { 'application/json': ['.json'] } }],
        });
        const file = await handle.getFile();
        const parsed = JSON.parse(await file.text());
        setData({ root: parsed.root, children: parsed.children ?? [] });
        setSavedMapState(parsed.nodes?.length
          ? { nodes: parsed.nodes, edges: parsed.edges ?? [] }
          : null);
        setStatus('mapping');
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return;
      }
    }
    // 폴백: 파일 input
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        setData({ root: parsed.root, children: parsed.children ?? [] });
        setSavedMapState(parsed.nodes?.length
          ? { nodes: parsed.nodes, edges: parsed.edges ?? [] }
          : null);
        setStatus('mapping');
      } catch { setShowSaved(true); }
    };
    input.click();
  };

  // localStorage 패널에서 불러오기
  const handleLoadFromStorage = (m: SavedMap) => {
    setData({ root: m.root, children: m.children });
    setSavedMapState(m.nodes?.length
      ? { nodes: m.nodes as Node[], edges: (m.edges ?? []) as Edge[] }
      : null);
    setStatus('mapping');
  };

  // PNG 내보내기
  const handleExport = async () => {
    const el = document.querySelector('.react-flow') as HTMLElement;
    if (!el) return;
    setExportMode(true);
    await new Promise(r => setTimeout(r, 320));
    try {
      const url = await toPng(el, { backgroundColor: '#07070f', pixelRatio: 3 });
      setExportMode(false);
      const a = document.createElement('a');
      a.href = url; a.download = `mindmap-${data?.root ?? 'export'}.png`; a.click();
    } catch { setExportMode(false); }
  };

  if (!authReady) return null;

  if (!authed) {
    return (
      <main className="relative w-full h-screen bg-[#07070f]">
        <StarField />
        <div className="relative z-10 h-full"><AuthScreen onSuccess={() => setAuthed(true)} /></div>
      </main>
    );
  }

  return (
    <main className="relative w-full h-screen bg-[#07070f]">
      <StarField />
      
      {/* Mapping mode: Save/Export top-right */}
      <AnimatePresence>
        {status === 'mapping' && !exportMode && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute top-0 right-0 z-[80] p-4 sm:p-6 flex items-center gap-2 sm:gap-3 safe-top"
          >
            <button onClick={handleSave}
              className={`text-[10px] tracking-[0.2em] sm:tracking-[0.3em] uppercase transition-all border rounded-full px-4 sm:px-5 py-2 backdrop-blur-md font-bold active:scale-95 ${saved ? 'text-green-400 border-green-400/30 bg-green-400/5' : 'text-white/40 hover:text-white/80 border-white/10 hover:border-white/30 hover:bg-white/5'}`}>
              {saved ? '✓' : 'Save'}
            </button>
            <button onClick={handleExport}
              className="text-white/40 hover:text-white/80 text-[10px] tracking-[0.2em] sm:tracking-[0.3em] uppercase transition-all border border-white/10 hover:border-white/30 hover:bg-white/5 rounded-full px-4 sm:px-5 py-2 backdrop-blur-md font-bold active:scale-95 hidden sm:block">
              Export
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 h-full">
        <AnimatePresence mode="wait">

          {status === 'idle' && (
            <motion.div key="idle"
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center h-full gap-5 px-4 safe-top safe-bottom">
              <p className="text-white/18 text-[10px] sm:text-[11px] tracking-[0.45em] sm:tracking-[0.55em] uppercase font-medium">Creative Research Engine</p>

              {/* Role Selector — 모바일: 가로 스크롤 */}
              <div className="w-full max-w-[480px] overflow-x-auto mobile-scroll px-4">
                <div className="flex items-center gap-1.5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-full p-1 min-w-max mx-auto w-fit">
                  {USER_ROLES.map(role => (
                    <button
                      key={role.id}
                      onClick={() => setUserRole(role.label)}
                      className={`px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider sm:tracking-widest transition-all flex items-center gap-1.5 whitespace-nowrap ${userRole === role.label ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-white/40 hover:text-white/60 hover:bg-white/5'}`}
                    >
                      <span>{role.emoji}</span>
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>

              <InputWithHover inputRef={inputRef} value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                onSubmit={submit} />

              <div className="flex items-center gap-3 sm:gap-6">
                <button onClick={handleLoadFromFile}
                  className="text-white/30 hover:text-white/70 text-[10px] sm:text-[11px] tracking-[0.25em] sm:tracking-[0.3em] uppercase transition-all border border-white/10 hover:border-white/30 rounded-full px-5 sm:px-8 py-3 backdrop-blur-md active:scale-95">
                  Open
                </button>
                <button onClick={() => setShowSaved(true)}
                  className="text-white/30 hover:text-white/70 text-[10px] sm:text-[11px] tracking-[0.25em] sm:tracking-[0.3em] uppercase transition-all border border-white/10 hover:border-white/30 rounded-full px-5 sm:px-8 py-3 backdrop-blur-md active:scale-95">
                  History
                </button>
              </div>
            </motion.div>
          )}

          {status === 'dice' && (
            <motion.div key="dice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <DiceAnimation onComplete={topic => runResearch(topic)} />
            </motion.div>
          )}

          {status === 'thinking' && <ThinkingScreen message={aiMessage} />}

          {status === 'mapping' && data && (
            <motion.div key="mapping"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
              className="relative h-full w-full">
              <Mindmap
                ref={mindmapRef}
                rootLabel={data.root}
                childrenData={data.children}
                exportMode={exportMode}
                savedNodes={savedMapState?.nodes}
                savedEdges={savedMapState?.edges}
                userRole={userRole}
                onSelectNode={(node: any) => setSelectedNodeData(node)}
              />
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 safe-top">
                <button onClick={reset}
                  className="text-white/22 hover:text-white/60 text-[10px] tracking-[0.3em] sm:tracking-[0.4em] uppercase transition-all border border-white/8 hover:border-white/22 rounded-full px-5 sm:px-6 py-2.5 backdrop-blur-md font-bold active:scale-95">
                  ← Back
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Research Sidebar */}
      <ResearchSidebar 
        node={selectedNodeData} 
        userRole={userRole}
        onClose={() => setSelectedNodeData(null)} 
      />

      <AnimatePresence>
        {showPwdModal && <PasswordModal onClose={() => { setShowPwdModal(false); setTimeout(() => inputRef.current?.focus(), 80); }} />}
        {showSaved && (
          <SavedMapsPanel onLoad={handleLoadFromStorage} onClose={() => setShowSaved(false)} />
        )}
      </AnimatePresence>
    </main>
  );
}
