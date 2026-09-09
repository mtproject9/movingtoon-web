// Gemini SDK가 던지는 에러는 원본 HTTP 응답을 그대로 문자열화한 JSON 텍스트라
// (예: {"error":{"code":429,"message":"..."}}) 사용자에게 그대로 보여주면 뭐가
// 문제인지 알기 어렵다. 자주 나오는 패턴만 알아보기 쉬운 한국어 안내로 바꾸고,
// 못 알아본 나머지는 기존처럼 원문을 잘라서 보여준다.
export function friendlyGeminiError(err: unknown): { message: string; status: number } {
  const raw = err instanceof Error ? err.message : String(err);

  if (/"code"\s*:\s*429/.test(raw) || /RESOURCE_EXHAUSTED/.test(raw)) {
    return {
      message:
        "Gemini API 사용 한도(할당량)를 초과했어요. 잠시 후 다시 시도해주시거나, 유료 플랜으로 전환하면 바로 풀려요.",
      status: 429,
    };
  }

  if (/"code"\s*:\s*503/.test(raw) || /UNAVAILABLE/.test(raw) || /overloaded/i.test(raw)) {
    return {
      message: "지금 Gemini 서버에 요청이 몰려 있어요. 잠시 후 다시 시도해주세요.",
      status: 503,
    };
  }

  if (/"code"\s*:\s*404/.test(raw) || /NOT_FOUND/.test(raw)) {
    return {
      message: "설정된 Gemini 모델을 찾을 수 없어요. 모델 이름 설정을 확인해주세요.",
      status: 502,
    };
  }

  return {
    message: `Gemini API 호출에 실패했습니다: ${raw.slice(0, 300)}`,
    status: 502,
  };
}
