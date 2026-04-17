'use client';
import { useEffect, useRef, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────
const SESSION_KEY = 'dashboard_auth';
const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '';
const SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';
const COLORS_KEY = 'dashboard_category_colors';
const GOAL_KEY = 'dashboard_goal';
const TASKS_KEY = 'dashboard_tasks';
const PROJECTS_KEY = 'dashboard_projects';

type CategoryKey = 'assignment' | 'exam' | 'work' | 'tutoring' | 'study';

const DEFAULT_COLORS: Record<CategoryKey, { label: string; color: string }> = {
  assignment: { label: '대학 과제', color: '#3b82f6' },
  exam:       { label: '시험 준비', color: '#ef4444' },
  work:       { label: '업무',      color: '#f97316' },
  tutoring:   { label: '과외',      color: '#a855f7' },
  study:      { label: '개인 공부', color: '#22c55e' },
};

interface Task {
  date: string; title: string; category: CategoryKey;
  done: boolean; createdAt: string; deadline: string;
}
interface Project {
  id: string; name: string; progress: number;
  category: CategoryKey; deadline: string; memo: string;
}

// ── Utilities ─────────────────────────────────────────────────
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const font = "'Pretendard', sans-serif";

function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function getDday(deadline: string) {
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((new Date(deadline+'T00:00:00').getTime() - t.getTime()) / 86400000);
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate(); }

// ── localStorage ──────────────────────────────────────────────
function getColors(): Record<CategoryKey, { label: string; color: string }> {
  try { const s = localStorage.getItem(COLORS_KEY); return s ? JSON.parse(s) : { ...DEFAULT_COLORS }; }
  catch { return { ...DEFAULT_COLORS }; }
}
function saveColor(key: CategoryKey, color: string) {
  const c = getColors(); c[key].color = color;
  localStorage.setItem(COLORS_KEY, JSON.stringify(c));
}
function applyCSS(colors: Record<CategoryKey, { label: string; color: string }>) {
  Object.entries(colors).forEach(([k, v]) => document.documentElement.style.setProperty(`--color-${k}`, v.color));
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
async function apiFetchTasks(date: string): Promise<Task[]> {
  if (!SCRIPT_URL) return loadTasks(date);
  try {
    const res = await fetch(`/api/sheets?action=getTasks&date=${date}`);
    if (!res.ok) return loadTasks(date);
    const data = await res.json();
    if (data.error) return loadTasks(date);
    return data;
  } catch { return loadTasks(date); }
}
async function apiFetchProjects(): Promise<Project[]> {
  if (!SCRIPT_URL) return loadProjects();
  try {
    const res = await fetch('/api/sheets?action=getProjects');
    if (!res.ok) return loadProjects();
    const data = await res.json();
    if (data.error) return loadProjects();
    return data;
  } catch { return loadProjects(); }
}
async function apiPost(body: object) {
  if (!SCRIPT_URL) return;
  try { await fetch('/api/sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch {}
}

// ── Gemini ────────────────────────────────────────────────────
async function analyzeWithGemini(tasks: Task[], projects: Project[], colors: Record<CategoryKey, { label: string; color: string }>): Promise<string> {
  const tl = tasks.filter(t => !t.done).map(t => `- [${colors[t.category]?.label}] ${t.title}${t.deadline ? ` (마감: ${t.deadline})` : ''}`).join('\n') || '(없음)';
  const pl = projects.map(p => { const d = getDday(p.deadline); return `- ${p.name}: ${p.progress}%, ${d >= 0 ? `D-${d}` : `D+${Math.abs(d)}`}`; }).join('\n') || '(없음)';
  const prompt = `오늘 할 일 목록 보고 우선순위 견해를 한국어로 3-4문장 이내, 번호 매겨 순위 포함, 일반 텍스트로.\n\n[오늘 할 일]\n${tl}\n\n[진행 중]\n${pl}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Shared styles ─────────────────────────────────────────────
const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #ebebeb' };
const lbl: React.CSSProperties = { fontFamily: font, fontSize: 11, color: '#aaa', letterSpacing: '0.04em' };
const ttl: React.CSSProperties = { fontFamily: font, fontSize: 14, fontWeight: 600, color: '#111' };
const inp: React.CSSProperties = { border: '1px solid #e5e5e5', borderRadius: 10, padding: '10px 12px', fontFamily: font, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', color: '#111', background: '#fff' };
const ghostBtn = (): React.CSSProperties => ({ background: 'none', border: '1px solid #e5e5e5', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', fontFamily: font, fontSize: 12, color: '#666' });

// ── TaskCard ──────────────────────────────────────────────────
function TaskCard({ task, colors, onToggle, onUpdate, onDelete }: {
  task: Task; colors: Record<CategoryKey, { label: string; color: string }>;
  onToggle: () => void; onUpdate: (title: string, cat: CategoryKey) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(task.title);
  const [cat, setCat] = useState<CategoryKey>(task.category);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const commit = () => {
    setEditing(false);
    const t = val.trim();
    if (t) onUpdate(t, cat); else { setVal(task.title); setCat(task.category); }
  };
  const color = colors[task.category]?.color ?? '#888';
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 6, opacity: task.done ? 0.4 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ width: 3, height: 32, borderRadius: 3, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <>
            <input ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setVal(task.title); setCat(task.category); } }}
              style={{ ...inp, padding: '2px 0', border: 'none', borderBottom: '1px solid #ddd', borderRadius: 0, fontSize: 14, fontWeight: 500, marginBottom: 6 }} />
            <select value={cat} onChange={e => setCat(e.target.value as CategoryKey)}
              style={{ ...inp, padding: '4px 8px', borderRadius: 6, fontSize: 11, width: 'auto' }}>
              {(Object.entries(colors) as [CategoryKey, { label: string; color: string }][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p onClick={() => !task.done && setEditing(true)} style={{ fontFamily: font, fontSize: 14, fontWeight: 500, color: '#111', cursor: task.done ? 'default' : 'text', textDecoration: task.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</p>
            <p style={{ ...lbl, marginTop: 2 }}>{colors[task.category]?.label ?? task.category}{task.deadline ? ` · ${task.deadline}` : ''}</p>
          </>
        )}
      </div>
      <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}>✕</button>
      <button onClick={onToggle} style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${task.done ? color : '#e0e0e0'}`, background: task.done ? color : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}>
        {task.done && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, lineHeight: 1 }}>✓</span>}
      </button>
    </div>
  );
}

