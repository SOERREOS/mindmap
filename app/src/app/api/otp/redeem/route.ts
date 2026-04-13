import { NextRequest, NextResponse } from 'next/server';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;

async function redis(cmd: string[]) {
  const res = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const key = `otp:${code.toUpperCase().trim()}`;

    // 존재 확인 후 즉시 삭제 (1회용)
    const getRes = await redis(['GET', key]);
    if (getRes?.result !== '1') {
      return NextResponse.json({ valid: false });
    }

    // 코드 즉시 삭제
    await redis(['DEL', key]);

    return NextResponse.json({ valid: true });
  } catch (e) {
    return NextResponse.json({ valid: false, error: 'server error' }, { status: 500 });
  }
}
