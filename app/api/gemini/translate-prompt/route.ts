import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// 에셋 스튜디오에서 영문/한글 프롬프트 중 한쪽을 수정했을 때 다른 쪽에 반영하는
// 번역 전용 엔드포인트. 이미지 생성(/api/generate/image)과 같은 방식으로 서버의
// .env.local 키를 기본으로 쓰고, 클라이언트가 키를 넘기면 그걸 우선한다.
const TEXT_MODEL = "gemini-3.6-flash";

type Direction = "en-to-ko" | "ko-to-en";

interface TranslatePromptRequest {
  apiKey?: string;
  text?: string;
  direction?: Direction;
}

const INSTRUCTIONS: Record<Direction, string> = {
  "ko-to-en":
    "You are translating a Korean webtoon (manhwa) AI image-generation prompt into English, " +
    "keeping the same vivid, descriptive, comma-separated tag style used for image-generation prompts. " +
    "Respond with ONLY the translated English prompt text — no explanation, no quotes, no markdown.",
  "en-to-ko":
    "You are translating an English webtoon (manhwa) AI image-generation prompt into natural Korean, " +
    "keeping it concise and in the same descriptive prompt style. " +
    "Respond with ONLY the translated Korean text — no explanation, no quotes, no markdown.",
};

export async function POST(request: Request) {
  let body: TranslatePromptRequest;
  try {
    body = (await request.json()) as TranslatePromptRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes("여기에")) {
    return NextResponse.json(
      { error: "Gemini API 키가 설정되지 않았습니다.", code: "MISSING_API_KEY" },
      { status: 500 }
    );
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "번역할 텍스트가 필요합니다." }, { status: 400 });
  }

  const direction = body.direction;
  if (direction !== "en-to-ko" && direction !== "ko-to-en") {
    return NextResponse.json({ error: "번역 방향이 올바르지 않습니다." }, { status: 400 });
  }

  const instruction = `${INSTRUCTIONS[direction]}\n\nText to translate:\n${text}`;

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      config: { temperature: 0.3 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json(
      { error: `Gemini API 호출에 실패했습니다: ${message.slice(0, 300)}` },
      { status: 502 }
    );
  }

  if (response.promptFeedback?.blockReason) {
    return NextResponse.json(
      { error: `번역이 차단되었습니다 (${response.promptFeedback.blockReason}).` },
      { status: 422 }
    );
  }

  const translated = response.text?.trim();
  if (!translated) {
    return NextResponse.json(
      { error: "Gemini 응답에서 텍스트를 받지 못했습니다." },
      { status: 502 }
    );
  }

  return NextResponse.json({ text: translated });
}
