import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { friendlyGeminiError } from "@/lib/geminiErrors";

// 캐릭터 시트 기반 컷 이미지 자동 생성. 공식 SDK(@google/genai)로 gemini-2.5-flash-image
// ("나노바나나")를 호출한다. 캐릭터 참조 이미지가 있으면 텍스트 프롬프트보다 먼저
// inlineData part로 넣어 멀티모달 입력으로 주입하고, 외형을 참조 이미지에 맞추라는
// 지시문을 프롬프트 앞에 붙여 캐릭터 일관성을 유도한다.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-image";

interface GenerateImageRequest {
  prompt?: string;
  characterReferenceImages?: string[];
  aspectRatio?: string;
  // 원고 분할 화면은 .env.local 서버 키 대신 사용자가 입력해 localStorage에 보관한
  // 키를 매 요청마다 넘긴다 — 넘어오면 서버 키보다 우선한다.
  apiKey?: string;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function POST(request: Request) {
  let body: GenerateImageRequest;
  try {
    body = (await request.json()) as GenerateImageRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const apiKey = body.apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes("여기에")) {
    return NextResponse.json(
      {
        error: "Gemini API 키가 설정되지 않았습니다.",
        code: "MISSING_API_KEY",
      },
      { status: 500 }
    );
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "프롬프트가 필요합니다." }, { status: 400 });
  }

  const referenceParts = (body.characterReferenceImages ?? [])
    .map(parseDataUrl)
    .filter((img): img is { mimeType: string; data: string } => img !== null)
    .map((img) => ({ inlineData: img }));

  const promptText =
    referenceParts.length > 0
      ? `Use the attached character reference image(s) to keep this character's appearance ` +
        `(hairstyle, eyes, outfit) consistent with the reference. Generate a new scene: ${prompt}`
      : prompt;

  const aspectRatio = body.aspectRatio?.trim() || "16:9";

  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [...referenceParts, { text: promptText }],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio },
      },
    });
  } catch (err) {
    const { message, status } = friendlyGeminiError(err);
    return NextResponse.json({ error: message }, { status });
  }

  if (response.promptFeedback?.blockReason) {
    return NextResponse.json(
      { error: `프롬프트가 차단되었습니다 (${response.promptFeedback.blockReason}).` },
      { status: 422 }
    );
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    return NextResponse.json(
      { error: "Gemini 응답에서 이미지를 받지 못했습니다. 모델이 이미지 생성을 지원하는지 확인해주세요." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  });
}
