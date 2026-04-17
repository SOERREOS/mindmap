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
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #ebebeb' };
const lbl: React.CSSProperties = { fontFamily: font, fontSize: 12, color: '#aaa', letterSpacing: '0.03em' };
const ttl: React.CSSProperties = { fontFamily: font, fontSize: 15, fontWeight: 600, color: '#111' };
const inp: React.CSSProperties = {
  border: '1px solid #e5e5e5', borderRadius: 12, padding: '12px 16px',
  fontFamily: font, fontSize: 14, outline: 'none', width: '100%',
  boxSizing: 'border-box', color: '#111', background: '#fff',
};
function ghostBtn(small = false): React.CSSProperties {
  return {
    background: 'none', border: '1px solid #e5e5e5', borderRadius: 999,
    padding: small ? '6px 14px' : '9px 20px',
    cursor: 'pointer', fontFamily: font,
    fontSize: small ? 12 : 13, color: '#666',
  };
}

// ── TaskCard ──────────────────────────────────────────────────
function TaskCard({ task, cats, onToggle, onUpdate, onDelete }: {
  task: Task; cats: Category[];
  onToggle: () => void;
  onUpdate: (title: string, cat: string, description: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [val, setVal] = useState(task.title);
  const [cat, setCat] = useState(task.category);
  const [desc, setDesc] = useState(task.description ?? '');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) titleRef.current?.focus(); }, [editing]);
  useEffect(() => {
    setVal(task.title); setCat(task.category); setDesc(task.description ?? '');
  }, [task.title, task.category, task.description]);

  const openEdit = () => {
    if (task.done) return;
    setVal(task.title); setCat(task.category); setDesc(task.description ?? '');
    setEditing(true); setExpanded(true);
  };
  const commit = () => {
    setEditing(false);
    const t = val.trim();
    if (t) onUpdate(t, cat, desc);
    else { setVal(task.title); setCat(task.category); setDesc(task.description ?? ''); }
  };
  const cancel = () => {
    setEditing(false);
    setVal(task.title); setCat(task.category); setDesc(task.description ?? '');
  };

  const catObj = cats.find(c => c.key === task.category);
  const color = catObj?.color ?? '#ccc';
  const hasDesc = (task.description ?? '').trim().length > 0;

  return (
    <div style={{ ...card, marginBottom: 8, opacity: task.done ? 0.45 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
        <div style={{ width: 4, borderRadius: 4, background: color, flexShrink: 0, alignSelf: 'stretch', minHeight: 36 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p onClick={openEdit} style={{ fontFamily: font, fontSize: 15, fontWeight: 500, color: '#111', cursor: task.done ? 'default' : 'pointer', textDecoration: task.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.title}
          </p>
          <p style={{ ...lbl, marginTop: 3 }}>
            {catObj?.label ?? task.category}{task.deadline ? ` · ${task.deadline}` : ''}
          </p>
        </div>
        {hasDesc && !editing && (
          <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 12, padding: '4px 6px', flexShrink: 0 }}>
            {expanded ? '▲' : '▼'}
          </button>
        )}
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e0e0e0', fontSize: 14, padding: '4px 6px', flexShrink: 0 }}>✕</button>
        <button onClick={onToggle} style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${task.done ? color : '#e0e0e0'}`, background: task.done ? color : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0, transition: 'all 0.15s' }}>
          {task.done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
        </button>
      </div>

      {hasDesc && !editing && expanded && (
        <div style={{ padding: '0 20px 16px 38px' }}>
          <p style={{ fontFamily: font, fontSize: 13, color: '#777', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{task.description}</p>
        </div>
      )}

      {editing && (
        <div style={{ padding: '0 20px 20px 38px' }}>
          <input ref={titleRef} value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
            style={{ ...inp, marginBottom: 10 }} placeholder="할 일 제목" />
          <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}>
            {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="상세 설명 (선택)..." rows={3}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6, marginBottom: 14, minHeight: 80 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={cancel} style={{ ...ghostBtn(true), flex: 1 }}>취소</button>
            <button onClick={commit} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 999, fontFamily: font, fontSize: 12, cursor: 'pointer', background: '#111', color: '#fff', fontWeight: 600 }}>저장</button>
          </div>
        </div>
      )}
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
  const [deadline, setDeadline] = useState('');
  const [desc, setDesc] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ date: defaultDate, title: title.trim(), description: desc.trim(), category: cat, createdAt: new Date().toISOString(), deadline });
    onClose();
  };
  return (
    <div className="dash-sheet-overlay" style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dash-sheet-box" style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: 400, boxShadow: '0 12px 48px rgba(0,0,0,0.12)' }}>
        <p style={{ ...ttl, fontSize: 17, marginBottom: 20 }}>할 일 추가</p>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="할 일 입력..." style={{ ...inp, marginBottom: 10 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}>
          {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="상세 설명 (선택)..." rows={3}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6, marginBottom: 10, minHeight: 72 }} />
        <p style={{ ...lbl, marginBottom: 6 }}>마감일 (선택)</p>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...inp, marginBottom: 24 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '13px', border: '1px solid #e5e5e5', borderRadius: 12, fontFamily: font, fontSize: 14, cursor: 'pointer', background: '#fafafa', color: '#888' }}>취소</button>
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
      <div className="dash-sheet-box" style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: 360, boxShadow: '0 12px 48px rgba(0,0,0,0.12)' }}>
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
          <button onClick={onClose} style={{ flex: 1, padding: '13px', border: '1px solid #e5e5e5', borderRadius: 12, fontFamily: font, fontSize: 14, cursor: 'pointer', background: '#fafafa', color: '#888' }}>취소</button>
          <button onClick={submit} disabled={!ok} style={{ flex: 1, padding: '13px', border: 'none', borderRadius: 12, fontFamily: font, fontSize: 14, cursor: ok ? 'pointer' : 'default', background: ok ? '#111' : '#e5e5e5', color: ok ? '#fff' : '#aaa', fontWeight: 600 }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────
function SettingsPanel({ cats, onUpdate, onAdd, onDelete, onClose }: {
  cats: Category[];
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
      <div className="dash-settings" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, background: '#fff', borderLeft: '1px solid #ebebeb', padding: '36px 24px', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.07)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <p style={{ ...ttl, fontSize: 16 }}>설정</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18 }}>✕</button>
        </div>

        {/* Connection test */}
        <div style={{ marginBottom: 28, padding: '16px', background: '#f8f8f6', borderRadius: 12 }}>
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
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e5e5e5', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
              <input value={c.label} onChange={e => onUpdate(c.key, 'label', e.target.value)}
                style={{ ...inp, padding: '8px 12px', fontSize: 13, flex: 1 }} />
              <button onClick={() => onDelete(c.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: 16, padding: '4px', flexShrink: 0 }}>✕</button>
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
    return (allTasks[ds] ?? []).filter(t => !t.done).length;
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
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: '#f8f8f6', borderTop: '1px solid #ebebeb', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ padding: '10px 4vw 16px' }}>
        <p style={{ ...lbl, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{MONTH_NAMES[month]} {year}</p>
        <div ref={scrollRef} className="dash-month-scroll">
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const dateStr = `${prefix}-${String(day).padStart(2,'0')}`;
            const dayTasks = allTasks[dateStr] ?? [];
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
                    ? <div style={{ width: '100%', flex: 1, background: '#ebebeb', borderRadius: 3 }} />
                    : activeTasks.slice(0, 8).map((t, ti) => (
                        <div key={ti} style={{ width: '100%', flex: 1, background: catMap[t.category] ?? '#ccc', minHeight: 3, borderRadius: 1 }} />
                      ))
                  }
                </div>
                <span style={{ fontFamily: font, fontSize: 9, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: isSel ? '#111' : isToday ? '#555' : '#ccc', fontWeight: isSel || isToday ? 700 : 400, borderBottom: isSel ? '1.5px solid #111' : '1.5px solid transparent', paddingBottom: 1 }}>{day}</span>
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
    setTasks(localAll[toYMD(today)] ?? []);
    fetchAllTasksRemote().then(all => {
      if (all) {
        setAllTasks(all);
        saveAllTasks(all);
        setTasks(all[toYMD(today)] ?? []);
      }
    });
  }, [authed]);

  // 날짜 변경 시 allTasks에서 즉시 반영 (네트워크 요청 없음)
  useEffect(() => {
    if (!authed) return;
    setTasks(allTasks[toYMD(sel)] ?? loadTasks(toYMD(sel)));
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
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#f8f8f6;}
        ::-webkit-scrollbar{width:0;height:0;}
        input,select,textarea{color:#111 !important;background:#fff;font-family:${font};}
        input::placeholder,textarea::placeholder{color:#ccc !important;}
        input[type="color"]{-webkit-appearance:none;appearance:none;}
        input[type="color"]::-webkit-color-swatch-wrapper{padding:0;}
        input[type="color"]::-webkit-color-swatch{border:none;border-radius:50%;}
        input[type="range"]{accent-color:#111;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .syncing{animation:pulse 1s ease-in-out infinite;}
        .dash-pad{padding:48px 6vw 0;}
        .dash-day-btn{flex:1;}
        .dash-month-scroll{display:flex;gap:2px;align-items:flex-end;}
        @media(max-width:640px){
          .dash-pad{padding:28px 5vw 0 !important;}
          .dash-sheet-overlay{align-items:flex-end !important;}
          .dash-sheet-box{width:100% !important;border-radius:20px 20px 0 0 !important;max-height:88vh;overflow-y:auto;padding-bottom:max(env(safe-area-inset-bottom),16px) !important;}
          .dash-settings{width:100vw !important;}
          .dash-month-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
          .dash-day-btn{flex:none !important;min-width:34px;}
        }
      `}</style>

      <main style={{ background: '#f8f8f6', minHeight: '100vh', fontFamily: font, paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="dash-pad">

          {/* Header */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: '#ccc', letterSpacing: '0.14em', textTransform: 'uppercase' }}>filum</span>
                <div
                  className={syncState === 'syncing' ? 'syncing' : ''}
                  style={{ width: 6, height: 6, borderRadius: '50%', background: syncDot, transition: 'background 0.3s' }}
                  title={syncState === 'syncing' ? '동기화 중...' : syncState === 'fail' ? '동기화 실패' : 'Sheets 연결됨'}
                />
              </div>
              <h1 style={{ fontSize: 'clamp(38px,5vw,64px)', fontWeight: 800, color: '#111', lineHeight: 1.02, letterSpacing: '-0.03em', fontFamily: font }}>
                {DAY_NAMES[sel.getDay()]}, {sel.getDate()}
              </h1>
              <p style={{ fontSize: 20, fontWeight: 300, color: '#999', marginTop: 6, fontFamily: font }}>
                {MONTH_NAMES[sel.getMonth()]} {sel.getFullYear()}
                {selYMD !== todayYMD && <span style={{ fontSize: 13, color: '#ccc', marginLeft: 12 }}>오늘이 아님</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
              <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: '50%', width: 42, height: 42, cursor: 'pointer', fontSize: 16, color: '#777', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙</button>
              <button onClick={logout} style={ghostBtn()}>나가기</button>
            </div>
          </header>

          {/* Goal */}
          <div style={{ marginBottom: 44 }}>
            {goalEditing
              ? <input autoFocus value={goal} onChange={e => setGoal(e.target.value)} onBlur={saveGoal}
                  onKeyDown={e => e.key === 'Enter' && saveGoal()} placeholder="오늘의 목표..."
                  style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #ddd', outline: 'none', width: '100%', fontFamily: font, fontSize: 18, color: '#333', padding: '4px 0' }} />
              : <p onClick={() => setGoalEditing(true)} style={{ fontSize: 18, color: goal ? '#333' : '#ddd', cursor: 'text', padding: '4px 0', fontFamily: font }}>
                  {goal || '오늘의 목표...'}
                </p>
            }
          </div>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 44 }} />

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
              : tasks.map(t => (
                  <TaskCard key={t.createdAt} task={t} cats={cats}
                    onToggle={() => handleToggle(t)}
                    onUpdate={(title, cat, description) => handleUpdate(t, title, cat, description)}
                    onDelete={() => handleDelete(t)} />
                ))
            }
          </section>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 44 }} />

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
              : projects.map(p => {
                  const dday = getDday(p.deadline);
                  const catObj = cats.find(c => c.key === p.category);
                  const color = catObj?.color ?? '#888';
                  return (
                    <div key={p.id} style={{ ...card, padding: '20px 24px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div>
                          <p style={{ fontFamily: font, fontSize: 15, fontWeight: 600, color: '#111' }}>{p.name}</p>
                          <p style={{ ...lbl, marginTop: 4 }}>{catObj?.label ?? p.category}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <p style={{ fontFamily: font, fontSize: 13, fontWeight: 700, color: dday >= 0 && dday <= 7 ? '#ef4444' : '#aaa', fontVariantNumeric: 'tabular-nums' }}>
                            {dday >= 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}
                          </p>
                          <button onClick={() => handleDeleteProject(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: 14 }}>✕</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, height: 4, background: '#f0f0f0', borderRadius: 999 }}>
                          <div style={{ height: '100%', width: `${p.progress}%`, background: color, borderRadius: 999, transition: 'width 0.4s' }} />
                        </div>
                        <span style={{ ...lbl, width: 36, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</span>
                      </div>
                    </div>
                  );
                })
            }
          </section>
        </div>
      </main>

      <MonthBar year={sel.getFullYear()} month={sel.getMonth()} selectedYMD={selYMD} cats={cats} allTasks={allTasks} onDayClick={setSel} />

      {showSettings && <SettingsPanel cats={cats} onUpdate={handleCatUpdate} onAdd={handleCatAdd} onDelete={handleCatDelete} onClose={() => setShowSettings(false)} />}
      {showAddTask && <AddTaskModal cats={cats} defaultDate={selYMD} onAdd={handleAdd} onClose={() => setShowAddTask(false)} />}
      {showAddProject && <AddProjectModal cats={cats} onAdd={handleAddProject} onClose={() => setShowAddProject(false)} />}
    </>
  );
}
