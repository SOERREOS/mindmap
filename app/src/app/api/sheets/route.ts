import { NextRequest, NextResponse } from 'next/server';

const SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL ?? '';

export async function GET(req: NextRequest) {
  if (!SCRIPT_URL) {
    return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const params = searchParams.toString();

  try {
    const res = await fetch(`${SCRIPT_URL}?${params}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!SCRIPT_URL) {
    return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