// ── AddTaskModal ──────────────────────────────────────────────
function AddTaskModal({ colors, defaultDate, onAdd, onClose }: {
  colors: Record<CategoryKey, { label: string; color: string }>; defaultDate: string;
  onAdd: (t: Omit<Task, 'done'>) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryKey>('assignment');
  const [deadline, setDeadline] = useState('');
  const submit = () => { if (!title.trim()) return; onAdd({ date: defaultDate, title: title.trim(), category, createdAt: new Date().toISOString(), deadline }); onClose(); };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.1)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '24px 22px', width: 320, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <p style={{ ...ttl, marginBottom: 16 }}>할 일 추가</p>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="할 일 입력..." style={{ ...inp, marginBottom: 8 }} />
        <select value={category} onChange={e => setCategory(e.target.value as CategoryKey)} style={{ ...inp, marginBottom: 8, cursor: 'pointer' }}>
          {(Object.entries(colors) as [CategoryKey, { label: string; color: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <p style={{ ...lbl, marginBottom: 4 }}>마감일 (선택)</p>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...inp, marginBottom: 18 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1px solid #e5e5e5', borderRadius: 10, fontFamily: font, fontSize: 13, cursor: 'pointer', background: '#fafafa', color: '#888' }}>취소</button>
          <button onClick={submit} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 10, fontFamily: font, fontSize: 13, cursor: 'pointer', background: '#111', color: '#fff', fontWeight: 600 }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ── AddProjectModal ───────────────────────────────────────────
function AddProjectModal({ colors, onAdd, onClose }: {
  colors: Record<CategoryKey, { label: string; color: string }>;
  onAdd: (p: Project) => void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryKey>('assignment');
  const [progress, setProgress] = useState(0);
  const [deadline, setDeadline] = useState('');
  const ok = name.trim() && deadline;
  const submit = () => { if (!ok) return; onAdd({ id: new Date().toISOString(), name: name.trim(), category, progress, deadline, memo: '' }); onClose(); };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.1)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '24px 22px', width: 320, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <p style={{ ...ttl, marginBottom: 16 }}>진행 중 추가</p>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="항목 이름..." style={{ ...inp, marginBottom: 8 }} />
        <select value={category} onChange={e => setCategory(e.target.value as CategoryKey)} style={{ ...inp, marginBottom: 8, cursor: 'pointer' }}>
          {(Object.entries(colors) as [CategoryKey, { label: string; color: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={lbl}>진행률</p><p style={{ ...lbl, color: '#555', fontWeight: 600 }}>{progress}%</p>
          </div>
          <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(Number(e.target.value))} style={{ width: '100%', accentColor: '#111' }} />
        </div>
        <p style={{ ...lbl, marginBottom: 4 }}>마감일</p>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...inp, marginBottom: 18 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1px solid #e5e5e5', borderRadius: 10, fontFamily: font, fontSize: 13, cursor: 'pointer', background: '#fafafa', color: '#888' }}>취소</button>
          <button onClick={submit} disabled={!ok} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 10, fontFamily: font, fontSize: 13, cursor: ok ? 'pointer' : 'default', background: ok ? '#111' : '#e5e5e5', color: ok ? '#fff' : '#aaa', fontWeight: 600 }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────
function SettingsPanel({ colors, onColorChange, onReset, onClose }: {
  colors: Record<CategoryKey, { label: string; color: string }>;
  onColorChange: (k: CategoryKey, c: string) => void; onReset: () => void; onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 260, background: '#fff', borderLeft: '1px solid #ebebeb', padding: '28px 20px', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <p style={ttl}>설정</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 16 }}>✕</button>
        </div>
        <p style={{ ...lbl, marginBottom: 14 }}>카테고리 색상</p>
        {(Object.entries(colors) as [CategoryKey, { label: string; color: string }][]).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: v.color }} />
              <span style={{ fontFamily: font, fontSize: 13, color: '#333' }}>{v.label}</span>
            </div>
            <input type="color" value={v.color} onChange={e => onColorChange(k, e.target.value)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #e5e5e5', cursor: 'pointer', padding: 2 }} />
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onReset} style={{ padding: '11px', border: '1px solid #e5e5e5', borderRadius: 10, fontFamily: font, fontSize: 12, cursor: 'pointer', background: '#fafafa', color: '#888' }}>기본값으로 초기화</button>
      </div>
    </div>
  );
}

// ── MonthBar (fixed bottom) ───────────────────────────────────
function MonthBar({ year, month, selectedYMD, colors, onDayClick }: {
  year: number; month: number; selectedYMD: string;
  colors: Record<CategoryKey, { label: string; color: string }>;
  onDayClick: (date: Date) => void;
}) {
  const days = getDaysInMonth(year, month);
  const allTasks = loadAllTasks();
  const todayYMD = toYMD(new Date());
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  // max blocks per day (for scaling bar height)
  const counts = Array.from({ length: days }, (_, i) => {
    const dateStr = `${prefix}-${String(i + 1).padStart(2, '0')}`;
    return (allTasks[dateStr] ?? []).length;
  });
  const maxCount = Math.max(...counts, 1);
  const BAR_MAX_H = 48; // px

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: '#f8f8f6', borderTop: '1px solid #ebebeb' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '10px 16px 14px' }}>
        {/* month label */}
        <p style={{ ...lbl, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {MONTH_NAMES[month]} {year}
        </p>
        {/* day columns */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: BAR_MAX_H + 22 }}>
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1;
            const dateStr = `${prefix}-${String(day).padStart(2, '0')}`;
            const dayTasks = allTasks[dateStr] ?? [];
            const isSel = dateStr === selectedYMD;
            const isToday = dateStr === todayYMD;
            const barH = dayTasks.length === 0 ? 4 : Math.max(6, Math.round((dayTasks.length / maxCount) * BAR_MAX_H));

            return (
              <button
                key={day}
                onClick={() => onDayClick(new Date(year, month, day))}
                title={`${month + 1}/${day}  ${dayTasks.length}개`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, height: BAR_MAX_H + 22 }}
              >
                {/* stacked blocks */}
                <div style={{ width: '100%', height: barH, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', gap: 1 }}>
                  {dayTasks.length === 0 ? (
                    <div style={{ width: '100%', flex: 1, background: '#ebebeb', borderRadius: 3 }} />
                  ) : (
                    dayTasks.slice(0, 8).map((t, ti) => (
                      <div key={ti} style={{ width: '100%', flex: 1, background: colors[t.category]?.color ?? '#ccc', opacity: t.done ? 0.3 : 1, minHeight: 3 }} />
                    ))
                  )}
                </div>
                {/* day number */}
                <span style={{
                  fontFamily: font, fontSize: 9, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  color: isSel ? '#111' : isToday ? '#666' : '#bbb',
                  fontWeight: isSel || isToday ? 700 : 400,
                  borderBottom: isSel ? '2px solid #111' : '2px solid transparent',
                  paddingBottom: 1,
                }}>
                  {day}
                </span>
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
  const [colors, setColors] = useState<Record<CategoryKey, { label: string; color: string }>>(DEFAULT_COLORS);
  const [goal, setGoal] = useState('');
  const [goalEditing, setGoalEditing] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTime, setAiTime] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') setAuthed(true);
    else window.location.replace('/');
    setReady(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    const c = getColors(); setColors(c); applyCSS(c);
    const today = new Date(); setSel(today);
    setGoal(localStorage.getItem(`${GOAL_KEY}_${toYMD(today)}`) ?? '');
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    setLoading(true); setAiResult(''); setAiTime('');
    apiFetchTasks(toYMD(sel)).then(setTasks).finally(() => setLoading(false));
  }, [authed, sel]);

  useEffect(() => {
    if (!authed) return;
    apiFetchProjects().then(setProjects);
  }, [authed]);

  const handleColorChange = (key: CategoryKey, color: string) => {
    saveColor(key, color); const c = getColors(); setColors(c); applyCSS(c);
  };
  const handleResetColors = () => {
    localStorage.removeItem(COLORS_KEY); const c = { ...DEFAULT_COLORS }; setColors(c); applyCSS(c);
  };

  const handleToggle = async (task: Task) => {
    setTasks(prev => { const u = prev.map(t => t.createdAt === task.createdAt ? { ...t, done: !t.done } : t); saveTasks(toYMD(sel), u); return u; });
    await apiPost({ action: 'updateTask', createdAt: task.createdAt, done: !task.done });
  };
  const handleUpdate = async (task: Task, title: string, cat: CategoryKey) => {
    setTasks(prev => { const u = prev.map(t => t.createdAt === task.createdAt ? { ...t, title, category: cat } : t); saveTasks(toYMD(sel), u); return u; });
    await apiPost({ action: 'updateTask', createdAt: task.createdAt, title, category: cat });
  };
  const handleDelete = async (task: Task) => {
    setTasks(prev => { const u = prev.filter(t => t.createdAt !== task.createdAt); saveTasks(toYMD(sel), u); return u; });
    await apiPost({ action: 'deleteTask', createdAt: task.createdAt });
  };
  const handleAdd = async (newTask: Omit<Task, 'done'>) => {
    const task: Task = { ...newTask, done: false };
    setTasks(prev => { const u = [...prev, task]; saveTasks(newTask.date, u); return u; });
    await apiPost({ action: 'addTask', ...task });
  };
  const handleAddProject = async (p: Project) => {
    const u = [...projects, p]; setProjects(u);
    if (!SCRIPT_URL) saveProjects(u);
    await apiPost({ action: 'addProject', ...p });
  };
  const handleDeleteProject = async (id: string) => {
    const u = projects.filter(p => p.id !== id); setProjects(u);
    if (!SCRIPT_URL) saveProjects(u);
    await apiPost({ action: 'deleteProject', id });
  };
  const handleAI = async () => {
    setAiLoading(true); setAiResult('');
    try {
      const r = await analyzeWithGemini(tasks, projects, colors);
      setAiResult(r); setAiTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e: any) { setAiResult(`오류: ${e?.message}`); }
    finally { setAiLoading(false); }
  };
  const saveGoal = () => { localStorage.setItem(`${GOAL_KEY}_${toYMD(new Date())}`, goal); setGoalEditing(false); };
  const logout = () => { sessionStorage.removeItem(SESSION_KEY); window.location.replace('/'); };

  const handleDayClick = (date: Date) => setSel(date);

  if (!ready || !authed) return null;

  const selYMD = toYMD(sel);
  const todayYMD = toYMD(new Date());

  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#f8f8f6;}
        ::-webkit-scrollbar{display:none;}
        input,select{color:#111 !important;background:#fff;}
        input::placeholder{color:#bbb !important;}
        input[type="color"]{-webkit-appearance:none;appearance:none;}
        input[type="color"]::-webkit-color-swatch-wrapper{padding:0;}
        input[type="color"]::-webkit-color-swatch{border:none;border-radius:50%;}
      `}</style>

      <main style={{ background: '#f8f8f6', minHeight: '100vh', fontFamily: font, paddingBottom: 130 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 0' }}>

          {/* Header */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase' }}>filum</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: SCRIPT_URL ? '#22c55e' : '#eab308' }} title={SCRIPT_URL ? 'Sheets 연결됨' : '로컬 저장 중'} />
              </div>
              <h1 style={{ fontSize: 'clamp(30px,7vw,46px)', fontWeight: 800, color: '#111', lineHeight: 1.05, letterSpacing: '-0.025em', fontFamily: font }}>
                {DAY_NAMES[sel.getDay()]}, {sel.getDate()}
              </h1>
              <p style={{ fontSize: 16, fontWeight: 300, color: '#888', marginTop: 3, fontFamily: font }}>
                {MONTH_NAMES[sel.getMonth()]} {sel.getFullYear()}
                {selYMD !== todayYMD && <span style={{ fontSize: 11, color: '#ccc', marginLeft: 8 }}>← 오늘 아님</span>}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
              <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', fontSize: 15, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙</button>
              <button onClick={logout} style={{ ...ghostBtn() }}>나가기</button>
            </div>
          </header>

          {/* Goal */}
          <div style={{ marginBottom: 28 }}>
            {goalEditing
              ? <input autoFocus value={goal} onChange={e => setGoal(e.target.value)} onBlur={saveGoal} onKeyDown={e => e.key === 'Enter' && saveGoal()} placeholder="오늘의 목표..."
                  style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #ddd', outline: 'none', width: '100%', fontFamily: font, fontSize: 16, color: '#333', padding: '3px 0' }} />
              : <p onClick={() => setGoalEditing(true)} style={{ fontSize: 16, color: goal ? '#333' : '#ddd', cursor: 'text', padding: '3px 0', fontFamily: font }}>{goal || '오늘의 목표...'}</p>
            }
          </div>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 24 }} />

          {/* Tasks */}
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={ttl}>{selYMD === todayYMD ? '오늘 할 일' : `${sel.getMonth()+1}월 ${sel.getDate()}일 할 일`}</h2>
              <button onClick={() => setShowAddTask(true)} style={ghostBtn()}>+ 추가</button>
            </div>
            {loading
              ? <p style={{ ...lbl, textAlign: 'center', padding: '20px 0' }}>불러오는 중...</p>
              : tasks.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <p style={{ ...lbl, marginBottom: 10 }}>할 일이 없습니다</p>
                    <button onClick={() => setShowAddTask(true)} style={ghostBtn()}>+ 추가</button>
                  </div>
                : tasks.map(t => (
                    <TaskCard key={t.createdAt} task={t} colors={colors}
                      onToggle={() => handleToggle(t)}
                      onUpdate={(title, cat) => handleUpdate(t, title, cat)}
                      onDelete={() => handleDelete(t)} />
                  ))
            }
          </section>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 24 }} />

          {/* AI */}
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiResult ? 12 : 0 }}>
              <h2 style={ttl}>AI 우선순위 분석</h2>
              <button onClick={handleAI} disabled={aiLoading} style={ghostBtn()}>{aiLoading ? '분석 중...' : '분석하기'}</button>
            </div>
            {aiResult && (
              <div style={{ ...card, padding: '16px 18px', marginTop: 12 }}>
                <p style={{ fontFamily: font, fontSize: 13, color: '#333', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{aiResult}</p>
                {aiTime && <p style={{ ...lbl, marginTop: 10, textAlign: 'right' }}>마지막 분석: {aiTime}</p>}
              </div>
            )}
          </section>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 24 }} />

          {/* Projects */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={ttl}>진행 중</h2>
              <button onClick={() => setShowAddProject(true)} style={ghostBtn()}>+ 추가</button>
            </div>
            {projects.length === 0
              ? <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <p style={{ ...lbl, marginBottom: 10 }}>진행 중인 항목이 없습니다</p>
                  <button onClick={() => setShowAddProject(true)} style={ghostBtn()}>+ 추가</button>
                </div>
              : projects.map(p => {
                  const dday = getDday(p.deadline);
                  const color = colors[p.category]?.color ?? '#888';
                  return (
                    <div key={p.id} style={{ ...card, padding: '14px 16px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <p style={{ fontFamily: font, fontSize: 14, fontWeight: 600, color: '#111' }}>{p.name}</p>
                          <p style={{ ...lbl, marginTop: 2 }}>{colors[p.category]?.label ?? p.category}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: dday >= 0 && dday <= 7 ? '#ef4444' : '#999', fontVariantNumeric: 'tabular-nums' }}>
                            {dday >= 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}
                          </p>
                          <button onClick={() => handleDeleteProject(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: 13 }}>✕</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 3, background: '#f0f0f0', borderRadius: 999 }}>
                          <div style={{ height: '100%', width: `${p.progress}%`, background: color, borderRadius: 999, transition: 'width 0.4s' }} />
                        </div>
                        <span style={{ ...lbl, width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</span>
                      </div>
                    </div>
                  );
                })
            }
          </section>

        </div>
      </main>

      {/* Fixed bottom month bar */}
      <MonthBar
        year={sel.getFullYear()} month={sel.getMonth()}
        selectedYMD={selYMD} colors={colors}
        onDayClick={handleDayClick}
      />

      {showSettings && <SettingsPanel colors={colors} onColorChange={handleColorChange} onReset={handleResetColors} onClose={() => setShowSettings(false)} />}
      {showAddTask && <AddTaskModal colors={colors} defaultDate={selYMD} onAdd={handleAdd} onClose={() => setShowAddTask(false)} />}
      {showAddProject && <AddProjectModal colors={colors} onAdd={handleAddProject} onClose={() => setShowAddProject(false)} />}
    </>
  );
}
