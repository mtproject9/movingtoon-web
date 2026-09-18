export interface GenerateCutImageParams {
  prompt: string;
  characterReferenceImages?: string[];
  aspectRatio?: string;
  // 넘기면 서버 .env.local 키보다 우선 사용된다. 지금은 항상 서버 키로 처리된다.
  apiKey?: string;
}

export interface GenerateCutImageResult {
  imageBase64: string;
  mimeType: string;
}

/** GEMINI_API_KEY가 .env.local에 설정되지 않았을 때 던져진다 — 호출부는 이걸 감지해
 *  일반 에러 대신 안내 모달을 띄운다. */
export class GeminiApiKeyMissingError extends Error {}

export async function generateCutImage(
  params: GenerateCutImageParams
): Promise<GenerateCutImageResult> {
  const res = await fetch("/api/generate/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const body = (await res.json().catch(() => null)) as
    | { imageBase64?: string; mimeType?: string; error?: string; code?: string }
    | null;

  if (!res.ok || !body?.imageBase64) {
    const message = body?.error ?? "이미지 생성에 실패했습니다.";
    if (body?.code === "MISSING_API_KEY") {
      throw new GeminiApiKeyMissingError(message);
    }
    throw new Error(message);
  }

  return { imageBase64: body.imageBase64, mimeType: body.mimeType || "image/png" };
}

export type TranslateDirection = "en-to-ko" | "ko-to-en";

// 컷이 많은 회차(수십~수백 개)를 열면 각 행(CutStudioRow)이 독립적으로 자기
// 컷의 번역을 마운트 즉시 요청한다 — 요청 자체를 0~3초 사이로 흩어봐도(호출부
// 참고) 그건 "우리 서버가 순간적으로 안 몰리게"일 뿐, Gemini 쪽 분당 요청 한도
// (RPM)는 그보다 훨씬 낮아서 여전히 절반 이상이 429(한도 초과)로 실패했다.
// 그래서 모든 translatePrompt 호출을 앱 전체에서 하나의 큐로 직렬화해 한 번에
// 하나씩만, 최소 간격을 두고 나가게 한다 — 컷이 몇 개든 Gemini 쪽에서 보기엔
// 늘 "한 번에 하나씩 순서대로 오는" 정상적인 트래픽이 된다.
const MIN_REQUEST_INTERVAL_MS = 1200;
const MAX_RETRIES = 3;

let queueTail: Promise<unknown> = Promise.resolve();
let lastDispatchAt = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = lastDispatchAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastDispatchAt = Date.now();
    return task();
  };

  // 이전 큐 작업이 성공하든 실패하든(catch로 흡수) 다음 작업은 계속 이어져야
  // 하므로, 큐 자체의 진행을 막지 않도록 별도 체인에 실제 결과를 연결한다.
  const result = queueTail.then(run, run);
  queueTail = result.catch(() => undefined);
  return result;
}

async function translatePromptOnce(text: string, direction: TranslateDirection): Promise<string> {
  const res = await fetch("/api/gemini/translate-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, direction }),
  });

  const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;

  if (!res.ok || !body?.text) {
    const error = new Error(body?.error ?? "번역에 실패했습니다.") as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return body.text;
}

/** 에셋 스튜디오에서 영문/한글 프롬프트 중 한쪽을 수정했을 때 다른 쪽으로 번역해
 *  반영한다. .env.local의 서버 키를 쓰므로 원고 분할 화면과 달리 apiKey가 필요 없다.
 *  앱 전체 공유 큐를 거쳐 직렬화되고, 한도 초과(429)/서버 과부하(503)는 잠깐
 *  기다렸다 자동 재시도한다. */
export async function translatePrompt(
  text: string,
  direction: TranslateDirection
): Promise<string> {
  return enqueue(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await translatePromptOnce(text, direction);
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number })?.status;
        if ((status !== 429 && status !== 503) || attempt === MAX_RETRIES) throw err;
        const backoff = 2000 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw lastError;
  });
}
