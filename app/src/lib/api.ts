const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

// ── 선호 모델 순위 (최신·빠른 순) ─────────────────────────────
// 실제 사용 가능 여부는 아래 getModels()가 API에서 자동 확인함
const PREFERRED = [
  'gemini-1.5-flash',     // 가장 안정성이 검증된 표준 모델
  'gemini-1.5-pro',       // 품질 위주의 프로 모델
];

// ── 사용 가능한 모델 자동 조회 + 캐시 ────────────────────────
let _cachedModels: string[] | null = null;

async function getModels(): Promise<string[]> {
  if (_cachedModels) return _cachedModels;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}&pageSize=50`
    );
    const data = await res.json();
    const availableModels = (data.models ?? [])
      .filter((m: any) =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent')
      )
      .map((m: any) => (m.name as string).replace('models/', ''));

    const available = new Set<string>(availableModels);
    
    // 1. 선호하는 모델 중 실제 사용 가능한 것 필터링
    const filtered = PREFERRED.filter(m => available.has(m));
    
    if (filtered.length > 0) {
      _cachedModels = filtered;
    } else if (availableModels.length > 0) {
      // 2. 선호 모델이 하나도 없다면, 리스트에서 아무 'flash'나 'pro'가 포함된 모델 선택
      _cachedModels = availableModels
        .filter(m => m.includes('flash') || m.includes('pro'))
        .slice(0, 3);
      if (_cachedModels.length === 0) _cachedModels = [availableModels[0]];
    } else {
      _cachedModels = ['gemini-1.5-flash']; // 최후의 보루
    }
  } catch {
    _cachedModels = ['gemini-1.5-flash'];
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
  // --- 창작자 지원 필드 추가 ---
  inspiration?: string;   // 창작 영감 트리거
  actionItems?: string[];  // 구체적인 실행 아이디어
  questions?: string[];    // 새롭게 던져볼 수 있는 질문들
  details?: string;       // 심층 설명
}

export interface ResearchMainNode {
  label: string;
  category: string;
  summary: string;
  children: ResearchSubNode[];
  // 메인 노드에도 동일한 메타데이터 추가 가능
  inspiration?: string;
  actionItems?: string[];
  questions?: string[];
  details?: string;
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

// ── Gemini API 호출 (딥모드 지원 및 폴백 로직) ──────────────────────
const callGemini = async (prompt: string, deep = false): Promise<any> => {
  let models = await getModels();
  
  // 딥모드일 경우 Pro 모델을 최우선순위로 배치
  if (deep) {
    const proModels = models.filter(m => m.includes('pro'));
    const flashModels = models.filter(m => !m.includes('pro'));
    models = [...proModels, ...flashModels];
  }

  let lastError = '';

  for (const model of models) {
    for (let attempt = 0; attempt < 1; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { 
                responseMimeType: 'application/json',
                temperature: deep ? 0.75 : 0.9, // 딥모드는 약간 더 창의적이게
              },
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

        const isAvailabilityError = message.toLowerCase().includes('available') || message.toLowerCase().includes('deprecated');

        if (code === 404 || code === 400 || code === 403 || isAvailabilityError) {
          evictModel(model); 
          break; 
        }
        if (code === 429) break; // 할당량 초과 시 다음 모델로
        if (code === 503) { await sleep(1000); continue; }
        
        break;
      } catch (e: any) {
        lastError = e.message;
        break;
      }
    }
  }

  throw new Error(`AI 탐색 중 오류가 발생했습니다. (${lastError})`);
};

// ── Public API ────────────────────────────────────────────────

/**
 * 초기 리서치 수행
 */
export const conductResearch = async (keyword: string, userRole = "사용자"): Promise<ResearchMainNode[]> => {
  const seeds = keyword.split(',').map(s => s.trim()).filter(Boolean);
  const subject = seeds.length > 1
    ? `"${seeds.join('"과 "')}"의 교차 연관 관계`
    : `"${keyword}"`;

  const prompt = `당신은 유능한 브레인스토밍 파트너입니다. 
