const PWD_KEY = 'rm_pwd';
const SESSION_KEY = 'rm_session';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 최초 실행 시 기본 비밀번호 초기화
export async function initAuth(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!localStorage.getItem(PWD_KEY)) {
    localStorage.setItem(PWD_KEY, await sha256('reos2024'));
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
