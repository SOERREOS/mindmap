'use client';
import { useEffect, useRef, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────
const SESSION_KEY = 'dashboard_auth';
const SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';
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
function loadProjects(): Project[] {
  try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]'); } catch { return []; }
}
function saveProjects(p: Project[]) {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(p)); } catch {}
}

// ── API ───────────────────────────────────────────────────────
async function apiGet(params: string): Promise<any> {
  const res = await fetch(`/api/sheets?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
async function apiPost(body: object) {
  if (!SCRIPT_URL) return;
  try {
    await fetch('/api/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {}
}

async function fetchTasksRemote(date: string): Promise<Task[] | null> {
  if (!SCRIPT_URL) return null;
  try {
    const d = await apiGet(`action=getTasks&date=${date}`);
    return Array.isArray(d) && d.length > 0 ? d : null;
  } catch { return null; }
}
async function fetchProjectsRemote(): Promise<Project[] | null> {
  if (!SCRIPT_URL) return null;
  try {
    const d = await apiGet('action=getProjects');
    return Array.isArray(d) && d.length > 0 ? d : null;
  } catch { return null; }
}
async function fetchCategoriesRemote(): Promise<Category[] | null> {
  if (!SCRIPT_URL) return null;
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

  // Reset local state when task prop changes
  useEffect(() => {
    setVal(task.title);
    setCat(task.category);
    setDesc(task.description ?? '');
  }, [task.title, task.category, task.description]);

  const openEdit = () => {
    if (task.done) return;
    setVal(task.title);
    setCat(task.category);
    setDesc(task.description ?? '');
    setEditing(true);
    setExpanded(true);
  };

  const commit = () => {
    setEditing(false);
    const t = val.trim();
    if (t) onUpdate(t, cat, desc);
    else { setVal(task.title); setCat(task.category); setDesc(task.description ?? ''); }
  };

  const cancel = () => {
    setEditing(false);
    setVal(task.title);
    setCat(task.category);
    setDesc(task.description ?? '');
  };

  const catObj = cats.find(c => c.key === task.category);
  const color = catObj?.color ?? '#ccc';
  const hasDesc = (task.description ?? '').trim().length > 0;

  return (
    <div style={{ ...card, marginBottom: 8, opacity: task.done ? 0.45 : 1, transition: 'opacity 0.2s' }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
        <div style={{ width: 4, borderRadius: 4, background: color, flexShrink: 0, alignSelf: 'stretch', minHeight: 36 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            onClick={openEdit}
            style={{
              fontFamily: font, fontSize: 15, fontWeight: 500, color: '#111',
              cursor: task.done ? 'default' : 'pointer',
              textDecoration: task.done ? 'line-through' : 'none',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {task.title}
          </p>
          <p style={{ ...lbl, marginTop: 3 }}>
            {catObj?.label ?? task.category}
            {task.deadline ? ` · ${task.deadline}` : ''}
          </p>
        </div>
        {/* expand toggle if has description */}
        {hasDesc && !editing && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 12, padding: '4px 6px', flexShrink: 0 }}
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}
        <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e0e0e0', fontSize: 14, padding: '4px 6px', flexShrink: 0 }}>✕</button>
        <button
          onClick={onToggle}
          style={{
            width: 26, height: 26, borderRadius: '50%',
            border: `2px solid ${task.done ? color : '#e0e0e0'}`,
            background: task.done ? color : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, padding: 0, transition: 'all 0.15s',
          }}
        >
          {task.done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
        </button>
      </div>

      {/* Description (read-only, expanded) */}
      {hasDesc && !editing && expanded && (
        <div style={{ padding: '0 20px 16px 38px' }}>
          <p style={{ fontFamily: font, fontSize: 13, color: '#777', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{task.description}</p>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div style={{ padding: '0 20px 20px 38px' }} onMouseDown={e => e.stopPropagation()}>
          <input
            ref={titleRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
            style={{ ...inp, marginBottom: 10 }}
            placeholder="할 일 제목"
          />
          <select
            value={cat}
            onChange={e => setCat(e.target.value)}
            style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}
          >
            {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="상세 설명 (선택)..."
            rows={3}
            style={{
              ...inp, resize: 'vertical', lineHeight: 1.6,
              marginBottom: 14, minHeight: 80,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={cancel} style={{ ...ghostBtn(true), flex: 1 }}>취소</button>
            <button
              onClick={commit}
              style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 999, fontFamily: font, fontSize: 12, cursor: 'pointer', background: '#111', color: '#fff', fontWeight: 600 }}
            >저장</button>
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
    onAdd({
      date: defaultDate,
      title: title.trim(),
      description: desc.trim(),
      category: cat,
      createdAt: new Date().toISOString(),
      deadline,
    });
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: 400, boxShadow: '0 12px 48px rgba(0,0,0,0.12)' }}>
        <p style={{ ...ttl, fontSize: 17, marginBottom: 20 }}>할 일 추가</p>
        <input
          autoFocus value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="할 일 입력..."
          style={{ ...inp, marginBottom: 10 }}
        />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}>
          {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="상세 설명 (선택)..."
          rows={3}
          style={{ ...inp, resize: 'vertical', lineHeight: 1.6, marginBottom: 10, minHeight: 72 }}
        />
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
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', width: 360, boxShadow: '0 12px 48px rgba(0,0,0,0.12)' }}>
        <p style={{ ...ttl, fontSize: 17, marginBottom: 20 }}>진행 중 추가</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="항목 이름..." style={{ ...inp, marginBottom: 10 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inp, marginBottom: 10, cursor: 'pointer' }}>
          {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={lbl}>진행률</p>
            <p style={{ ...lbl, color: '#555', fontWeight: 600 }}>{progress}%</p>
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
  onAdd: () => void;
  onDelete: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, background: '#fff', borderLeft: '1px solid #ebebeb', padding: '36px 24px', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.07)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <p style={{ ...ttl, fontSize: 16 }}>설정</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18 }}>✕</button>
        </div>
        <p style={{ ...lbl, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>카테고리 관리</p>
        {cats.map(c => (
          <div key={c.key} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <input
                type="color" value={c.color}
                onChange={e => onUpdate(c.key, 'color', e.target.value)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e5e5e5', cursor: 'pointer', padding: 2, flexShrink: 0 }}
              />
              <input
                value={c.label}
                onChange={e => onUpdate(c.key, 'label', e.target.value)}
                style={{ ...inp, padding: '8px 12px', fontSize: 13, flex: 1 }}
              />
              <button onClick={() => onDelete(c.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: 16, padding: '4px', flexShrink: 0 }}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={onAdd} style={{ ...ghostBtn(true), marginTop: 4, marginBottom: 24, textAlign: 'center' as const, width: '100%', padding: '10px' }}>
          + 카테고리 추가
        </button>
        <div style={{ flex: 1 }} />
        <p style={{ ...lbl, fontSize: 10, textAlign: 'center' as const, lineHeight: 1.6 }}>
          카테고리는 로컬 및 Sheets에 자동 저장됩니다
        </p>
      </div>
    </div>
  );
}

// ── MonthBar ──────────────────────────────────────────────────
function MonthBar({ year, month, selectedYMD, cats, onDayClick }: {
  year: number; month: number; selectedYMD: string;
  cats: Category[];
  onDayClick: (date: Date) => void;
}) {
  const days = getDaysInMonth(year, month);
  const allTasks = loadAllTasks();
  const todayYMD = toYMD(new Date());
  const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
  const catMap = Object.fromEntries(cats.map(c => [c.key, c.color]));

  const counts = Array.from({ length: days }, (_, i) => {
    const ds = `${prefix}-${String(i+1).padStart(2,'0')}`;
    return (allTasks[ds] ?? []).filter(t => !t.done).length;
  });
  const maxCount = Math.max(...counts, 1);
  const BAR_MAX = 52;

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: '#f8f8f6', borderTop: '1px solid #ebebeb' }}>
      <div style={{ padding: '10px 4vw 16px' }}>
        <p style={{ ...lbl, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {MONTH_NAMES[month]} {year}
        </p>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const dateStr = `${prefix}-${String(day).padStart(2,'0')}`;
            const dayTasks = allTasks[dateStr] ?? [];
            const activeTasks = dayTasks.filter(t => !t.done);
            const isSel = dateStr === selectedYMD;
            const isToday = dateStr === todayYMD;
            const barH = activeTasks.length === 0
              ? 4
              : Math.max(8, Math.round((activeTasks.length / maxCount) * BAR_MAX));

            return (
              <button key={day} onClick={() => onDayClick(new Date(year, month, day))}
                title={`${month+1}/${day} — ${dayTasks.length}개`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, height: BAR_MAX + 20 }}>
                <div style={{ width: '100%', height: barH, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', gap: 1 }}>
                  {activeTasks.length === 0
                    ? <div style={{ width: '100%', flex: 1, background: '#ebebeb', borderRadius: 3 }} />
                    : activeTasks.slice(0, 8).map((t, ti) => (
                        <div key={ti} style={{ width: '100%', flex: 1, background: catMap[t.category] ?? '#ccc', minHeight: 3, borderRadius: 1 }} />
                      ))
                  }
                </div>
                <span style={{
                  fontFamily: font, fontSize: 9, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  color: isSel ? '#111' : isToday ? '#555' : '#ccc',
                  fontWeight: isSel || isToday ? 700 : 400,
                  borderBottom: isSel ? '1.5px solid #111' : '1.5px solid transparent',
                  paddingBottom: 1,
                }}>{day}</span>
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [cats, setCats] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [goal, setGoal] = useState('');
  const [goalEditing, setGoalEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);

  // Auth
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') setAuthed(true);
    else window.location.replace('/');
    setReady(true);
  }, []);

  // Init: load local data instantly, then sync from Sheets
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
  }, [authed]);

  // Tasks: show local instantly, then sync
  useEffect(() => {
    if (!authed) return;
    const selYMD = toYMD(sel);
    setTasks(loadTasks(selYMD));
    fetchTasksRemote(selYMD).then(remote => {
      if (remote) { setTasks(remote); saveTasks(selYMD, remote); }
    });
  }, [authed, sel]);

  // Category handlers
  const handleCatUpdate = (key: string, field: 'label' | 'color', val: string) => {
    setCats(prev => {
      const updated = prev.map(c => c.key === key ? { ...c, [field]: val } : c);
      saveCategories(updated); applyCSS(updated);
      apiPost({ action: 'saveCategories', categories: updated });
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
      apiPost({ action: 'saveCategories', categories: updated });
      return updated;
    });
  };
  const handleCatDelete = (key: string) => {
    setCats(prev => {
      const updated = prev.filter(c => c.key !== key);
      saveCategories(updated);
      apiPost({ action: 'saveCategories', categories: updated });
      return updated;
    });
  };

  // Task handlers
  const handleToggle = async (task: Task) => {
    setTasks(prev => {
      const u = prev.map(t => t.createdAt === task.createdAt ? { ...t, done: !t.done } : t);
      saveTasks(toYMD(sel), u); return u;
    });
    await apiPost({ action: 'updateTask', createdAt: task.createdAt, done: !task.done });
  };
  const handleUpdate = async (task: Task, title: string, category: string, description: string) => {
    setTasks(prev => {
      const u = prev.map(t => t.createdAt === task.createdAt ? { ...t, title, category, description } : t);
      saveTasks(toYMD(sel), u); return u;
    });
    await apiPost({ action: 'updateTask', createdAt: task.createdAt, title, category, description });
  };
  const handleDelete = async (task: Task) => {
    setTasks(prev => {
      const u = prev.filter(t => t.createdAt !== task.createdAt);
      saveTasks(toYMD(sel), u); return u;
    });
    await apiPost({ action: 'deleteTask', createdAt: task.createdAt });
  };
  const handleAdd = async (newTask: Omit<Task, 'done'>) => {
    const task: Task = { ...newTask, done: false };
    setTasks(prev => {
      const u = [...prev, task];
      saveTasks(newTask.date, u); return u;
    });
    await apiPost({ action: 'addTask', ...task });
  };

  // Project handlers
  const handleAddProject = async (p: Project) => {
    const u = [...projects, p]; setProjects(u); saveProjects(u);
    await apiPost({ action: 'addProject', ...p });
  };
  const handleDeleteProject = async (id: string) => {
    const u = projects.filter(p => p.id !== id); setProjects(u); saveProjects(u);
    await apiPost({ action: 'deleteProject', id });
  };

  const saveGoal = () => {
    localStorage.setItem(`${GOAL_KEY}_${toYMD(new Date())}`, goal);
    setGoalEditing(false);
  };
  const logout = () => { sessionStorage.removeItem(SESSION_KEY); window.location.replace('/'); };

  if (!ready || !authed) return null;

  const selYMD = toYMD(sel);
  const todayYMD = toYMD(new Date());

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
      `}</style>

      <main style={{ background: '#f8f8f6', minHeight: '100vh', fontFamily: font, paddingBottom: 140 }}>
        <div style={{ padding: '48px 6vw 0' }}>

          {/* Header */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: '#ccc', letterSpacing: '0.14em', textTransform: 'uppercase' }}>filum</span>
                <div
                  style={{ width: 6, height: 6, borderRadius: '50%', background: SCRIPT_URL ? '#22c55e' : '#eab308' }}
                  title={SCRIPT_URL ? 'Sheets 연결됨' : '로컬 저장 중'}
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

      <MonthBar year={sel.getFullYear()} month={sel.getMonth()} selectedYMD={selYMD} cats={cats} onDayClick={setSel} />

      {showSettings && <SettingsPanel cats={cats} onUpdate={handleCatUpdate} onAdd={handleCatAdd} onDelete={handleCatDelete} onClose={() => setShowSettings(false)} />}
      {showAddTask && <AddTaskModal cats={cats} defaultDate={selYMD} onAdd={handleAdd} onClose={() => setShowAddTask(false)} />}
      {showAddProject && <AddProjectModal cats={cats} onAdd={handleAddProject} onClose={() => setShowAddProject(false)} />}
    </>
  );
}
