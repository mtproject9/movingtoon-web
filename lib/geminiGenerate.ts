export interface GenerateCutImageParams {
  prompt: string;
  characterReferenceImages?: string[];
  aspectRatio?: string;
  // 원고 분할 화면에서만 넘어온다 — 있으면 서버 .env.local 키보다 우선 사용된다.
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

export interface RefineCutPromptParams {
  apiKey: string;
  dialogue: string;
  emotionTag: string;
  expression: string;
  cameraAngle: string;
  directionNote: string;
}

/** 사용자가 입력한 Gemini 키로 컷 정보를 영문 이미지 프롬프트로 윤문/번역한다.
 *  호출부(handleRegeneratePrompt)가 실패 시 로컬 템플릿으로 폴백한다. */
export async function refineCutPromptWithGemini(params: RefineCutPromptParams): Promise<string> {
  const res = await fetch("/api/gemini/refine-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const body = (await res.json().catch(() => null)) as { prompt?: string; error?: string } | null;

  if (!res.ok || !body?.prompt) {
    throw new Error(body?.error ?? "프롬프트 생성에 실패했습니다.");
  }

  return body.prompt;
}
