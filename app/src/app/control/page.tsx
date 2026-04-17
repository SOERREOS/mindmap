'use client';
import { useEffect, useRef, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────
const SESSION_KEY = 'dashboard_auth';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxldrSXgxrvunlbexWOLLyyi24r3hMp0XBk_d-gP6I6_vyGJmfsjTjFziAYPYIErT04mg/exec';
const TASKS_KEY = 'dashboard_tasks';
const PROJECTS_KEY = 'dashboard_projects';
const CATEGORIES_KEY = 'dashboard_categories';
const GOAL_KEY = 'dashboard_goal';
const font = "'Pretendard', sans-serif";

// ── Types ─────────────────────────────────────────────────────
interface Category { key: string; label: string; color: string; }
interface Task {
  date: string; title: string; description: string; category: string;
  done: boolean; createdAt: string; deadline: string;
}
interface Project {
  id: string; name: string; progress: number;
  category: string; deadline: string; memo: string;
}

// ── Defaults ──────────────────────────────────────────────────
const DEFAULT_CATEGORIES: Category[] = [
  { key: 'assignment', label: '대학 과제', color: '#3b82f6' },
  { key: 'exam',       label: '시험 준비', color: '#ef4444' },
  { key: 'work',       label: '업무',      color: '#f97316' },
  { key: 'tutoring',   label: '과외',      color: '#a855f7' },
  { key: 'study',      label: '개인 공부', color: '#22c55e' },
];

// ── Utilities ─────────────────────────────────────────────────
const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getDday(deadline: string) {
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((new Date(deadline+'T00:00:00').getTime() - t.getTime()) / 86400000);
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate(); }
function genKey() { return Math.random().toString(36).slice(2,8); }

// ── localStorage ──────────────────────────────────────────────
function loadCategories(): Category[] {
  try { return JSON.parse(localStorage.getItem(CATEGORIES_KEY) ?? 'null') ?? [...DEFAULT_CATEGORIES]; }
  catch { return [...DEFAULT_CATEGORIES]; }
}
function saveCategories(cats: Category[]) {
  try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats)); } catch {}
}
function applyCSS(cats: Category[]) {
  cats.forEach(c => document.documentElement.style.setProperty(`--color-${c.key}`, c.color));
}
function loadTasks(date: string): Task[] {
  try { return (JSON.parse(localStorage.getItem(TASKS_KEY) ?? '{}'))[date] ?? []; } catch { return []; }
}
function saveTasks(date: string, tasks: Task[]) {
  try {
    const all = JSON.parse(localStorage.getItem(TASKS_KEY) ?? '{}');
    all[date] = tasks; localStorage.setItem(TASKS_KEY, JSON.stringify(all));
  } catch {}
}
function loadAllTasks(): Record<string, Task[]> {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY) ?? '{}'); } catch { return {}; }
}
function saveAllTasks(all: Record<string, Task[]>) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(all)); } catch {}
}
// 날짜 범위를 고려해 해당 날의 태스크를 반환
function getTasksForDate(all: Record<string, Task[]>, date: string): Task[] {
  const result: Task[] = [];
  for (const tasks of Object.values(all)) {
    for (const t of tasks) {
      const end = (t.deadline && t.deadline >= t.date) ? t.deadline : t.date;
      if (t.date <= date && date <= end) result.push(t);
    }
  }
  return result;
}
function loadProjects(): Project[] {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]'); } catch { return []; }
}
function saveProjects(p: Project[]) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(p)); } catch {}
}

