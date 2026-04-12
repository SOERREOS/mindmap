const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

// ── 선호 모델 순위 (최신·빠른 순) ─────────────────────────────
// 실제 사용 가능 여부는 아래 getModels()가 API에서 자동 확인함
const PREFERRED = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-8b',
];

// ── 사용 가능한 모델 자동 조회 + 캐시 ────────────────────────
let _cachedModels: string[] | null = null;

async function getModels(): Promise<string[]> {
  if (_cachedModels) return _cachedModels;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}&pageSize=50`
    );
    const data = await res.json();
    const available = new Set<string>(
      (data.models ?? [])
        .filter((m: any) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent')
        )
        .map((m: any) => (m.name as string).replace('models/', ''))
    );
    const filtered = PREFERRED.filter(m => available.has(m));
    _cachedModels = filtered.length > 0 ? filtered : ['gemini-2.5-flash'];
  } catch {
    // 네트워크 오류 등 → 기본 모델로
    _cachedModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  }

  return _cachedModels;
}

// 특정 모델이 "사용 불가" 에러를 낼 때 캐시에서 제거
function evictModel(model: string) {
  if (_cachedModels) {
    _cachedModels = _cachedModels.filter(m => m !== model);
  }
}

export interface ResearchSubNode {
  label: string;
  summary: string;
}

export interface ResearchMainNode {
  label: string;
  category: string;
  summary: string;
  children: ResearchSubNode[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// 중괄호 깊이를 추적해 첫 번째 완전한 JSON 객체를 정확하게 추출
function parseFirstJSON(raw: string): any {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('응답에서 JSON을 찾을 수 없습니다.');

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape)            { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"')        { inString = !inString; continue; }
    if (inString)          continue;
    if (ch === '{')        depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  throw new Error('JSON 형식이 올바르지 않습니다.');
}

// ── Gemini API 호출 ───────────────────────────────────────────
const callGemini = async (prompt: string): Promise<any> => {
  const models = await getModels();
  let lastError = '';

  for (const model of models) {
    // 모델당 최대 3회 시도
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      const result = await response.json();

      if (!result.error) {
        const raw: string = result.candidates[0].content.parts[0].text;
        return parseFirstJSON(raw);
      }

      const { code, message } = result.error as { code: number; message: string };
      lastError = message;

      // 모델 사용 불가 (폐기·신규 사용자 차단) → 캐시에서 제거 후 다음 모델
      if (
        code === 404 ||
        (code === 400 && (
          message?.includes('not available') ||
          message?.includes('deprecated') ||
          message?.includes('new users') ||
          message?.includes('no longer')
        ))
      ) {
        evictModel(model);
        break;
      }

      // 할당량 초과 → 다음 모델
      if (code === 429) break;

      // 서버 과부하 → 점진적 대기 후 재시도
      if (code === 503 || message?.includes('high demand') || message?.includes('overloaded')) {
        if (attempt < 2) { await sleep(1200 + attempt * 800); continue; }
        break;
      }

      // 그 외 에러 → 즉시 throw
      throw new Error(message);
    }
  }

  throw new Error(`서버가 혼잡합니다. 잠시 후 다시 시도해주세요.\n(${lastError})`);
};

// ── Public API ────────────────────────────────────────────────
export const conductResearch = async (keyword: string): Promise<ResearchMainNode[]> => {
  const seeds = keyword.split(',').map(s => s.trim()).filter(Boolean);
  const subject = seeds.length > 1
    ? `"${seeds.join('"과 "')}"의 교차 연관 관계`
    : `"${keyword}"`;

  const prompt = `${subject}에 대해 5개의 핵심 연관 개념을 추출하고, 각 개념마다 정확히 5개의 하위 키워드를 추출해.
반드시 아래 JSON 형식으로만 답변. 설명 텍스트 금지:
{"nodes":[{"label":"주요개념","category":"기술","summary":"한 문장 설명","children":[{"label":"하위1","summary":"설명"},{"label":"하위2","summary":"설명"},{"label":"하위3","summary":"설명"},{"label":"하위4","summary":"설명"},{"label":"하위5","summary":"설명"}]}]}
category는 기술/문화/비즈니스/과학/예술/사회 중 하나만 선택.`;

  const parsed = await callGemini(prompt);
  return parsed.nodes;
};

export const expandNode = async (nodeLabel: string): Promise<ResearchSubNode[]> => {
  const prompt = `"${nodeLabel}"에 대해 더 구체적인 하위 개념 5개를 추출해.
반드시 아래 JSON 형식으로만 답변. 설명 텍스트 금지:
{"nodes":[{"label":"개념1","summary":"한 문장 설명"},{"label":"개념2","summary":"설명"},{"label":"개념3","summary":"설명"},{"label":"개념4","summary":"설명"},{"label":"개념5","summary":"설명"}]}`;

  const parsed = await callGemini(prompt);
  return parsed.nodes;
};
