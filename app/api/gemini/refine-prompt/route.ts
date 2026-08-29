import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// 원고 분할 화면 전용 텍스트 윤문 엔드포인트. 이미지 생성(/api/generate/image)과 달리
// 여기서는 .env.local의 서버 키를 쓰지 않고, 사용자가 화면에서 입력해 localStorage에
// 보관한 키를 매 요청 바디로 받아 그때그때 사용한다 — 서버에는 저장되지 않는다.
const TEXT_MODEL = "gemini-2.5-flash";

interface RefinePromptRequest {
  apiKey?: string;
  dialogue?: string;
  emotionTag?: string;
  expression?: string;
  cameraAngle?: string;
  directionNote?: string;
}

export async function POST(request: Request) {
  let body: RefinePromptRequest;
  try {
    body = (await request.json()) as RefinePromptRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API 키가 설정되지 않았습니다.", code: "MISSING_API_KEY" },
      { status: 400 }
    );
  }

  const instruction = `You are a professional prompt engineer for Korean romance webtoon (manhwa) illustration generation with Midjourney/Imagen.
Convert the following webtoon cut information (may be in Korean) into ONE vivid, richly descriptive English image-generation prompt.
Keep this overall shape: "Webtoon romance manhwa style, high quality digital illustration, scene: <translated scene/action>, character expression: <translated expression/emotion>, camera angle: <camera angle>, soft cinematic lighting, 8k resolution, vertical 9:16 webtoon frame".
Translate and enrich the Korean scene/expression into natural, visually specific English — do not leave Korean text in the output.
This is a regeneration request, so vary your word choice and the lighting/mood/style descriptors from what a previous generation might have used — do not settle on a single fixed phrasing.

Direction note (scene/action): ${body.directionNote?.trim() || "(none)"}
Dialogue: ${body.dialogue?.trim() || "(none)"}
Emotion tag: ${body.emotionTag?.trim() || "(none)"}
Expression: ${body.expression?.trim() || "(none)"}
Camera angle: ${body.cameraAngle?.trim() || "close-up"}

Respond with ONLY the final English prompt text — no explanation, no quotes, no markdown, no line breaks.`;

  const ai = new GoogleGenAI({ apiKey });

  // 매번 다른 묘사가 나오도록 0.7~0.9 사이에서 무작위 temperature를 준다 — 고정값이면
  // 같은 입력에 대해 매 클릭 결과가 비슷하게 수렴할 수 있다.
  const temperature = 0.7 + Math.random() * 0.2;

  let response;
  try {
    response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      config: { temperature },
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
      { error: `프롬프트가 차단되었습니다 (${response.promptFeedback.blockReason}).` },
      { status: 422 }
    );
  }

  const text = response.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Gemini 응답에서 텍스트를 받지 못했습니다." },
      { status: 502 }
    );
  }

  return NextResponse.json({ prompt: text });
}