// ── API ───────────────────────────────────────────────────────
async function apiGet(params: string): Promise<any> {
  const res = await fetch(`/api/sheets?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// Returns { ok: true } or throws on error
async function apiPost(body: object): Promise<{ ok: boolean }> {
  const res = await fetch('/api/sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { ok: true };
}

async function fetchAllTasksRemote(): Promise<Record<string, Task[]> | null> {
  try {
    const d = await apiGet('action=getAllTasks');
    if (!Array.isArray(d)) return null;
    const grouped: Record<string, Task[]> = {};
    for (const task of d) {
      if (!grouped[task.date]) grouped[task.date] = [];
      grouped[task.date].push(task);
    }
    return grouped;
  } catch { return null; }
}
async function fetchProjectsRemote(): Promise<Project[] | null> {
  try {
    const d = await apiGet('action=getProjects');
    return Array.isArray(d) && d.length > 0 ? d : null;
  } catch { return null; }
}
async function fetchCategoriesRemote(): Promise<Category[] | null> {
  try {
    const d = await apiGet('action=getCategories');
    return Array.isArray(d) && d.length > 0 ? d : null;
  } catch { return null; }
}

// ── Shared styles ─────────────────────────────────────────────
const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)' };
const lbl: React.CSSProperties = { fontFamily: font, fontSize: 12, color: 'var(--muted)', letterSpacing: '0.03em' };
const ttl: React.CSSProperties = { fontFamily: font, fontSize: 15, fontWeight: 600, color: 'var(--text)' };
const inp: React.CSSProperties = {
  border: '1px solid var(--input-border)', borderRadius: 12, padding: '12px 16px',
  fontFamily: font, fontSize: 14, outline: 'none', width: '100%',
  boxSizing: 'border-box', color: 'var(--text)', background: 'var(--input-bg)',
};
function ghostBtn(small = false): React.CSSProperties {
  return {
    background: 'none', border: '1px solid var(--border)', borderRadius: 999,
    padding: small ? '6px 14px' : '9px 20px',
    cursor: 'pointer', fontFamily: font,
    fontSize: small ? 12 : 13, color: 'var(--muted)',
  };
}

// ── TaskCard (solid color block) ──────────────────────────────
function TaskCard({ task, cats, onToggle, onEdit, onDelete }: {
  task: Task; cats: Category[];
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const catObj = cats.find(c => c.key === task.category);
  const color = catObj?.color ?? '#888';
  const isRange = task.deadline && task.deadline > task.date;
  return (
    <div onClick={() => !task.done && onEdit()}
      style={{ background: color, borderRadius: 16, padding: '14px 14px 12px',
        opacity: task.done ? 0.5 : 1, transition: 'opacity 0.2s',
        cursor: task.done ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', minHeight: 110 }}>
      <p style={{ fontFamily: font, fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6, lineHeight: 1.35,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        textDecoration: task.done ? 'line-through' : 'none', flex: 1 }}>
        {task.title}
      </p>
      <p style={{ fontFamily: font, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: isRange ? 4 : 10 }}>
        {catObj?.label ?? task.category}
      </p>
      {isRange && (
        <p style={{ fontFamily: font, fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
          {task.date.slice(5)} → {task.deadline!.slice(5)}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
        <button onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{ width: 22, height: 22, borderRadius: '50%',
            border: `2px solid ${task.done ? '#fff' : 'rgba(255,255,255,0.5)'}`,
            background: task.done ? '#fff' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, transition: 'all 0.15s', flexShrink: 0 }}>
          {task.done && <span style={{ color: color, fontSize: 9, fontWeight: 800 }}>✓</span>}
        </button>
      </div>
    </div>
  );
}

// ── EditTaskModal ─────────────────────────────────────────────
function EditTaskModal({ task, cats, onUpdate, onClose }: {
  task: Task; cats: Category[];
  onUpdate: (title: string, cat: string, description: string) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(task.title);
  const [cat, setCat] = useState(task.category);
  const [desc, setDesc] = useState(task.description ?? '');
  const commit = () => {
    const t = val.trim();
    if (t) onUpdate(t, cat, desc);
    onClose();
  };
  return (
    <div className="dash-sheet-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-sheet-box" style={{ background: 'var(--surface)', borderRadius: 20, padding: '28px 24px', width: 380, boxShadow: '0 12px 48px rgba(0,0,0,0.18)' }}>
        <p style={{ ...ttl, fontSize: 16, marginBottom: 16 }}>할 일 수정</p>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onClose(); }}
          style={{ ...inp, marginBottom: 10 }} placeholder="할 일 제목" />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}>
          {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <textarea value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="상세 설명 (선택)..." rows={3}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6, marginBottom: 18, minHeight: 72 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1px solid #e5e5e5', borderRadius: 12, fontFamily: font, fontSize: 13, cursor: 'pointer', background: 'var(--cancel-bg)', color: 'var(--cancel-col)' }}>취소</button>
          <button onClick={commit} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 12, fontFamily: font, fontSize: 13, cursor: 'pointer', background: '#111', color: '#fff', fontWeight: 600 }}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ── AddTaskModal ──────────────────────────────────────────────
function AddTaskModal({ cats, defaultDate, onAdd, onClose }: {
  cats: Category[]; defaultDate: string;
  onAdd: (t: Omit<Task, 'done'>) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState(cats[0]?.key ?? '');
  const [desc, setDesc] = useState('');
  const [rangeMode, setRangeMode] = useState(false);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);

  const submit = () => {
    if (!title.trim()) return;
    const date = rangeMode ? startDate : defaultDate;
    const deadline = rangeMode ? endDate : '';
    onAdd({ date, title: title.trim(), description: desc.trim(), category: cat, createdAt: new Date().toISOString(), deadline });
    onClose();
  };

  const tabBtn = (active: boolean) => ({
    flex: 1, padding: '8px', border: 'none', borderRadius: 10,
    fontFamily: font, fontSize: 13, cursor: 'pointer',
    background: active ? '#111' : 'transparent', color: active ? '#fff' : '#aaa', fontWeight: active ? 600 : 400,
  });

  return (
    <div className="dash-sheet-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-sheet-box" style={{ background: 'var(--surface)', borderRadius: 20, padding: '32px 28px', width: 400, boxShadow: '0 12px 48px rgba(0,0,0,0.18)' }}>
        <p style={{ ...ttl, fontSize: 17, marginBottom: 16 }}>할 일 추가</p>

        {/* 당일 / 기간 토글 */}
        <div style={{ display: 'flex', background: 'var(--tab-bg)', borderRadius: 12, padding: 4, marginBottom: 16 }}>
          <button style={tabBtn(!rangeMode)} onClick={() => setRangeMode(false)}>당일</button>
          <button style={tabBtn(rangeMode)} onClick={() => setRangeMode(true)}>기간 설정</button>
        </div>

        {rangeMode && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ ...lbl, marginBottom: 5 }}>시작일</p>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inp }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ ...lbl, marginBottom: 5 }}>마감일</p>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={{ ...inp }} />
            </div>
          </div>
        )}

        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} placeholder="할 일 입력..."
          style={{ ...inp, marginBottom: 10 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}>
          {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="상세 설명 (선택)..." rows={2}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6, marginBottom: 20, minHeight: 60 }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', border: '1px solid #e5e5e5', borderRadius: 12, fontFamily: font, fontSize: 14, cursor: 'pointer', background: 'var(--cancel-bg)', color: 'var(--cancel-col)' }}>취소</button>
          <button onClick={submit} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: 12, fontFamily: font, fontSize: 14, cursor: 'pointer', background: '#111', color: '#fff', fontWeight: 600 }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ── AddProjectModal ───────────────────────────────────────────
function AddProjectModal({ cats, onAdd, onClose }: {
  cats: Category[]; onAdd: (p: Project) => void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState(cats[0]?.key ?? '');
  const [progress, setProgress] = useState(0);
  const [deadline, setDeadline] = useState('');
  const ok = name.trim() && deadline;
  const submit = () => {
    if (!ok) return;
    onAdd({ id: new Date().toISOString(), name: name.trim(), category: cat, progress, deadline, memo: '' });
    onClose();
  };
  return (
    <div className="dash-sheet-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-sheet-box" style={{ background: 'var(--surface)', borderRadius: 20, padding: '32px 28px', width: 360, boxShadow: '0 12px 48px rgba(0,0,0,0.18)' }}>
        <p style={{ ...ttl, fontSize: 17, marginBottom: 20 }}>진행 중 추가</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="항목 이름..." style={{ ...inp, marginBottom: 10 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}>
          {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={lbl}>진행률</p><p style={{ ...lbl, color: '#555', fontWeight: 600 }}>{progress}%</p>
          </div>
          <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(Number(e.target.value))} style={{ width: '100%', accentColor: '#111' }} />
        </div>
        <p style={{ ...lbl, marginBottom: 6 }}>마감일</p>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...inp, marginBottom: 24 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', border: '1px solid #e5e5e5', borderRadius: 12, fontFamily: font, fontSize: 14, cursor: 'pointer', background: 'var(--cancel-bg)', color: 'var(--cancel-col)' }}>취소</button>
          <button onClick={submit} disabled={!ok} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: 12, fontFamily: font, fontSize: 14, cursor: ok ? 'pointer' : 'default', background: ok ? '#111' : '#e5e5e5', color: ok ? '#fff' : '#aaa', fontWeight: 600 }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────
function SettingsPanel({ cats, darkMode, onToggleDark, onUpdate, onAdd, onDelete, onClose }: {
  cats: Category[]; darkMode: boolean; onToggleDark: () => void;
  onUpdate: (key: string, field: 'label' | 'color', val: string) => void;
  onAdd: () => void; onDelete: (key: string) => void; onClose: () => void;
}) {
  const [pingResult, setPingResult] = useState('');
  const [pinging, setPinging] = useState(false);

  const doPing = async () => {
    setPinging(true); setPingResult('');
    try {
      const res = await fetch('/api/sheets?action=ping');
      const data = await res.json();
      if (data.error) setPingResult(`오류: ${data.error}`);
      else setPingResult(`연결됨 ✓  시트: ${(data.sheets ?? []).join(', ') || '없음'}`);
    } catch (e: any) {
      setPingResult(`실패: ${e.message}`);
    } finally {
      setPinging(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-settings" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: '36px 24px', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <p style={{ ...ttl, fontSize: 16 }}>설정</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>✕</button>
        </div>

        {/* Dark mode toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, padding: '14px 16px', background: 'var(--bg)', borderRadius: 12 }}>
          <p style={{ ...lbl, textTransform: 'uppercase', letterSpacing: '0.08em' }}>다크 모드</p>
          <button onClick={onToggleDark} style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: darkMode ? '#22c55e' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 3, left: darkMode ? 23 : 3, transition: 'left 0.2s',
            }} />
          </button>
        </div>

        {/* Connection test */}
        <div style={{ marginBottom: 28, padding: '16px', background: 'var(--bg)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pingResult ? 10 : 0 }}>
            <p style={{ ...lbl, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sheets 연결</p>
            <button onClick={doPing} disabled={pinging} style={{ ...ghostBtn(true), fontSize: 11 }}>
              {pinging ? '확인 중...' : '테스트'}
            </button>
          </div>
          {pingResult && (
            <p style={{ fontFamily: font, fontSize: 12, color: pingResult.startsWith('연결됨') ? '#22c55e' : '#ef4444', marginTop: 8, lineHeight: 1.5 }}>{pingResult}</p>
          )}
        </div>

        <p style={{ ...lbl, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>카테고리 관리</p>
        {cats.map(c => (
          <div key={c.key} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={c.color} onChange={e => onUpdate(c.key, 'color', e.target.value)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
              <input value={c.label} onChange={e => onUpdate(c.key, 'label', e.target.value)}
                style={{ ...inp, padding: '8px 12px', fontSize: 13, flex: 1 }} />
              <button onClick={() => onDelete(c.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '4px', flexShrink: 0 }}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={onAdd} style={{ ...ghostBtn(true), marginTop: 4, marginBottom: 24, textAlign: 'center' as const, width: '100%', padding: '10px' }}>
          + 카테고리 추가
        </button>
        <div style={{ flex: 1 }} />
        <p style={{ ...lbl, fontSize: 10, textAlign: 'center' as const, lineHeight: 1.6 }}>카테고리는 로컬 및 Sheets에 자동 저장됩니다</p>
      </div>
    </div>
  );
}

// ── MonthBar ──────────────────────────────────────────────────
function MonthBar({ year, month, selectedYMD, cats, allTasks, onDayClick }: {
  year: number; month: number; selectedYMD: string;
  cats: Category[]; allTasks: Record<string, Task[]>; onDayClick: (date: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = getDaysInMonth(year, month);
  const todayYMD = toYMD(new Date());
  const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
  const catMap = Object.fromEntries(cats.map(c => [c.key, c.color]));
  const counts = Array.from({ length: days }, (_, i) => {
    const ds = `${prefix}-${String(i+1).padStart(2,'0')}`;
    return getTasksForDate(allTasks, ds).filter(t => !t.done).length;
  });
  const maxCount = Math.max(...counts, 1);
  const BAR_MAX = 52;

  useEffect(() => {
    if (!scrollRef.current) return;
    const day = parseInt(selectedYMD.split('-')[2], 10);
    const btn = scrollRef.current.children[day - 1] as HTMLElement;
    btn?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedYMD]);

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: 'var(--bg)', borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ padding: '10px 4vw 16px' }}>
        <p style={{ ...lbl, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{MONTH_NAMES[month]} {year}</p>
        <div ref={scrollRef} className="dash-month-scroll">
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const dateStr = `${prefix}-${String(day).padStart(2,'0')}`;
            const dayTasks = getTasksForDate(allTasks, dateStr);
            const activeTasks = dayTasks.filter(t => !t.done);
            const isSel = dateStr === selectedYMD;
            const isToday = dateStr === todayYMD;
            const barH = activeTasks.length === 0 ? 4 : Math.max(8, Math.round((activeTasks.length / maxCount) * BAR_MAX));
            return (
              <button key={day} onClick={() => onDayClick(new Date(year, month, day))}
                title={`${month+1}/${day} — ${dayTasks.length}개`}
                className="dash-day-btn"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, height: BAR_MAX + 20 }}>
                <div style={{ width: '100%', height: barH, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', gap: 1 }}>
                  {activeTasks.length === 0
                    ? <div style={{ width: '100%', flex: 1, background: 'var(--border)', borderRadius: 3 }} />
                    : activeTasks.slice(0, 8).map((t, ti) => (
                        <div key={ti} style={{ width: '100%', flex: 1, background: catMap[t.category] ?? '#ccc', minHeight: 3, borderRadius: 1 }} />
                      ))
                  }
                </div>
                <span style={{ fontFamily: font, fontSize: 9, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: isSel ? 'var(--text)' : isToday ? 'var(--text-sub)' : 'var(--border)', fontWeight: isSel || isToday ? 700 : 400, borderBottom: isSel ? '1.5px solid var(--text)' : '1.5px solid transparent', paddingBottom: 1 }}>{day}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [sel, setSel] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Record<string, Task[]>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [cats, setCats] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [goal, setGoal] = useState('');
  const [goalEditing, setGoalEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('dashboard_dark') === '1'; } catch { return false; }
  });
  const [now, setNow] = useState(new Date());
  // Sync status: idle | syncing | ok | fail
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'ok' | 'fail'>('idle');
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSyncAndReset = (s: 'ok' | 'fail') => {
    setSyncState(s);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => setSyncState('idle'), 2500);
  };

  const syncPost = async (body: object) => {
    setSyncState('syncing');
    try {
      await apiPost(body);
      setSyncAndReset('ok');
    } catch {
      setSyncAndReset('fail');
    }
  };

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try { localStorage.setItem('dashboard_dark', darkMode ? '1' : '0'); } catch {}
  }, [darkMode]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auth
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') setAuthed(true);
    else window.location.replace('/');
    setReady(true);
  }, []);

  // Init
  useEffect(() => {
    if (!authed) return;
    const localCats = loadCategories();
    setCats(localCats); applyCSS(localCats);
    fetchCategoriesRemote().then(remote => {
      if (remote) { setCats(remote); applyCSS(remote); saveCategories(remote); }
    });
    setProjects(loadProjects());
    fetchProjectsRemote().then(remote => { if (remote) { setProjects(remote); saveProjects(remote); } });
    const today = new Date(); setSel(today);
    setGoal(localStorage.getItem(`${GOAL_KEY}_${toYMD(today)}`) ?? '');

    // 전체 task 한 번에 로드
    const localAll = loadAllTasks();
    setAllTasks(localAll);
    setTasks(getTasksForDate(localAll, toYMD(today)));
    fetchAllTasksRemote().then(all => {
      if (all) {
        setAllTasks(all);
        saveAllTasks(all);
        setTasks(getTasksForDate(all, toYMD(today)));
      }
    });
  }, [authed]);

  // 날짜 변경 시 allTasks에서 즉시 반영 (range 포함, 네트워크 요청 없음)
  useEffect(() => {
    if (!authed) return;
    setTasks(getTasksForDate(allTasks, toYMD(sel)));
  }, [sel, allTasks]);

  // Category handlers
  const handleCatUpdate = (key: string, field: 'label' | 'color', val: string) => {
    setCats(prev => {
      const updated = prev.map(c => c.key === key ? { ...c, [field]: val } : c);
      saveCategories(updated); applyCSS(updated);
      syncPost({ action: 'saveCategories', categories: updated });
      return updated;
    });
  };
  const handleCatAdd = () => {
    const key = `cat_${genKey()}`;
    const colors = ['#06b6d4','#f59e0b','#84cc16','#ec4899','#8b5cf6','#14b8a6'];
    const color = colors[cats.length % colors.length];
    const newCat: Category = { key, label: '새 카테고리', color };
    setCats(prev => {
      const updated = [...prev, newCat];
      saveCategories(updated); applyCSS(updated);
      syncPost({ action: 'saveCategories', categories: updated });
      return updated;
    });
  };
  const handleCatDelete = (key: string) => {
    setCats(prev => {
      const updated = prev.filter(c => c.key !== key);
      saveCategories(updated);
      syncPost({ action: 'saveCategories', categories: updated });
      return updated;
    });
  };

  // Task handlers
  const handleToggle = (task: Task) => {
    const done = !task.done;
    const d = toYMD(sel);
    setTasks(prev => {
      const u = prev.map(t => t.createdAt === task.createdAt ? { ...t, done } : t);
      saveTasks(d, u);
      setAllTasks(a => { const n = { ...a, [d]: u }; saveAllTasks(n); return n; });
      return u;
    });
    syncPost({ action: 'updateTask', createdAt: task.createdAt, done });
  };
  const handleUpdate = (task: Task, title: string, category: string, description: string) => {
    const d = toYMD(sel);
    setTasks(prev => {
      const u = prev.map(t => t.createdAt === task.createdAt ? { ...t, title, category, description } : t);
      saveTasks(d, u);
      setAllTasks(a => { const n = { ...a, [d]: u }; saveAllTasks(n); return n; });
      return u;
    });
    syncPost({ action: 'updateTask', createdAt: task.createdAt, title, category, description });
  };
  const handleDelete = (task: Task) => {
    const d = toYMD(sel);
    setTasks(prev => {
      const u = prev.filter(t => t.createdAt !== task.createdAt);
      saveTasks(d, u);
      setAllTasks(a => { const n = { ...a, [d]: u }; saveAllTasks(n); return n; });
      return u;
    });
    syncPost({ action: 'deleteTask', createdAt: task.createdAt });
  };
  const handleAdd = (newTask: Omit<Task, 'done'>) => {
    const task: Task = { ...newTask, done: false };
    setTasks(prev => {
      const u = [...prev, task];
      saveTasks(newTask.date, u);
      setAllTasks(a => { const n = { ...a, [newTask.date]: u }; saveAllTasks(n); return n; });
      return u;
    });
    syncPost({ action: 'addTask', ...task });
  };

  // Project handlers
  const handleAddProject = (p: Project) => {
    const u = [...projects, p]; setProjects(u); saveProjects(u);
    syncPost({ action: 'addProject', ...p });
  };
  const handleDeleteProject = (id: string) => {
    const u = projects.filter(p => p.id !== id); setProjects(u); saveProjects(u);
    syncPost({ action: 'deleteProject', id });
  };

  const saveGoal = () => { localStorage.setItem(`${GOAL_KEY}_${toYMD(new Date())}`, goal); setGoalEditing(false); };
  const logout = () => { sessionStorage.removeItem(SESSION_KEY); window.location.replace('/'); };

  if (!ready || !authed) return null;

  const selYMD = toYMD(sel);
  const todayYMD = toYMD(new Date());

  const syncDot = syncState === 'syncing' ? '#facc15'
    : syncState === 'ok' ? '#22c55e'
    : syncState === 'fail' ? '#ef4444'
    : '#22c55e'; // idle = green (connected)

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
        :root{
          --bg:#f8f8f6;--surface:#ffffff;--border:#ebebeb;
          --text:#111111;--text-sub:#999999;--muted:#aaaaaa;
          --input-bg:#ffffff;--input-border:#e5e5e5;
          --cancel-bg:#fafafa;--cancel-col:#888888;--tab-bg:#f0f0f0;
        }
        html.dark{
          --bg:#141414;--surface:#1e1e1e;--border:#2a2a2a;
          --text:#efefef;--text-sub:#888888;--muted:#606060;
          --input-bg:#252525;--input-border:#333333;
          --cancel-bg:#252525;--cancel-col:#888888;--tab-bg:#252525;
        }
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:var(--bg);transition:background 0.2s;}
        ::-webkit-scrollbar{width:0;height:0;}
        input,select,textarea{color:var(--text) !important;background:var(--input-bg) !important;font-family:${font};}
        input::placeholder,textarea::placeholder{color:var(--muted) !important;}
        input[type="color"]{-webkit-appearance:none;appearance:none;}
        input[type="color"]::-webkit-color-swatch-wrapper{padding:0;}
        input[type="color"]::-webkit-color-swatch{border:none;border-radius:50%;}
        input[type="range"]{accent-color:var(--text);}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .syncing{animation:pulse 1s ease-in-out infinite;}
        .dash-pad{padding:48px 6vw 0;}
        .dash-day-btn{flex:1;}
        .dash-month-scroll{display:flex;gap:2px;align-items:flex-end;}
        .dash-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
        @media(max-width:640px){
          .dash-pad{padding:28px 5vw 0 !important;}
          .dash-sheet-overlay{align-items:flex-end !important;}
          .dash-sheet-box{width:100% !important;border-radius:20px 20px 0 0 !important;max-height:88vh;overflow-y:auto;padding-bottom:max(env(safe-area-inset-bottom),16px) !important;}
          .dash-settings{width:100vw !important;}
          .dash-month-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
          .dash-day-btn{flex:none !important;min-width:34px;}
          .dash-grid{grid-template-columns:repeat(2,1fr);}
        }
      `}</style>

      <main style={{ background: 'var(--bg)', minHeight: '100vh', fontFamily: font, paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="dash-pad">

          {/* Header */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div
                  className={syncState === 'syncing' ? 'syncing' : ''}
                  style={{ width: 10, height: 10, borderRadius: '50%', background: syncDot, transition: 'background 0.3s', flexShrink: 0 }}
                  title={syncState === 'syncing' ? '동기화 중...' : syncState === 'fail' ? '동기화 실패' : '연결됨'}
                />
              </div>
              <h1 style={{ fontSize: 'clamp(38px,5vw,64px)', fontWeight: 800, color: 'var(--text)', lineHeight: 1.02, letterSpacing: '-0.03em', fontFamily: font }}>
                {DAY_NAMES[sel.getDay()]}, {sel.getDate()}
                <span style={{ fontSize: 'clamp(18px,2.2vw,28px)', fontWeight: 300, color: 'var(--muted)', marginLeft: 16, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
                  {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}:{String(now.getSeconds()).padStart(2,'0')}
                </span>
              </h1>
              <p style={{ fontSize: 20, fontWeight: 300, color: 'var(--text-sub)', marginTop: 6, fontFamily: font }}>
                {MONTH_NAMES[sel.getMonth()]} {sel.getFullYear()}
                {selYMD !== todayYMD && <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 12 }}>오늘이 아님</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
              <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '50%', width: 42, height: 42, cursor: 'pointer', fontSize: 16, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙</button>
              <button onClick={logout} style={ghostBtn()}>나가기</button>
            </div>
          </header>

          {/* Goal */}
          <div style={{ marginBottom: 44 }}>
            {goalEditing
              ? <input autoFocus value={goal} onChange={e => setGoal(e.target.value)} onBlur={saveGoal}
                  onKeyDown={e => e.key === 'Enter' && saveGoal()} placeholder="오늘의 목표..."
                  style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', width: '100%', fontFamily: font, fontSize: 18, color: 'var(--text)', padding: '4px 0' }} />
              : <p onClick={() => setGoalEditing(true)} style={{ fontSize: 18, color: goal ? 'var(--text)' : 'var(--border)', cursor: 'text', padding: '4px 0', fontFamily: font }}>
                  {goal || '오늘의 목표...'}
                </p>
            }
          </div>

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 44 }} />

          {/* Tasks */}
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ ...ttl, fontSize: 16 }}>
                {selYMD === todayYMD ? '오늘 할 일' : `${sel.getMonth()+1}월 ${sel.getDate()}일 할 일`}
              </h2>
              <button onClick={() => setShowAddTask(true)} style={ghostBtn()}>+ 추가</button>
            </div>
            {tasks.length === 0
              ? <div style={{ textAlign: 'center', padding: '36px 0' }}>
                  <p style={{ ...lbl, marginBottom: 14 }}>할 일이 없습니다</p>
                  <button onClick={() => setShowAddTask(true)} style={ghostBtn()}>+ 할 일 추가</button>
                </div>
              : <div className="dash-grid">
                  {tasks.map(t => (
                    <TaskCard key={t.createdAt} task={t} cats={cats}
                      onToggle={() => handleToggle(t)}
                      onEdit={() => setEditingTask(t)}
                      onDelete={() => handleDelete(t)} />
                  ))}
                </div>
            }
          </section>

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 44 }} />

          {/* Projects */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ ...ttl, fontSize: 16 }}>진행 중</h2>
              <button onClick={() => setShowAddProject(true)} style={ghostBtn()}>+ 추가</button>
            </div>
            {projects.length === 0
              ? <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ ...lbl, marginBottom: 14 }}>진행 중인 항목이 없습니다</p>
                  <button onClick={() => setShowAddProject(true)} style={ghostBtn()}>+ 추가</button>
                </div>
              : <div className="dash-grid">
                  {projects.map(p => {
                    const dday = getDday(p.deadline);
                    const catObj = cats.find(c => c.key === p.category);
                    const color = catObj?.color ?? '#888';
                    return (
                      <div key={p.id} style={{ background: color, borderRadius: 16, padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', minHeight: 110 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <p style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.3,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flex: 1, marginRight: 6 }}>
                            {p.name}
                          </p>
                          <p style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: dday >= 0 && dday <= 3 ? 'rgba(255,255,100,0.95)' : 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {dday >= 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}
                          </p>
                        </div>
                        <p style={{ fontFamily: font, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 'auto', paddingBottom: 10 }}>{catObj?.label ?? p.category}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 999 }}>
                            <div style={{ height: '100%', width: `${p.progress}%`, background: 'rgba(255,255,255,0.85)', borderRadius: 999, transition: 'width 0.4s' }} />
                          </div>
                          <span style={{ fontFamily: font, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{p.progress}%</span>
                          <button onClick={() => handleDeleteProject(p.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </section>
        </div>
      </main>

      <MonthBar year={sel.getFullYear()} month={sel.getMonth()} selectedYMD={selYMD} cats={cats} allTasks={allTasks} onDayClick={setSel} />

      {showSettings && <SettingsPanel cats={cats} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} onUpdate={handleCatUpdate} onAdd={handleCatAdd} onDelete={handleCatDelete} onClose={() => setShowSettings(false)} />}
      {showAddTask && <AddTaskModal cats={cats} defaultDate={selYMD} onAdd={handleAdd} onClose={() => setShowAddTask(false)} />}
      {showAddProject && <AddProjectModal cats={cats} onAdd={handleAddProject} onClose={() => setShowAddProject(false)} />}
      {editingTask && (
        <EditTaskModal task={editingTask} cats={cats}
          onUpdate={(title, cat, description) => { handleUpdate(editingTask, title, cat, description); setEditingTask(null); }}
          onClose={() => setEditingTask(null)} />
      )}
    </>
  );
}
