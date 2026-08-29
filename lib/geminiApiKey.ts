// 원고 분할 화면의 Gemini 연동은 .env.local의 서버 키가 아니라 사용자가 직접
// 입력한 키를 쓴다 — 브라우저에만 저장되고 서버에는 저장되지 않는다.
const STORAGE_KEY = "gemini_api_key";

export function getGeminiApiKey(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setGeminiApiKey(key: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // 저장 실패해도 화면 동작에는 영향 없음 (이번 세션에서만 값이 쓰인다)
  }
}

export function clearGeminiApiKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 이미 없거나 접근이 막힌 경우 무시
  }
}
