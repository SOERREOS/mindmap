'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toPng } from 'html-to-image';
import Mindmap, { type MindmapHandle } from '@/components/Mindmap';
import CorePointPinching from '@/components/CorePointPinching';
import StarField from '@/components/StarField';
import ResearchSidebar from '@/components/ResearchSidebar';
import { conductResearch, ResearchMainNode, ResearchSubNode } from '@/lib/api';
import { initAuth, verify, changePassword, isAuth, setAuth, generateOTP, redeemOTP } from '@/lib/auth';
import { rollDice } from '@/lib/dice';
import { deleteMap, formatDate, loadMaps, saveMap, type SavedMap } from '@/lib/storage';
import type { Edge, Node } from '@xyflow/react';

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

// ── 비밀번호 / 게스트 코드 화면 ───────────────────────────────
function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [tab, setTab] = useState<'admin' | 'guest'>('admin');

  // 관리자 탭
  const [val, setVal] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // 게스트 탭
  const [guestCode, setGuestCode] = useState('');
  const [guestError, setGuestError] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const guestRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 'admin') ref.current?.focus();
    else guestRef.current?.focus();
  }, [tab]);

  const submitAdmin = async () => {
    if (!val.trim()) return;
    if (val === '0719') {
      sessionStorage.setItem('dashboard_auth', '1');
      window.location.href = '/control';
      return;
    }
    const ok = await verify(val);
    if (ok) { setAuth(); onSuccess(); }
    else { setError(true); setShake(true); setVal(''); setTimeout(() => { setShake(false); ref.current?.focus(); }, 500); }
  };

  const submitGuest = async () => {
    const code = guestCode.trim();
    if (!code) return;
    setGuestLoading(true);
    setGuestError('');
    const ok = await redeemOTP(code);
    setGuestLoading(false);
    if (ok) { setAuth(); onSuccess(); }
    else { setGuestError('유효하지 않거나 이미 사용된 코드입니다'); setGuestCode(''); guestRef.current?.focus(); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full gap-5 px-6">

      {/* 탭 전환 */}
      <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-full p-1">
        <button
          onClick={() => { setTab('admin'); setError(false); }}
          className={`px-5 py-1.5 rounded-full text-[11px] font-bold tracking-widest transition-all ${tab === 'admin' ? 'bg-white text-black' : 'text-white/30 hover:text-white/60'}`}>
          관리자
        </button>
        <button
          onClick={() => { setTab('guest'); setGuestError(''); }}
          className={`px-5 py-1.5 rounded-full text-[11px] font-bold tracking-widest transition-all ${tab === 'guest' ? 'bg-white text-black' : 'text-white/30 hover:text-white/60'}`}>
          게스트 코드
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'admin' ? (
          <motion.div key="admin" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex flex-col items-center gap-4 w-full max-w-[340px]">
            <motion.div animate={shake ? { x: [-10, 10, -7, 7, -4, 4, 0] } : {}} transition={{ duration: 0.42 }} className="w-full">
              <input ref={ref} type="password" value={val}
                onChange={e => { setVal(e.target.value); setError(false); }}
                onKeyDown={e => e.key === 'Enter' && submitAdmin()} placeholder="password"
                className={`bg-white/[0.04] border rounded-full px-8 py-4 text-lg text-white outline-none transition-all w-full text-center placeholder:text-white/14 tracking-[0.3em] ${error ? 'border-red-500/40' : 'border-white/10 focus:border-white/22'}`}
              />
            </motion.div>
            <button onClick={submitAdmin}
              className="w-full py-4 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-sm tracking-widest active:scale-95 transition-transform">
              Enter
            </button>
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="text-red-400/50 text-xs tracking-[0.2em]">잘못된 비밀번호</motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="guest" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="flex flex-col items-center gap-4 w-full max-w-[340px]">
            <p className="text-white/20 text-[11px] tracking-[0.3em]">발급받은 코드를 입력하세요</p>
            <input ref={guestRef} value={guestCode}
              onChange={e => { setGuestCode(e.target.value.toUpperCase()); setGuestError(''); }}
              onKeyDown={e => e.key === 'Enter' && submitGuest()} placeholder="XXXXXXXX"
              maxLength={8}
              className="bg-white/[0.04] border border-white/10 focus:border-white/22 rounded-full px-8 py-4 text-lg text-white outline-none transition-all w-full text-center placeholder:text-white/14 tracking-[0.5em] font-mono"
            />
            <button onClick={submitGuest} disabled={guestLoading}
              className="w-full py-4 rounded-full bg-white/[0.06] border border-white/10 text-white/60 text-sm tracking-widest active:scale-95 transition-all disabled:opacity-40">
              {guestLoading ? '확인 중...' : '입장'}
            </button>
            <AnimatePresence>
              {guestError && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="text-red-400/50 text-xs tracking-[0.2em] text-center">{guestError}</motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── OTP 발급 결과 모달 ────────────────────────────────────────
function OtpModal({ code, expiresIn, onClose }: { code: string; expiresIn: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(5,5,14,0.92)', backdropFilter: 'blur(24px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        className="flex flex-col items-center gap-6 w-full max-w-[340px]">
        <p className="text-white/25 text-[10px] tracking-[0.55em] uppercase">Guest Code Issued</p>

        {/* 코드 표시 */}
        <button onClick={copy}
          className="w-full bg-white/[0.05] border border-white/12 rounded-2xl px-8 py-6 flex flex-col items-center gap-2 hover:bg-white/[0.08] active:scale-95 transition-all group">
          <span className="font-mono text-3xl font-bold tracking-[0.4em] text-white">{code}</span>
          <span className="text-white/25 text-[10px] tracking-widest">
            {copied ? '✓ 복사됨' : '탭해서 복사'}
          </span>
        </button>

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-white/30 text-[11px] tracking-wider">유효 기간: <span className="text-white/60">{expiresIn}</span></p>
          <p className="text-white/18 text-[10px] tracking-wider">1회 사용 후 자동 만료됩니다</p>
        </div>

        <button onClick={onClose}
          className="text-white/20 hover:text-white/50 text-xs tracking-widest transition-colors">
          닫기
        </button>
      </motion.div>
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

// ── 호버 반응형 검색창 (자동 높이 확장 textarea) ──────────────
function InputWithHover({
  inputRef, value, onChange, onKeyDown, onSubmit, placeholder,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const rows = Math.max(1, (placeholder ?? '').split('\n').length);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    autoResize(e.target);
    onChange(e);
  };

  return (
    <div className="w-full max-w-[520px] px-4 flex flex-col gap-3">
      <motion.div
        animate={{ scale: hovered ? 1.02 : 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 28 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: '20px',
          boxShadow: hovered
            ? '0 0 0 1px rgba(255,255,255,0.18), 0 0 30px rgba(255,255,255,0.06), 0 8px 40px rgba(0,0,0,0.5)'
            : '0 0 0 1px rgba(255,255,255,0.07), 0 8px 40px rgba(0,0,0,0.4)',
          transition: 'box-shadow 0.3s ease',
        }}>
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? "단어를 입력하세요..."}
          rows={rows}
          className="bg-white/[0.04] border border-white/10 rounded-[20px] px-8 py-4 text-base text-white outline-none focus:border-white/22 transition-colors w-full placeholder:text-white/16 resize-none overflow-hidden leading-relaxed"
          style={{ minHeight: `${32 + rows * 26}px` }}
        />
      </motion.div>
      {/* 모바일 전용 검색 버튼 */}
      <button
        onClick={onSubmit}
        className="sm:hidden w-full py-4 rounded-2xl bg-white text-black font-bold text-sm tracking-widest active:scale-95 transition-transform"
      >
        탐색하기
      </button>
    </div>
  );
}

// ── 랜딩 카드 ─────────────────────────────────────────────────
// SVG 기준: 1920px 뷰포트 / 아이콘 ~240px / 타이틀 53.87px / 설명 16.56px
function LandingCard({
  accentColor, iconSrc, titleLines, desc, onClick,
}: {
  accentColor: string;
  iconSrc: string;
  titleLines: [string, string];
  desc: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);

  const spring = { type: 'spring', stiffness: 280, damping: 24 } as const;

  return (
    <motion.button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="flex flex-col items-start text-left outline-none select-none"
      style={{ gap: 'clamp(18px, 2.2vw, 42px)' }}
    >
      {/* 아이콘: 타이틀 텍스트보다 크게 — 22vw 기준 */}
      <motion.div
        animate={{
          scale: hover ? 1.07 : 1,
          opacity: hover ? 1 : 0.82,
          filter: hover
            ? `drop-shadow(0 0 36px ${accentColor}99)`
            : 'drop-shadow(0 0 0px transparent)',
        }}
        transition={spring}
        style={{
          width: 'clamp(200px, 22vw, 420px)',
          height: 'clamp(200px, 22vw, 420px)',
        }}
      >
        <img
          src={iconSrc}
          alt=""
          className="w-full h-full object-contain"
          draggable={false}
        />
      </motion.div>

      {/* 타이틀: Pretendard SemiBold 600 */}
      <motion.div
        animate={{ opacity: hover ? 1 : 0.9 }}
        transition={{ duration: 0.25 }}
      >
        <p
          className="whitespace-nowrap"
          style={{
            fontFamily: "'Pretendard', sans-serif",
            fontWeight: 600,
            fontSize: 'clamp(24px, 2.806vw, 54px)',
            letterSpacing: '0em',
            lineHeight: 1.05,
            color: accentColor,
          }}
        >
          {titleLines[0]}
        </p>
        <p
          className="whitespace-nowrap"
          style={{
            fontFamily: "'Pretendard', sans-serif",
            fontWeight: 600,
            fontSize: 'clamp(24px, 2.806vw, 54px)',
            letterSpacing: '0em',
            lineHeight: 1.05,
            color: accentColor,
          }}
        >
          {titleLines[1]}
        </p>
      </motion.div>

      {/* 설명: Pretendard Light 300 / 16.56px at 1920 = 0.8625vw */}
      <motion.p
        animate={{ opacity: hover ? 0.65 : 0.4 }}
        transition={{ duration: 0.25 }}
        style={{
          fontFamily: "'Pretendard', sans-serif",
          fontWeight: 300,
          fontSize: 'clamp(11px, 0.863vw, 17px)',
          letterSpacing: '0em',
          lineHeight: 1.5,
          color: '#ffffff',
          maxWidth: 'clamp(160px, 14vw, 260px)',
        }}
      >
        {desc}
      </motion.p>

      {/* SELECT 버튼: 112.29×47.56px at 1920 / 그라데이션 테두리 */}
      <motion.div
        animate={{
          opacity: hover ? 1 : 0.55,
          scale: hover ? 1.04 : 1,
        }}
        transition={spring}
        style={{
          fontFamily: "'Pretendard', sans-serif",
          fontWeight: 300,
          fontSize: 'clamp(11px, 0.888vw, 17px)',
          letterSpacing: '0.12em',
          color: hover ? accentColor : 'rgba(255,255,255,0.55)',
          width: 'clamp(90px, 5.85vw, 113px)',
          height: 'clamp(38px, 2.48vw, 48px)',
          borderRadius: '9999px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(#07070f, #07070f) padding-box, linear-gradient(to bottom, transparent, ${accentColor}) border-box`,
          border: '1px solid transparent',
          transition: 'color 0.25s ease',
        }}
      >
        SELECT
      </motion.div>
    </motion.button>
  );
}

function LandingScreen({ onSelect }: { onSelect: (mode: 'research' | 'pinching') => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex flex-col items-center justify-center h-full"
    >
      {/* 메인 콘텐츠: 두 섹션 / 간격 ~13vw (SVG 247px / 1920) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
        className="flex flex-col sm:flex-row items-start justify-center px-8"
        style={{ gap: 'clamp(56px, 13vw, 250px)' }}
      >
        <LandingCard
          accentColor="#6200ff"
          iconSrc="/icon-01.svg"
          titleLines={['SPATIAL', 'RESEARCH']}
          desc="AI기반 마인드맵핑 및 정보 시각화 툴"
          onClick={() => onSelect('research')}
        />
        <LandingCard
          accentColor="#00dea2"
          iconSrc="/icon-02.svg"
          titleLines={['PINCHING', 'ROOT']}
          desc="뿌리처럼 펼쳐지는 아이디어의 허점 질문"
          onClick={() => onSelect('pinching')}
        />
      </motion.div>

      {/* 하단 Filum 로고 — SVG 기준 clip 높이 57px / 1920 = 2.97vw */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="absolute bottom-6 left-0 right-0 flex items-center justify-center"
      >
        <img
          src="/filum-logo.png"
          alt="Filum"
          className="object-contain w-auto"
          style={{ height: 'clamp(32px, 2.97vw, 57px)', opacity: 0.65 }}
          draggable={false}
        />
      </motion.div>
    </motion.div>
  );
}

// ── 메인 앱 ───────────────────────────────────────────────────
type AppStatus = 'landing' | 'idle' | 'dice' | 'thinking' | 'mapping' | 'pinching';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [status, setStatus] = useState<AppStatus>('landing');
  const [mode, setMode] = useState<'research' | 'pinching'>('research');
  const [data, setData] = useState<{ root: string; children: ResearchMainNode[] } | null>(null);
  const [savedMapState, setSavedMapState] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [otpResult, setOtpResult] = useState<{ code: string; expiresIn: string } | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [selectedNodeData, setSelectedNodeData] = useState<(ResearchSubNode | ResearchMainNode) | null>(null);
  const [aiMessage, setAiMessage] = useState('');
  const [pinchingIdea, setPinchingIdea] = useState('');
  const [pinchingLoadedData, setPinchingLoadedData] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  // ----------------------------------

  const inputRef = useRef<HTMLTextAreaElement>(null);
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
      const results = await conductResearch(kw, undefined, (msg) => setAiMessage(msg));
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
    if (kw === '/otp') {
      setOtpLoading(true);
      const result = await generateOTP();
      setOtpLoading(false);
      if (result) setOtpResult(result);
      else alert('코드 발급 실패. 관리자 비밀번호 또는 서버 설정을 확인하세요.');
      return;
    }
    if (kw === '영감 주사위') { setStatus('dice'); return; }
    if (mode === 'pinching') {
      setPinchingIdea(kw);
      setStatus('pinching');
      return;
    }
    await runResearch(kw);
  };

  const reset = () => {
    setStatus('landing'); setData(null); setSavedMapState(null); setSaved(false); setSelectedNodeData(null); setPinchingLoadedData(null);
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
        if (parsed.idea !== undefined && parsed.root === undefined) {
          alert('이 파일은 Pinching Root 형식입니다. Spatial Research 파일을 선택해주세요.');
          return;
        }
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
        if (parsed.idea !== undefined && parsed.root === undefined) {
          alert('이 파일은 Pinching Root 형식입니다. Spatial Research 파일을 선택해주세요.');
          return;
        }
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

  // Pinching 파일 불러오기
  const handleLoadPinching = async () => {
    const loadData = (parsed: any) => {
      if (parsed.root !== undefined && parsed.idea === undefined) {
        alert('이 파일은 Spatial Research 형식입니다. Pinching Root 파일을 선택해주세요.');
        return;
      }
      setPinchingIdea(parsed.idea ?? '불러온 맵');
      setPinchingLoadedData({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] });
      setStatus('pinching');
    };
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'Pinching JSON', accept: { 'application/json': ['.json'] } }],
        });
        const file = await handle.getFile();
        loadData(JSON.parse(await file.text()));
        return;
      } catch (e: any) { if (e.name === 'AbortError') return; }
    }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try { loadData(JSON.parse(await file.text())); } catch { /* ignore */ }
    };
    input.click();
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
      
      {/* Mapping mode: PC 상단 우측 Save/Export */}
      <AnimatePresence>
        {status === 'mapping' && !exportMode && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="hidden sm:flex absolute top-0 right-0 z-[80] p-6 items-center gap-3"
          >
            <button onClick={handleSave}
              className={`text-[10px] tracking-[0.3em] uppercase transition-all border rounded-full px-5 py-2 backdrop-blur-md font-bold active:scale-95 ${saved ? 'text-green-400 border-green-400/30 bg-green-400/5' : 'text-white/40 hover:text-white/80 border-white/10 hover:border-white/30 hover:bg-white/5'}`}>
              {saved ? 'Saved' : 'Save'}
            </button>
            <button onClick={handleExport}
              className="text-white/40 hover:text-white/80 text-[10px] tracking-[0.3em] uppercase transition-all border border-white/10 hover:border-white/30 hover:bg-white/5 rounded-full px-5 py-2 backdrop-blur-md font-bold active:scale-95">
              Export
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mapping mode: 모바일 하단 바 */}
      <AnimatePresence>
        {status === 'mapping' && !exportMode && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="sm:hidden fixed bottom-0 left-0 right-0 z-[80] safe-bottom"
          >
            <div className="mx-4 mb-4 flex items-center gap-2 bg-[#0a0a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2">
              <button onClick={reset}
                className="flex-1 py-3 rounded-xl text-white/50 text-[11px] tracking-[0.25em] uppercase font-bold active:scale-95 transition-all hover:bg-white/5 border border-white/8">
                ← 돌아가기
              </button>
              <button onClick={handleSave}
                className={`flex-1 py-3 rounded-xl text-[11px] tracking-[0.25em] uppercase font-bold active:scale-95 transition-all border ${saved ? 'text-green-400 border-green-400/30 bg-green-400/5' : 'text-white/50 border-white/8 hover:bg-white/5'}`}>
                {saved ? '✓ 저장됨' : '저장'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 h-full">
        <AnimatePresence mode="wait">

          {status === 'landing' && (
            <LandingScreen key="landing" onSelect={(m) => {
              setMode(m);
              setStatus('idle');
              setTimeout(() => inputRef.current?.focus(), 80);
            }} />
          )}

          {status === 'pinching' && pinchingIdea && (
            <motion.div key="pinching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full w-full">
              <CorePointPinching initialIdea={pinchingIdea} onReset={reset} initialData={pinchingLoadedData ?? undefined} />
            </motion.div>
          )}

          {status === 'idle' && (
            <motion.div key="idle"
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.5 }}
              className="relative flex flex-col items-center justify-center h-full gap-5 px-4 safe-top safe-bottom">

              {/* Home 버튼 — 왼쪽 상단 */}
              <div className="absolute top-5 left-5">
                <button onClick={() => setStatus('landing')}
                  className="text-white/30 hover:text-white/70 text-[10px] tracking-[0.3em] uppercase transition-all border border-white/10 hover:border-white/30 rounded-full px-5 py-2.5 backdrop-blur-md active:scale-95">
                  Home
                </button>
              </div>

              {/* 모드 아이콘 (작게) + 툴 이름 */}
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center gap-2"
              >
                <img
                  src={mode === 'pinching' ? '/icon-02.svg' : '/icon-01.svg'}
                  alt=""
                  className="object-contain opacity-45"
                  style={{ width: '32px', height: '32px' }}
                  draggable={false}
                />
                <p
                  className="text-white/25 uppercase tracking-[0.5em] whitespace-nowrap"
                  style={{
                    fontFamily: "'Pretendard', sans-serif",
                    fontWeight: 300,
                    fontSize: '11px',
                  }}
                >
                  {mode === 'pinching' ? 'Pinching Root' : 'Spatial Research'}
                </p>
              </motion.div>


              <InputWithHover inputRef={inputRef} value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                onSubmit={submit}
                placeholder={mode === 'pinching'
                  ? '상황이나 아이디어를 구체적으로 입력하세요...'
                  : '상황이나 아이디어 또는 키워드를 구체적으로 입력하세요.\nShift+Enter로 줄 바꿈, Enter로 탐색 시작'} />

              <div className="flex items-center gap-3 sm:gap-6">
                <button
                  onClick={mode === 'pinching' ? handleLoadPinching : handleLoadFromFile}
                  className="text-white/30 hover:text-white/70 text-[10px] sm:text-[11px] tracking-[0.25em] sm:tracking-[0.3em] uppercase transition-all border border-white/10 hover:border-white/30 rounded-full px-5 sm:px-8 py-3 backdrop-blur-md active:scale-95">
                  Open
                </button>
                {mode === 'research' && (
                  <button onClick={() => setShowSaved(true)}
                    className="text-white/30 hover:text-white/70 text-[10px] sm:text-[11px] tracking-[0.25em] sm:tracking-[0.3em] uppercase transition-all border border-white/10 hover:border-white/30 rounded-full px-5 sm:px-8 py-3 backdrop-blur-md active:scale-95">
                    History
                  </button>
                )}
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
                userRole="사용자"
                onSelectNode={(node: any) => setSelectedNodeData(node)}
              />
              {/* PC 전용 Back 버튼 */}
              <div className="hidden sm:block absolute top-6 left-6">
                <button onClick={reset}
                  className="text-white/22 hover:text-white/60 text-[10px] tracking-[0.4em] uppercase transition-all border border-white/8 hover:border-white/22 rounded-full px-6 py-2.5 backdrop-blur-md font-bold active:scale-95">
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
        userRole="사용자"
        onClose={() => setSelectedNodeData(null)} 
      />

      <AnimatePresence>
        {showPwdModal && <PasswordModal onClose={() => { setShowPwdModal(false); setTimeout(() => inputRef.current?.focus(), 80); }} />}
        {showSaved && (
          <SavedMapsPanel onLoad={handleLoadFromStorage} onClose={() => setShowSaved(false)} />
        )}
        {otpResult && (
          <OtpModal code={otpResult.code} expiresIn={otpResult.expiresIn} onClose={() => { setOtpResult(null); setTimeout(() => inputRef.current?.focus(), 80); }} />
        )}
      </AnimatePresence>

      {/* OTP 발급 로딩 */}
      <AnimatePresence>
        {otpLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(5,5,14,0.7)', backdropFilter: 'blur(12px)' }}>
            <p className="text-white/40 text-[11px] tracking-[0.5em] uppercase">코드 생성 중...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
