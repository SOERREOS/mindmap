import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxldrSXgxrvunlbexWOLLyyi24r3hMp0XBk_d-gP6I6_vyGJmfsjTjFziAYPYIErT04mg/exec';

async function callScript(params: URLSearchParams): Promise<any> {
  const url = `${SCRIPT_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal, redirect: 'follow' });
    const text = await res.text();
    if (!text.trim()) throw new Error('Apps Script returned empty response');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Apps Script non-JSON: ${text.slice(0, 200)}`);
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Apps Script timeout (25s) — 재시도 해보세요');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// GET: read operations (getTasks, getProjects, getCategories, ping)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const data = await callScript(searchParams);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: write operations — convert body to URL params and call Apps Script as GET
// (Apps Script POST redirect drops the body; GET params are reliable)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      params.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v as any));
    }
    const data = await callScript(params);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
