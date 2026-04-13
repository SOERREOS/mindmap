import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;
const OTP_TTL = 60 * 60 * 24; // 24시간

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
  try {
    const { adminHash } = await req.json();

    // 관리자 비밀번호 해시 검증 (클라이언트에서 sha256 해시로 전송)
    if (!adminHash || typeof adminHash !== 'string') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Upstash에 저장된 관리자 해시와 비교
    const stored = await redis(['GET', 'rm_admin_hash']);
    // 저장된 값이 없으면 기본값(0001)으로 검증
    const defaultHash = await sha256('0001');
    const validHash = stored?.result ?? defaultHash;

    if (adminHash !== validHash) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 8자리 랜덤 코드 생성 (대문자 + 숫자, 혼동 문자 제외)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
    }

    // Redis에 저장 (TTL: 24시간)
    await redis(['SET', `otp:${code}`, '1', 'EX', String(OTP_TTL)]);

    return NextResponse.json({ code, expiresIn: '24시간' });
  } catch (e) {
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
