'use client';
import { useEffect, useRef, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────
const DASHBOARD_SESSION_KEY = 'dashboard_auth';
const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '';
const SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';
const COLORS_STORAGE_KEY = 'dashboard_category_colors';
const GOAL_STORAGE_KEY = 'dashboard_goal';

type CategoryKey = 'assignment' | 'exam' | 'work' | 'tutoring' | 'study';

const DEFAULT_COLORS: Record<CategoryKey, { label: string; color: string }> = {
  assignment: { label: '대학 과제', color: '#3b82f6' },
  exam:       { label: '시험 준비', color: '#ef4444' },
  work:       { label: '업무',      color: '#f97316' },
  tutoring:   { label: '과외',      color: '#a855f7' },
  study:      { label: '개인 공부', color: '#22c55e' },
};

interface Task {
  date: string;
  title: string;
  category: CategoryKey;
  done: boolean;
  createdAt: string;
  deadline: string;
}

interface Project {
  name: string;
  progress: number;
  category: CategoryKey;
  deadline: string;
  memo: string;
}

// ── Utilities ─────────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function toYMD(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDday(deadline: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline + 'T00:00:00');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function getWeekDays(anchor: Date): Date[] {
  const days: Date[] = [];
  const dow = anchor.getDay(); // 0=Sun
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function getCategoryColors(): Record<CategoryKey, { label: string; color: string }> {
  try {
    const saved = localStorage.getItem(COLORS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : { ...DEFAULT_COLORS };
  } catch { return { ...DEFAULT_COLORS }; }
}

function saveCategoryColor(key: CategoryKey, color: string) {
  const current = getCategoryColors();
  current[key].color = color;
  localStorage.setItem(COLORS_STORAGE_KEY, JSON.stringify(current));
}

function applyCSSVariables(colors: Record<CategoryKey, { label: string; color: string }>) {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, val]) => {
    root.style.setProperty(`--color-${key}`, val.color);
  });
}

// ── Local Storage Task Persistence ────────────────────────────
const TASKS_STORAGE_KEY = 'dashboard_tasks';
const PROJECTS_STORAGE_KEY = 'dashboard_projects';

function loadLocalTasks(date: string): Task[] {
  try {
    const all = JSON.parse(localStorage.getItem(TASKS_STORAGE_KEY) ?? '{}');
    return all[date] ?? [];
  } catch { return []; }
}

function saveLocalTasks(date: string, tasks: Task[]) {
  try {
    const all = JSON.parse(localStorage.getItem(TASKS_STORAGE_KEY) ?? '{}');
    all[date] = tasks;
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

function loadLocalProjects(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) ?? '[]');
  } catch { return []; }
}

// ── API ───────────────────────────────────────────────────────
// 브라우저 → /api/sheets (Next.js 서버) → Apps Script (CORS 우회)
async function fetchTasks(date: string): Promise<Task[]> {
  if (!SCRIPT_URL) return loadLocalTasks(date);
  try {
    const res = await fetch(`/api/sheets?action=getTasks&date=${date}`);
    if (!res.ok) return loadLocalTasks(date);
    return res.json();
  } catch { return loadLocalTasks(date); }
}

async function fetchProjects(): Promise<Project[]> {
  if (!SCRIPT_URL) return loadLocalProjects();
  try {
    const res = await fetch(`/api/sheets?action=getProjects`);
    if (!res.ok) return loadLocalProjects();
    return res.json();
  } catch { return loadLocalProjects(); }
}

