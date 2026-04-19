import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const SUPA_URL = process.env.SUPABASE_URL!;
const KEY      = process.env.SUPABASE_ANON_KEY!;

function hdrs(extras: Record<string, string> = {}) {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extras,
  };
}

async function sb(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: hdrs(init.headers as Record<string, string>),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// ── GET ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const p = new URL(req.url).searchParams;
    const action = p.get('action');

    if (action === 'ping') {
      // Just verify connection
      await sb('tasks?limit=1&select=date');
      return NextResponse.json({ ok: true, sheets: ['tasks', 'projects', 'categories'] });
    }

    if (action === 'getAllTasks') {
      const rows = await sb('tasks?order=date.asc,createdAt.asc');
      return NextResponse.json(rows ?? []);
    }

    if (action === 'getDeletedIds') {
      const rows = await sb('deleted_tasks?select=createdAt');
      return NextResponse.json((rows ?? []).map((r: any) => r.createdAt));
    }

    if (action === 'getTasks') {
      const date = p.get('date');
      if (!date) throw new Error('date required');
      const rows = await sb(`tasks?date=eq.${date}&order=createdAt.asc`);
      return NextResponse.json(rows ?? []);
    }

    if (action === 'getProjects') {
      const rows = await sb('projects?order=deadline.asc');
      return NextResponse.json(rows ?? []);
    }

    if (action === 'getCategories') {
      const rows = await sb('categories');
      return NextResponse.json(rows ?? []);
    }

    if (action === 'getGoal') {
      const date = p.get('date');
      if (!date) throw new Error('date required');
      const rows = await sb(`goals?date=eq.${encodeURIComponent(date)}&select=text`);
      return NextResponse.json({ text: rows?.[0]?.text ?? '' });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...rest } = body;

    if (action === 'addTask') {
      const { done, ...task } = rest;
      await sb('tasks', {
        method: 'POST',
        body: JSON.stringify({ ...task, done: false }),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'updateTask') {
      const { createdAt, ...fields } = rest;
      // convert done string→boolean if present
      if ('done' in fields) fields.done = fields.done === true || fields.done === 'true';
      await sb(`tasks?createdAt=eq.${encodeURIComponent(createdAt)}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'deleteTask') {
      await sb(`tasks?createdAt=eq.${encodeURIComponent(rest.createdAt)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      await sb('deleted_tasks', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ createdAt: rest.createdAt, deletedAt: new Date().toISOString() }),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'addProject') {
      const { progress, ...proj } = rest;
      await sb('projects', {
        method: 'POST',
        body: JSON.stringify({ ...proj, progress: Number(progress) || 0 }),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'deleteProject') {
      await sb(`projects?id=eq.${encodeURIComponent(rest.id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'updateProject') {
      const { id, ...fields } = rest;
      await sb(`projects?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'saveGoal') {
      await sb('goals', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ date: rest.date, text: rest.text }),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'saveCategories') {
      const cats = typeof rest.categories === 'string'
        ? JSON.parse(rest.categories)
        : rest.categories;
      // delete all then insert fresh
      await sb('categories?key=not.is.null', {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      await sb('categories', {
        method: 'POST',
        body: JSON.stringify(cats),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
