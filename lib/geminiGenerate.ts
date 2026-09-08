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

/** 에셋 스튜디오에서 영문/한글 프롬프트 중 한쪽을 수정했을 때 다른 쪽으로 번역해
 *  반영한다. .env.local의 서버 키를 쓰므로 원고 분할 화면과 달리 apiKey가 필요 없다. */
export async function translatePrompt(
  text: string,
  direction: TranslateDirection
): Promise<string> {
  const res = await fetch("/api/gemini/translate-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, direction }),
  });

  const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;

  if (!res.ok || !body?.text) {
    throw new Error(body?.error ?? "번역에 실패했습니다.");
  }

  return body.text;
}