async function apiPost(body: object) {
  if (!SCRIPT_URL) return;
  try {
    await fetch('/api/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { /* ignore — optimistic UI already applied */ }
}

async function callGeminiAnalysis(tasks: Task[], projects: Project[], colors: Record<CategoryKey, { label: string; color: string }>): Promise<string> {
  const taskList = tasks
    .filter(t => !t.done)
    .map(t => `- [${colors[t.category]?.label ?? t.category}] ${t.title}${t.deadline ? ` (마감: ${t.deadline})` : ''}`)
    .join('\n') || '(할 일 없음)';

  const projectList = projects
    .map(p => {
      const dday = getDday(p.deadline);
      return `- ${p.name}: 진행률 ${p.progress}%, ${dday >= 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}`;
    })
    .join('\n') || '(진행 중 없음)';

  const prompt = `다음은 오늘 해야 할 일 목록이야. 각 항목의 카테고리와 상황을 고려해서 우선순위에 대한 간결한 견해를 한국어로 제공해줘. 분석은 3-4문장 이내로 핵심만. 번호 매겨서 순위 제안도 포함. JSON 없이 일반 텍스트로 답해줘.

[오늘 할 일]
${taskList}

[진행 중인 것들]
${projectList}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Styles ────────────────────────────────────────────────────
const s = {
  card: {
    background: '#ffffff',
    borderRadius: 16,
    border: '1px solid #ebebeb',
  } as React.CSSProperties,
  label: {
    fontFamily: "'Pretendard', sans-serif",
    fontSize: 12,
    color: '#888888',
    letterSpacing: '0.04em',
  } as React.CSSProperties,
  sectionTitle: {
    fontFamily: "'Pretendard', sans-serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#111111',
  } as React.CSSProperties,
  btn: (active = false): React.CSSProperties => ({
    background: active ? '#111' : 'none',
    border: `1px solid ${active ? '#111' : '#e5e5e5'}`,
    borderRadius: 999,
    padding: '8px 16px',
    cursor: 'pointer',
    fontFamily: "'Pretendard', sans-serif",
    fontSize: 13,
    color: active ? '#fff' : '#555',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
  }),
};

// ── TaskCard ──────────────────────────────────────────────────
function TaskCard({ task, colors, onToggle, onUpdate, onDelete }: {
  task: Task;
  colors: Record<CategoryKey, { label: string; color: string }>;
  onToggle: () => void;
  onUpdate: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = val.trim();
    if (trimmed && trimmed !== task.title) onUpdate(trimmed);
    else setVal(task.title);
  };

  const color = colors[task.category]?.color ?? '#888';

  return (
    <div style={{
      ...s.card,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', marginBottom: 8,
      opacity: task.done ? 0.45 : 1,
      transition: 'opacity 0.2s',
    }}>
      <div style={{ width: 4, height: 36, borderRadius: 4, background: color, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setVal(task.title); } }}
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              fontFamily: "'Pretendard', sans-serif", fontSize: 15, fontWeight: 500,
              color: '#111', width: '100%',
            }}
          />
        ) : (
          <p
            onClick={() => !task.done && setEditing(true)}
            style={{
              fontFamily: "'Pretendard', sans-serif", fontSize: 15, fontWeight: 500,
              color: '#111', cursor: task.done ? 'default' : 'text',
              textDecoration: task.done ? 'line-through' : 'none',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >{task.title}</p>
        )}
        <p style={{ ...s.label, marginTop: 2 }}>
          {colors[task.category]?.label ?? task.category}
          {task.deadline ? ` · ${task.deadline}` : ''}
        </p>
      </div>

      <button
        onClick={onDelete}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ddd', fontSize: 14, padding: '4px 6px', flexShrink: 0, lineHeight: 1 }}
        title="삭제"
      >✕</button>

      <button
        onClick={onToggle}
        style={{
          width: 24, height: 24, borderRadius: '50%',
          border: `2px solid ${task.done ? color : '#ddd'}`,
          background: task.done ? color : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'all 0.15s', padding: 0,
        }}
        title={task.done ? '완료 취소' : '완료'}
      >
        {task.done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
      </button>
    </div>
  );
}

// ── AddTaskModal ──────────────────────────────────────────────
function AddTaskModal({ colors, defaultDate, onAdd, onClose }: {
  colors: Record<CategoryKey, { label: string; color: string }>;
  defaultDate: string;
  onAdd: (task: Omit<Task, 'done'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryKey>('assignment');
  const [deadline, setDeadline] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ date: defaultDate, title: title.trim(), category, createdAt: new Date().toISOString(), deadline });
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.12)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#fff', borderRadius: 20, padding: '28px 24px', width: 340, boxShadow: '0 8px 48px rgba(0,0,0,0.12)' }}>
        <p style={{ ...s.sectionTitle, marginBottom: 20 }}>할 일 추가</p>

        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="할 일 입력..."
          style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 12, padding: '12px 14px', fontFamily: "'Pretendard', sans-serif", fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
        />

        <select
          value={category}
          onChange={e => setCategory(e.target.value as CategoryKey)}
          style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 12, padding: '11px 14px', fontFamily: "'Pretendard', sans-serif", fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10, background: '#fafafa', cursor: 'pointer' }}
        >
          {(Object.entries(colors) as [CategoryKey, { label: string; color: string }][]).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <div style={{ marginBottom: 4 }}>
          <p style={{ ...s.label, marginBottom: 6 }}>마감일 (선택)</p>
          <input
            type="date"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 12, padding: '11px 14px', fontFamily: "'Pretendard', sans-serif", fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafafa', marginBottom: 20 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', border: '1px solid #ebebeb', borderRadius: 12, fontFamily: "'Pretendard', sans-serif", fontSize: 14, cursor: 'pointer', background: '#fafafa', color: '#888' }}>취소</button>
          <button onClick={submit} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: 12, fontFamily: "'Pretendard', sans-serif", fontSize: 14, cursor: 'pointer', background: '#111', color: '#fff', fontWeight: 600 }}>추가</button>
        </div>
      </div>
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────
function SettingsPanel({ colors, onColorChange, onReset, onClose }: {
  colors: Record<CategoryKey, { label: string; color: string }>;
  onColorChange: (key: CategoryKey, color: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 280,
        background: '#fff', borderLeft: '1px solid #ebebeb',
        padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 0,
        boxShadow: '-12px 0 40px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <p style={s.sectionTitle}>설정</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <p style={{ ...s.label, marginBottom: 16 }}>카테고리 색상</p>
        {(Object.entries(colors) as [CategoryKey, { label: string; color: string }][]).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: val.color }} />
              <span style={{ fontFamily: "'Pretendard', sans-serif", fontSize: 14, color: '#333' }}>{val.label}</span>
            </div>
            <input
              type="color"
              value={val.color}
              onChange={e => onColorChange(key, e.target.value)}
              style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e5e5e5', cursor: 'pointer', padding: 2 }}
            />
          </div>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={onReset}
          style={{ padding: '12px', border: '1px solid #ebebeb', borderRadius: 12, fontFamily: "'Pretendard', sans-serif", fontSize: 13, cursor: 'pointer', background: '#fafafa', color: '#888' }}
        >
          기본값으로 초기화
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function DashboardPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekDays, setWeekDays] = useState<Date[]>([]);

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
  const [tasksLoading, setTasksLoading] = useState(false);

  // Auth guard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(DASHBOARD_SESSION_KEY) === '1') {
      setAuthed(true);
    } else {
      window.location.replace('/');
    }
    setReady(true);
  }, []);

  // Init colors + goal + week
  useEffect(() => {
    if (!authed) return;
    const c = getCategoryColors();
    setColors(c);
    applyCSSVariables(c);

    const today = new Date();
    setWeekDays(getWeekDays(today));
    setSelectedDate(today);

    const goalKey = `${GOAL_STORAGE_KEY}_${toYMD(today)}`;
    setGoal(localStorage.getItem(goalKey) ?? '');
  }, [authed]);

  // Load tasks on date change
  useEffect(() => {
    if (!authed) return;
    setTasksLoading(true);
    setAiResult('');
    setAiTime('');
    fetchTasks(toYMD(selectedDate))
      .then(setTasks)
      .finally(() => setTasksLoading(false));
  }, [authed, selectedDate]);

  // Load projects once
  useEffect(() => {
    if (!authed) return;
    fetchProjects().then(setProjects);
  }, [authed]);

  const handleColorChange = (key: CategoryKey, color: string) => {
    saveCategoryColor(key, color);
    const updated = getCategoryColors();
    setColors(updated);
    applyCSSVariables(updated);
  };

  const handleResetColors = () => {
    localStorage.removeItem(COLORS_STORAGE_KEY);
    const c = { ...DEFAULT_COLORS };
    setColors(c);
    applyCSSVariables(c);
  };

  const handleToggle = async (task: Task) => {
    setTasks(prev => {
      const updated = prev.map(t => t.createdAt === task.createdAt ? { ...t, done: !t.done } : t);
      saveLocalTasks(toYMD(selectedDate), updated);
      return updated;
    });
    await apiPost({ action: 'updateTask', createdAt: task.createdAt, done: !task.done });
  };

  const handleUpdate = async (task: Task, title: string) => {
    setTasks(prev => {
      const updated = prev.map(t => t.createdAt === task.createdAt ? { ...t, title } : t);
      saveLocalTasks(toYMD(selectedDate), updated);
      return updated;
    });
    await apiPost({ action: 'updateTask', createdAt: task.createdAt, title });
  };

  const handleDelete = async (task: Task) => {
    setTasks(prev => {
      const updated = prev.filter(t => t.createdAt !== task.createdAt);
      saveLocalTasks(toYMD(selectedDate), updated);
      return updated;
    });
    await apiPost({ action: 'deleteTask', createdAt: task.createdAt });
  };

  const handleAdd = async (newTask: Omit<Task, 'done'>) => {
    const task: Task = { ...newTask, done: false };
    setTasks(prev => {
      const updated = [...prev, task];
      saveLocalTasks(newTask.date, updated);
      return updated;
    });
    await apiPost({ action: 'addTask', ...task });
  };

  const handleAI = async () => {
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await callGeminiAnalysis(tasks, projects, colors);
      setAiResult(result);
      setAiTime(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e: any) {
      setAiResult(`분석 중 오류가 발생했습니다: ${e?.message ?? '알 수 없는 오류'}`);
    } finally {
      setAiLoading(false);
    }
  };

  const saveGoal = () => {
    const key = `${GOAL_STORAGE_KEY}_${toYMD(new Date())}`;
    localStorage.setItem(key, goal);
    setGoalEditing(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(DASHBOARD_SESSION_KEY);
    window.location.replace('/');
  };

  if (!ready || !authed) return null;

  const todayYMD = toYMD(new Date());
  const selYMD = toYMD(selectedDate);
  const { dayName, day, monthName, year } = {
    dayName: DAY_NAMES[selectedDate.getDay()],
    day: selectedDate.getDate(),
    monthName: MONTH_NAMES[selectedDate.getMonth()],
    year: selectedDate.getFullYear(),
  };

  return (
    <>
      {/* Pretendard */}
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f8f6; }
        ::-webkit-scrollbar { display: none; }
        input[type="color"] { -webkit-appearance: none; appearance: none; }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: none; border-radius: 50%; }
      `}</style>

      <main style={{ background: '#f8f8f6', minHeight: '100vh', fontFamily: "'Pretendard', sans-serif" }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 80px' }}>

          {/* ── Header ──────────────────────────────────── */}
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.12em', textTransform: 'uppercase' }}>filum</p>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 999, fontFamily: "'Pretendard', sans-serif",
                  background: SCRIPT_URL ? '#dcfce7' : '#fef9c3',
                  color: SCRIPT_URL ? '#16a34a' : '#ca8a04',
                }}>
                  {SCRIPT_URL ? 'Sheets 연결됨' : '로컬 저장 중'}
                </span>
              </div>
              <h1 style={{
                fontSize: 'clamp(36px, 8vw, 52px)', fontWeight: 800, color: '#111',
                lineHeight: 1.05, letterSpacing: '-0.025em', fontFamily: "'Pretendard', sans-serif",
              }}>
                {dayName}, {day}
              </h1>
              <p style={{ fontSize: 18, fontWeight: 300, color: '#888', marginTop: 4, fontFamily: "'Pretendard', sans-serif" }}>
                {monthName} {year}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, paddingTop: 6 }}>
              <button
                onClick={() => setShowSettings(true)}
                title="설정"
                style={{
                  background: 'none', border: '1px solid #e5e5e5', borderRadius: '50%',
                  width: 38, height: 38, cursor: 'pointer', fontSize: 16, color: '#666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >⚙</button>
              <button
                onClick={handleLogout}
                title="로그아웃"
                style={{
                  background: 'none', border: '1px solid #e5e5e5', borderRadius: 999,
                  padding: '8px 14px', cursor: 'pointer', fontSize: 12,
                  color: '#888', letterSpacing: '0.04em', fontFamily: "'Pretendard', sans-serif",
                }}
              >나가기</button>
            </div>
          </header>

          {/* ── Today's Goal ─────────────────────────────── */}
          <div style={{ marginBottom: 36 }}>
            {goalEditing ? (
              <input
                autoFocus
                value={goal}
                onChange={e => setGoal(e.target.value)}
                onBlur={saveGoal}
                onKeyDown={e => e.key === 'Enter' && saveGoal()}
                placeholder="오늘의 목표..."
                style={{
                  background: 'transparent', border: 'none', borderBottom: '1px solid #ddd',
                  outline: 'none', width: '100%', fontFamily: "'Pretendard', sans-serif",
                  fontSize: 17, color: '#333', padding: '4px 0', fontWeight: 400,
                }}
              />
            ) : (
              <p
                onClick={() => setGoalEditing(true)}
                style={{
                  fontSize: 17, color: goal ? '#333' : '#cccccc',
                  cursor: 'text', padding: '4px 0',
                  borderBottom: '1px solid transparent',
                  fontFamily: "'Pretendard', sans-serif", fontWeight: 400,
                }}
              >
                {goal || '오늘의 목표...'}
              </p>
            )}
          </div>

          {/* ── Date Pill Selector ────────────────────────── */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {weekDays.map((d, i) => {
                const ymd = toYMD(d);
                const isSelected = ymd === selYMD;
                const isToday = ymd === todayYMD;
                return (
                  <button
                    key={ymd}
                    onClick={() => setSelectedDate(d)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 10px 12px', border: 'none', borderRadius: 999,
                      background: isSelected ? '#111' : 'transparent',
                      cursor: 'pointer', flexShrink: 0, minWidth: 48, position: 'relative',
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      color: isSelected ? 'rgba(255,255,255,0.7)' : '#bbb',
                      fontFamily: "'Pretendard', sans-serif",
                    }}>
                      {DAY_LABELS[i]}
                    </span>
                    <span style={{
                      fontSize: 16, fontWeight: isSelected ? 700 : 400,
                      color: isSelected ? '#fff' : (isToday ? '#111' : '#666'),
                      fontVariantNumeric: 'tabular-nums',
                      fontFamily: "'Pretendard', sans-serif",
                    }}>
                      {d.getDate()}
                    </span>
                    {isToday && !isSelected && (
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#111', position: 'absolute', bottom: 8 }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 32 }} />

          {/* ── Tasks ────────────────────────────────────── */}
          <section style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={s.sectionTitle}>
                {selYMD === todayYMD ? '오늘 할 일' : `${selYMD} 할 일`}
              </h2>
              <button onClick={() => setShowAddTask(true)} style={s.btn()}>+ 추가</button>
            </div>

            {tasksLoading ? (
              <p style={{ ...s.label, textAlign: 'center', padding: '28px 0' }}>불러오는 중...</p>
            ) : tasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ ...s.label, marginBottom: 12 }}>할 일이 없습니다</p>
                <button onClick={() => setShowAddTask(true)} style={s.btn()}>+ 할 일 추가</button>
              </div>
            ) : (
              tasks.map(task => (
                <TaskCard
                  key={task.createdAt}
                  task={task}
                  colors={colors}
                  onToggle={() => handleToggle(task)}
                  onUpdate={title => handleUpdate(task, title)}
                  onDelete={() => handleDelete(task)}
                />
              ))
            )}
          </section>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 32 }} />

          {/* ── AI Analysis ──────────────────────────────── */}
          <section style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiResult ? 16 : 0 }}>
              <h2 style={s.sectionTitle}>AI 우선순위 분석</h2>
              <button onClick={handleAI} disabled={aiLoading} style={s.btn(!aiLoading && false)}>
                {aiLoading ? '분석 중...' : '분석하기'}
              </button>
            </div>

            {aiResult && (
              <div style={{ ...s.card, padding: '20px 22px', marginTop: 16 }}>
                <p style={{ fontFamily: "'Pretendard', sans-serif", fontSize: 14, color: '#333', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {aiResult}
                </p>
                {aiTime && (
                  <p style={{ ...s.label, marginTop: 12, textAlign: 'right' }}>마지막 분석: {aiTime}</p>
                )}
              </div>
            )}
          </section>

          <div style={{ height: 1, background: '#ebebeb', marginBottom: 32 }} />

          {/* ── Projects ─────────────────────────────────── */}
          <section>
            <h2 style={{ ...s.sectionTitle, marginBottom: 16 }}>진행 중</h2>

            {projects.length === 0 ? (
              <p style={{ ...s.label, textAlign: 'center', padding: '28px 0' }}>진행 중인 항목이 없습니다</p>
            ) : (
              projects.map((p, i) => {
                const dday = getDday(p.deadline);
                const color = colors[p.category]?.color ?? '#888';
                const urgent = dday >= 0 && dday <= 7;
                return (
                  <div key={i} style={{ ...s.card, padding: '16px 18px', marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <p style={{ fontFamily: "'Pretendard', sans-serif", fontSize: 15, fontWeight: 600, color: '#111' }}>{p.name}</p>
                        <p style={{ ...s.label, marginTop: 3 }}>{colors[p.category]?.label ?? p.category}</p>
                      </div>
                      <p style={{
                        fontFamily: "'Pretendard', sans-serif", fontSize: 13, fontWeight: 700,
                        color: urgent ? '#ef4444' : '#888', fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0, marginLeft: 12,
                      }}>
                        {dday >= 0 ? `D-${dday}` : `D+${Math.abs(dday)}`}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 4, background: '#f0f0f0', borderRadius: 999 }}>
                        <div style={{ height: '100%', width: `${p.progress}%`, background: color, borderRadius: 999, transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ ...s.label, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {p.progress}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </section>

        </div>
      </main>

      {/* ── Modals ────────────────────────────────────────── */}
      {showSettings && (
        <SettingsPanel
          colors={colors}
          onColorChange={handleColorChange}
          onReset={handleResetColors}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showAddTask && (
        <AddTaskModal
          colors={colors}
          defaultDate={selYMD}
          onAdd={handleAdd}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </>
  );
}
