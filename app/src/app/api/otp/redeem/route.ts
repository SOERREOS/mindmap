import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rateLimit';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;

// Rate limit: OTP 사용 시도는 IP당 10회/15분 (브루트포스 방지)
const REDEEM_LIMIT = 10;
const REDEEM_WINDOW_SEC = 15 * 60;

// OTP 코드 포맷: 대문자 + 숫자 8자리 (혼동 문자 제외)
const OTP_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

async function redis(cmd: string[]) {
  const res = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  // ── 1. IP Rate Limit ──────────────────────────────────────────
  const ip = getClientIP(req);
  const rl = await checkRateLimit(redis, 'otp-redeem', ip, REDEEM_LIMIT, REDEEM_WINDOW_SEC);
  if (!rl.allowed) {
    return NextResponse.json(
      { valid: false, error: 'too_many_requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfterSeconds),
          'X-RateLimit-Limit': String(REDEEM_LIMIT),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  try {
    const body = await req.json();
    const { code } = body;

    // ── 2. 입력 검증 (포맷 불일치 시 즉시 거부) ─────────────────
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false }, { status: 400 });
    }
    const normalized = code.toUpperCase().trim();
    if (!OTP_PATTERN.test(normalized)) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const key = `otp:${normalized}`;

    // ── 3. 존재 확인 후 즉시 삭제 (1회용) ───────────────────────
    const getRes = await redis(['GET', key]);
    if (getRes?.result !== '1') {
      return NextResponse.json({ valid: false });
    }

    await redis(['DEL', key]);

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false, error: 'server error' }, { status: 500 });
  }
}
