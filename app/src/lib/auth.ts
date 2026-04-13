const PWD_KEY = 'rm_pwd';
const PWD_VER_KEY = 'rm_pwd_ver';
const PWD_VERSION = 'v3'; // 버전 올리면 기본 비밀번호로 강제 초기화
const SESSION_KEY = 'rm_session';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 최초 실행 시 기본 비밀번호 초기화 (버전이 다르면 강제 리셋)
export async function initAuth(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(PWD_VER_KEY) !== PWD_VERSION) {
    localStorage.setItem(PWD_KEY, await sha256('0201'));
    localStorage.setItem(PWD_VER_KEY, PWD_VERSION);
  }
}

export async function verify(input: string): Promise<boolean> {
  const stored = localStorage.getItem(PWD_KEY);
  if (!stored) return false;
  return (await sha256(input)) === stored;
}

export async function changePassword(newPwd: string): Promise<void> {
  localStorage.setItem(PWD_KEY, await sha256(newPwd));
}

export function isAuth(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function setAuth(): void {
  sessionStorage.setItem(SESSION_KEY, '1');
}

// ── OTP (게스트 1회용 코드) ───────────────────────────────────

export async function generateOTP(): Promise<{ code: string; expiresIn: string } | null> {
  try {
    const stored = localStorage.getItem(PWD_KEY);
    if (!stored) return null;
    const res = await fetch('/api/otp/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminHash: stored }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function redeemOTP(code: string): Promise<boolean> {
  try {
    const res = await fetch('/api/otp/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    return data.valid === true;
  } catch {
    return false;
  }
}
