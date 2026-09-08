export interface ImageProvider {
  id: string;
  label: string;
  enabled: boolean;
}

// 지금은 Gemini만 실제로 연동되어 있다. 다른 서비스는 어떤 걸 추가할지 아직
// 정해지지 않아, 선택지에는 미리 보여주되(UI를 나중에 다시 만들지 않아도 되도록)
// 선택은 막아둔다 — 연동이 준비되면 enabled만 true로 바꾸면 된다.
export const IMAGE_PROVIDERS: ImageProvider[] = [
  { id: "gemini", label: "Gemini", enabled: true },
  { id: "openai", label: "OpenAI (준비 중)", enabled: false },
  { id: "stability", label: "Stability AI (준비 중)", enabled: false },
];

export const DEFAULT_IMAGE_PROVIDER_ID = "gemini";
