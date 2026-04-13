import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit, getClientIP } from '@/lib/rateLimit';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;
const OTP_TTL = 60 * 60 * 24; // 24시간

// Rate limit: OTP 발급은 IP당 5회/시간
const GENERATE_LIMIT = 5;
const GENERATE_WINDOW_SEC = 60 * 60;

async function redis(cmd: string[]) {
  const res = await fetch(`${REDIS_URL}/${cmd.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return res.json();
}

async function sha256(text: string): Promise<string> {
  const buf = crypto.createHash('sha256').update(text).digest();
  return Buffer.from(buf).toString('hex');
}

export async function POST(req: NextRequest) {
  // ── 1. IP Rate Limit ──────────────────────────────────────────
  const ip = getClientIP(req);
  const rl = await checkRateLimit(redis, 'otp-gen', ip, GENERATE_LIMIT, GENERATE_WINDOW_SEC);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'too_many_requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfterSeconds),
          'X-RateLimit-Limit': String(GENERATE_LIMIT),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  try {
    const body = await req.json();
    const { adminHash } = body;

    // ── 2. 입력 검증 ─────────────────────────────────────────────
    if (!adminHash || typeof adminHash !== 'string' || !/^[0-9a-f]{64}$/i.test(adminHash)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // ── 3. 관리자 비밀번호 해시 검증 ────────────────────────────
    // Redis에 저장된 해시가 없으면 기본값(0201) 사용
    const stored = await redis(['GET', 'rm_admin_hash']);
    const defaultHash = await sha256('0201');
    const validHash = stored?.result ?? defaultHash;

    if (adminHash !== validHash) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // ── 4. 8자리 랜덤 OTP 생성 (대문자 + 숫자, 혼동 문자 제외) ──
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
    }

    // ── 5. Redis에 저장 (TTL: 24시간) ───────────────────────────
    await redis(['SET', `otp:${code}`, '1', 'EX', String(OTP_TTL)]);

    return NextResponse.json(
      { code, expiresIn: '24시간' },
      {
        headers: {
          'X-RateLimit-Limit': String(GENERATE_LIMIT),
          'X-RateLimit-Remaining': String(rl.remaining),
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
