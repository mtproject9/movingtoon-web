import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, expectedAuthCookieValue } from "@/lib/auth";

// 개인용 도구라 APP_PASSWORD 환경변수가 설정된 경우에만 잠금이 걸린다 —
// 로컬 개발 중 .env.local에 아직 안 넣었으면(값이 없으면) 그냥 통과시킨다.
export async function proxy(request: NextRequest) {
  const expected = await expectedAuthCookieValue();
  if (!expected) return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie === expected) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  // API 요청은 리다이렉트가 아니라 401로 막는다 — 로그인 쿠키 없이 API를
  // 직접 두드리는 것까지 막아야 "페이지만 잠겨있고 API는 열려있는" 구멍이 안 생긴다.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // /login, /api/auth/login(로그인 처리 자체), Next 정적 자산은 잠금에서 제외.
  matcher: ["/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)"],
};