지금 당신은 [${userRole}]과 함께 "${subject}"에 대해 탐색하고 있습니다.
[${userRole}]의 관점에서 가장 흥미롭고 창의적인 연관 개념 5개를 추출하고, 각 개념마다 5개의 하위 키워드를 생성하세요.

반드시 아래 JSON 형식으로만 답변하세요:
{
  "nodes": [
    {
      "label": "주요개념",
      "category": "기술/문화/비즈니스/과학/예술/사회 중 택1",
      "summary": "한 문장 요약",
      "children": [
        {
          "label": "하위1",
          "summary": "설명",
          "inspiration": "창작자를 위한 한 줄 영감",
          "actionItems": ["실행 아이디어1", "실행 아이디어2"],
          "questions": ["생각해볼 질문1"]
        }
      ]
    }
  ]
}`;

  const parsed = await callGemini(prompt, true); // 초기 리서치는 Pro 가중치
  return parsed.nodes;
};

/**
 * 단순 노드 확장
 */
export const expandNode = async (nodeLabel: string, userRole = "사용자"): Promise<ResearchSubNode[]> => {
  const prompt = `[${userRole}]의 관점에서 "${nodeLabel}"에 대해 더 구체적이고 창의적인 하위 개념 5개를 추출하세요.
창작자에게 영감을 줄 수 있는 필드들을 포함해 주세요.

반드시 아래 JSON 형식으로만 답변하세요:
{
  "nodes": [
    {
      "label": "개념1",
      "summary": "설명",
      "inspiration": "창작 영감",
      "actionItems": ["실행 아이디어"],
      "questions": ["새로운 질문"],
      "details": "심층 설명"
    }
  ]
}`;

  const parsed = await callGemini(prompt);
  return parsed.nodes;
};

/**
 * 사용자 입력 기반의 조종된 확장 (Steered Expansion)
 */
export const steeredExpandNode = async (
  nodeLabel: string, 
  userPrompt: string, 
  userRole = "사용자",
  deep = false
): Promise<ResearchSubNode[]> => {
  const prompt = `지금 당신은 [${userRole}]과 함께 "${nodeLabel}"에 대해 브레인스토밍 중입니다.
[${userRole}]이 다음과 같은 요청을 했습니다: "${userPrompt}"

이 요청에 응답하여 "${nodeLabel}"에서 뻗어 나오는 5개의 새로운 아이디어 노드를 생성하세요.
창작자에게 실질적인 도움이 되는 구체적인 정보를 포함해야 합니다.

반드시 아래 JSON 형식으로만 답변하세요:
{
  "nodes": [
    {
      "label": "아이디어1",
      "summary": "설명",
      "inspiration": "이 아이디어를 어떻게 창작에 쓸지 한 줄 팁",
      "actionItems": ["당장 해볼 수 있는 것"],
      "questions": ["확장을 위한 질문"],
      "details": "구체적인 원리나 데이터"
    }
  ]
}`;

  const parsed = await callGemini(prompt, deep);
  return parsed.nodes;
};

/**
 * 두 아이디어의 융합 (Idea Bridging)
 */
export const bridgeIdeas = async (
  nodeA: string, 
  nodeB: string, 
  userRole = "사용자"
): Promise<ResearchSubNode[]> => {
  const prompt = `[${userRole}]의 관점에서 서로 다른 두 아이디어 "${nodeA}"와 "${nodeB}"를 창의적으로 결합(Bridging)해 보세요.
두 개념이 만났을 때 탄생할 수 있는 새로운 아이디어 3개를 추출하세요.

반드시 아래 JSON 형식으로만 답변하세요:
{
  "nodes": [
    {
      "label": "융합 아이디어1",
      "summary": "결합 원리 설명",
      "inspiration": "창작자 포인트",
      "actionItems": ["실행 방안"],
      "questions": ["나아갈 방향"],
      "details": "상세 융합 시나리오"
    }
  ]
}`;

  const parsed = await callGemini(prompt, true);
  return parsed.nodes;
};
