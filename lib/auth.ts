// 미들웨어(Edge 런타임)와 로그인 API 라우트(Node 런타임) 양쪽에서 다 써야 해서,
// 두 런타임에 공통으로 있는 Web Crypto(crypto.subtle)로 구현한다.
export const AUTH_COOKIE_NAME = "mt_auth";

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 쿠키에 비밀번호 원문 대신 이 값을 저장한다 — 브라우저 개발자 도구로 쿠키를
// 봐도 원문 비밀번호가 그대로 노출되지는 않는다(1인용 도구라 완벽한 보안까지는
// 필요 없지만, 이 정도는 비용 없이 지킬 수 있어 적용해둔다).
export async function expectedAuthCookieValue(): Promise<string | null> {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}
