import { NextResponse } from "next/server";
import { splitScriptIntoCuts } from "@/lib/splitScript";

export async function POST(request: Request) {
  let scriptText: string | undefined;

  // request.json()도 잘못된 본문(JSON이 아닌 요청 등)에서 던질 수 있어 파싱 로직과
  // 같은 try/catch 안에 둔다 — 이전에는 이 부분이 try 밖에 있어서 여기서 예외가 나면
  // 깨끗한 JSON 에러 대신 Next.js 기본 에러 페이지가 내려가 클라이언트의 fetch가
  // 기대하는 형태로 실패를 전달받지 못했다.
  try {
    const body = (await request.json()) as { scriptText?: string };
    scriptText = body.scriptText;

    if (!scriptText || !scriptText.trim()) {
      return NextResponse.json(
        { error: "원고 내용을 입력해주세요." },
        { status: 400 }
      );
    }

    const cuts = splitScriptIntoCuts(scriptText);
    return NextResponse.json({ cuts });
  } catch (err) {
    console.error("[/api/cuts/split] 원고 분할 실패:", err);
    return NextResponse.json(
      { error: "원고를 분할하지 못했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
