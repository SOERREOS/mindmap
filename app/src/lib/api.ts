const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

// ── 선호 모델 순위 (최신·빠른 순) ─────────────────────────────
// 실제 사용 가능 여부는 아래 getModels()가 API에서 자동 확인함
const PREFERRED = [
  'gemini-1.5-flash',     // 초안정성 1순위 (부하 적음)
  'gemini-1.5-pro',       // 안정성 2순위
  'gemini-3.1-flash-lite',// 최신 성능 백업
  'gemini-3.1-pro',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

// ── 사용 가능한 모델 자동 조회 + 캐시 ────────────────────────
let _cachedModels: string[] | null = null;
let _blacklistedModels = new Set<string>(); // 이번 세션에서 부속/부하 발생한 모델들

async function getModels(): Promise<string[]> {
  if (_cachedModels && _cachedModels.length > 0) return _cachedModels;

  const versions = ['v1', 'v1beta'];
  let availableSet = new Set<string>();

  for (const ver of versions) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${API_KEY}&pageSize=50`);
      const data = await res.json();
      if (data.models) {
        data.models.forEach((m: any) => {
          const id = m.name.replace('models/', '');
          if (m.supportedGenerationMethods?.includes('generateContent')) {
            availableSet.add(id);
          }
        });
      }
    } catch (e) { console.warn(`Discovery failed for ${ver}`, e); }
  }

  // 선호 모델 중 실제로 목록에 있는 것들만 순서대로 추출
  const final = PREFERRED.filter(m => availableSet.has(m));
  
  // 리스트에 없더라도 1.5-flash 같은 기본 모델은 무조건 백업으로 포함
  if (!availableSet.has('gemini-1.5-flash')) availableSet.add('gemini-1.5-flash');
  
  // 가용한 전체 모델 중 블랙리스트 제외하고 블랙리스트 아닌 것들 추림
  const extra = Array.from(availableSet).filter(m => !PREFERRED.includes(m) && !_blacklistedModels.has(m));
  
  _cachedModels = [...final, ...extra].filter(m => !_blacklistedModels.has(m));
  if (_cachedModels.length === 0) _cachedModels = ['gemini-1.5-flash'];

  return _cachedModels;
}

function evictModel(model: string) {
  _blacklistedModels.add(model);
  _cachedModels = (_cachedModels || []).filter(m => m !== model);
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
const callGemini = async (prompt: string, deep = false, onStatus?: (msg: string) => void): Promise<any> => {
  // API 키 누락 즉시 감지
  if (!API_KEY) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. NEXT_PUBLIC_GEMINI_API_KEY 환경변수를 확인하세요.');
  }

  let models = await getModels();

  // 딥모드일 경우 Pro 모델을 최우선순위로 배치
  if (deep) {
    const proModels = models.filter(m => m.includes('pro'));
    const flashModels = models.filter(m => !m.includes('pro'));
    models = [...proModels, ...flashModels];
  }

  let lastError = '';

  for (const model of models) {
    if (onStatus) onStatus(`연결 시도 중: ${model}...`);

    const apiVersions = ['v1', 'v1beta']; // v1 우선 시도 (안정성)
    for (const ver of apiVersions) {
      try {
        const payload: any = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: deep ? 0.75 : 0.9,
          }
        };

        // v1beta에서만 responseMimeType 사용 (v1에서는 간혹 400 유발)
        if (ver === 'v1beta' && (model.includes('flash') || model.includes('pro'))) {
          payload.generationConfig.responseMimeType = 'application/json';
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        const result = await response.json();

        if (result.error) {
          const { code, message } = result.error;
          lastError = message;

          // 인증 오류 (401) — API 키 무효. 재시도 불필요
          if (code === 401 || message.includes('unregistered callers') || message.includes('API Key')) {
            throw new Error('API 키가 유효하지 않습니다. Gemini API 키를 확인하세요.');
          }

          // 만약 필드명 에러(400)가 나면 JSON 모드 없이 텍스트로만 다시 시도
          if (code === 400 && message.includes('responseMimeType')) {
            delete payload.generationConfig.responseMimeType;
            const retryRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              }
            );
            const retryJson = await retryRes.json();
            if (!retryJson.error) {
              return parseFirstJSON(retryJson.candidates[0].content.parts[0].text);
            }
          }

          if (code === 404 || code === 400 || code === 403 || message.toLowerCase().includes('available')) {
            evictModel(model);
            if (onStatus) onStatus(`${model} 가용 불가. 모델 교체 중...`);
            break;
          }
          if (code === 429 || code === 503) {
            evictModel(model);
            if (onStatus) onStatus(`${model} 부하 발생. 대체 엔진으로 우회합니다...`);
            break;
          }
          continue;
        }

        if (onStatus) onStatus(`분석 완료! 데이터를 구조화하는 중...`);
        const raw: string = result.candidates[0].content.parts[0].text;
        return parseFirstJSON(raw);
      } catch (e: any) {
        // 인증 오류는 재시도 없이 즉시 throw
        if (e.message.includes('API 키') || e.message.includes('unregistered')) throw e;
        lastError = e.message;
        break;
      }
    }
  }

  // [최종 생존 장치] 모든 시도가 부하로 실패했다면, 3초 대기 후 가장 튼튼한 1.5-flash로 마지막 시도
  if (lastError.includes('503') || lastError.includes('429') || lastError.includes('demand')) {
    if (onStatus) onStatus(`서버 혼잡도가 높습니다. 3초 후 최후의 수단(Long-Retry)을 실행합니다...`);
    await sleep(3000);
    try {
      const retryRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const retryJson = await retryRes.json();
      if (!retryJson.error) {
        return parseFirstJSON(retryJson.candidates[0].content.parts[0].text);
      }
    } catch { /* ignore */ }
  }

  throw new Error(`AI 탐색 중 오류가 발생했습니다. (${lastError})`);
};

// ── Public API ────────────────────────────────────────────────

/**
 * 초기 리서치 수행
 */
export const conductResearch = async (
  keyword: string, 
  userRole = "사용자", 
  onStatus?: (msg: string) => void
): Promise<ResearchMainNode[]> => {
  const seeds = keyword.split(',').map(s => s.trim()).filter(Boolean);
  const subject = seeds.length > 1
    ? `"${seeds.join('"과 "')}"의 교차 연관 관계`
    : `"${keyword}"`;

  const prompt = `당신은 유능한 브레인스토밍 파트너입니다.
지금 당신은 [${userRole}]과 함께 작업하고 있습니다.

사용자 입력: "${subject}"

위 입력이 단순 키워드일 수도 있고, 구체적인 상황·아이디어·고민일 수도 있습니다.
먼저 입력의 맥락을 파악하고, [${userRole}]의 관점에서 가장 유용하고 창의적인 연관 개념 5개를 추출하세요.
각 개념마다 5개의 하위 키워드를 생성하되, 사용자의 구체적인 상황이 반영된 실질적인 인사이트를 제공하세요.

반드시 아래 JSON 형식으로만 답변하세요:
{
  "nodes": [
    {
      "label": "주요개념",
      "category": "기술/문화/비즈니스/과학/예술/사회 중 택1",
      "summary": "한 문장 요약 (사용자 상황에 맞게 구체적으로)",
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

  const parsed = await callGemini(prompt, true, onStatus); // 초기 리서치는 Pro 가중치
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

// ── Core Point Pinching ───────────────────────────────────────────

export interface CorePinchItem {
  label: string;
  description: string;
}

export interface CorePinchResponse {
  questions: CorePinchItem[];
  suggestions: CorePinchItem[];
  aiPerspective?: string;
}

export const pinchCorePoints = async (idea: string): Promise<CorePinchResponse> => {
  const prompt = `당신은 상대방 말 속의 검증되지 않은 가정과 허점을 정확히 짚어내는 예리한 비평가입니다.
아래 사용자 입력을 분석하세요.

[분석1 - 날카로운 반문] 핵심 가정 3가지를 추출하고 각각에 대한 반문 질문을 작성하세요.
- 반드시 입력에 등장하는 구체적 요소(대상, 방식, 플랫폼 등)를 질문에 포함시키세요.
- 범용 질문 금지. (X): "고객이 원할까?" / (O): "20-30대가 흑백사진 콘텐츠를 컬러보다 선호한다는 데이터가 있나?"
- 한 문장, 구체적이고 날카롭게.

[분석2 - 리서치 제안] 실행 전에 조사해봐야 할 리서치 영역 2가지를 제안하세요.
- 구체적인 조사 방법이나 대상을 포함할 것.

[분석3 - AI 종합 견해] 이 아이디어의 전반적인 가능성, 강점, 개선 방향에 대해 솔직하고 구체적인 견해를 3-4문장으로 작성하세요.
- "이 아이디어는..." 형식으로 시작하세요.

사용자 입력: "${idea}"

반드시 아래 JSON 형식으로만 답변하세요:
{"questions":[{"label":"가정1키워드","description":"반문질문1"},{"label":"가정2키워드","description":"반문질문2"},{"label":"가정3키워드","description":"반문질문3"}],"suggestions":[{"label":"리서치분야1","description":"조사제안1"},{"label":"리서치분야2","description":"조사제안2"}],"aiPerspective":"AI의 3-4문장 종합 견해"}`;

  try {
    return await callGemini(prompt);
  } catch (err) {
    console.error('Pinch API failed, using fallback.', err);
    const snippet = idea.slice(0, 20);
    return {
      questions: [
        { label: '타겟 검증', description: `"${snippet}..."의 대상이 이 방식을 실제로 원한다는 데이터가 있나?` },
        { label: '경쟁 우위', description: '똑같은 방식의 경쟁자가 이미 있다면, 당신만의 차별점은 무엇인가?' },
        { label: '실행력', description: '첫 달에 반응이 없다면 다음 스텝이 명확히 준비되어 있는가?' },
      ],
      suggestions: [
        { label: '수요 조사', description: '타겟층이 유사 콘텐츠/서비스에 실제로 반응한 사례 조사' },
        { label: '플랫폼 분석', description: '선택한 채널에서 동일 포맷의 참여율·도달률 데이터 확인' },
      ],
      aiPerspective: '아이디어 자체의 방향성은 의미 있으나, 실행 전에 타겟 수요와 경쟁 환경을 먼저 검증하는 것이 중요합니다.',
    };
  }
};

export interface ResearchResult {
  title: string;
  summary: string;
  keyPoints: string[];
}

export const executeResearch = async (topic: string, idea: string): Promise<ResearchResult> => {
  const prompt = `당신은 리서치 전문가입니다. 아래 주제를 조사하고 구체적인 내용을 한국어로 작성하세요.

맥락: "${idea}"
조사 주제: "${topic}"

규칙 (반드시 준수):
- title: 조사 주제를 잘 나타내는 제목 (20자 이내)
- summary: 조사 결과의 핵심 내용을 2-3문장으로
- keyPoints: 실용적인 인사이트나 구체적 팩트 3-5개

반드시 아래 JSON 형식으로만 답변하세요:
{"title":"제목","summary":"2-3문장 핵심 요약","keyPoints":["구체적 포인트1","구체적 포인트2","구체적 포인트3"]}`;

  try {
    return await callGemini(prompt);
  } catch (err) {
    console.error('Research execution failed:', err);
    return {
      title: `"${topic}" 조사 결과`,
      summary: 'API 상태로 인해 현재 직접 조사가 어렵습니다. 아래 방향으로 검색해보세요.',
      keyPoints: ['구글 트렌드에서 관련 키워드 검색량 추이 확인', '유사 서비스 사례 직접 분석'],
    };
  }
};

export type AnalysisMode = 'swot' | 'feasibility' | 'competition';

export interface AnalysisResult {
  mode: AnalysisMode;
  title: string;
  sections: { label: string; emoji: string; points: string[] }[];
}

export const analyzeIdea = async (idea: string, mode: AnalysisMode): Promise<AnalysisResult> => {
  const modeConfigs: Record<AnalysisMode, { title: string; prompt: string; sections: string }> = {
    swot: {
      title: 'SWOT 분석',
      prompt: '이 아이디어의 강점·약점·기회·위협을 각각 정확히 2가지씩, 구체적인 사례와 맥락을 포함하여 분석하세요.',
      sections: '{"sections":[{"label":"강점","emoji":"💪","points":["구체적 강점1","구체적 강점2"]},{"label":"약점","emoji":"⚠️","points":["구체적 약점1","구체적 약점2"]},{"label":"기회","emoji":"🚀","points":["구체적 기회1","구체적 기회2"]},{"label":"위협","emoji":"🌩️","points":["구체적 위협1","구체적 위협2"]}]}',
    },
    feasibility: {
      title: '실행 가능성',
      prompt: '리소스·일정·장애물·첫 실행 단계를 각각 정확히 2가지씩, 구체적인 수치나 방법을 포함하여 분석하세요.',
      sections: '{"sections":[{"label":"필요 리소스","emoji":"🛠️","points":["구체적 리소스1","구체적 리소스2"]},{"label":"예상 일정","emoji":"📅","points":["구체적 일정1","구체적 일정2"]},{"label":"핵심 장애물","emoji":"🚧","points":["구체적 장애물1","구체적 장애물2"]},{"label":"첫 실행 단계","emoji":"✅","points":["구체적 단계1","구체적 단계2"]}]}',
    },
    competition: {
      title: '경쟁 분석',
      prompt: '유사 사례·시장 포지션·차별화 포인트·벤치마크 전략을 각각 정확히 2가지씩, 실제 시장 사례를 바탕으로 분석하세요.',
      sections: '{"sections":[{"label":"유사 사례","emoji":"👀","points":["구체적 사례1","구체적 사례2"]},{"label":"시장 포지션","emoji":"📍","points":["포지션 설명1","포지션 설명2"]},{"label":"차별화 포인트","emoji":"⚡","points":["차별화 포인트1","차별화 포인트2"]},{"label":"벤치마크 전략","emoji":"🎯","points":["전략1","전략2"]}]}',
    },
  };

  const cfg = modeConfigs[mode];
  const prompt = `당신은 전략 컨설턴트입니다.
아래 아이디어를 분석하세요: "${idea}"

${cfg.prompt}
반드시 아래 JSON 형식으로만 답변하세요:
${cfg.sections}`;

  try {
    const parsed = await callGemini(prompt);
    return { mode, title: cfg.title, sections: parsed.sections };
  } catch (err) {
    console.error('Analysis failed:', err);
    return {
      mode,
      title: cfg.title,
      sections: [{ label: '분석 오류', emoji: '⚠️', points: ['API 혼잡으로 분석에 실패했습니다. 잠시 후 다시 시도해주세요.'] }],
    };
  }
};

export interface FreeFormResult {
  type: 'research' | 'analysis' | 'answer' | 'suggestions';
  title: string;
  content: string;
  keyPoints?: string[];
}

export const freeFormAction = async (userRequest: string, idea: string): Promise<FreeFormResult> => {
  const prompt = `당신은 아이디어 분석 AI입니다. 사용자 요청에 구체적이고 실질적으로 답변하세요.

아이디어: "${idea}"
요청: "${userRequest}"

반드시 아래 JSON 형식으로만 답변하세요:
{"type":"research","title":"제목","content":"2-3문장 핵심 내용","keyPoints":["구체적 포인트1","구체적 포인트2","구체적 포인트3"]}`;

  try {
    return await callGemini(prompt);
  } catch (err) {
    console.error('Free form action failed:', err);
    return {
      type: 'answer',
      title: '응답',
      content: 'API 상태로 인해 현재 응답이 어렵습니다. 잠시 후 다시 시도해주세요.',
      keyPoints: [],
    };
  }
};
