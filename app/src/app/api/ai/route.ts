import { NextRequest, NextResponse } from 'next/server';

const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '';

export async function POST(req: NextRequest) {
  if (!GEMINI_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 503 });
  }
  try {
    const { prompt } = await req.json();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        cache: 'no-store',
      }
    );
    const data = await res.json();
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return NextResponse.json({ text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
