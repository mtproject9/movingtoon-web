import type { StylePreset } from "./types";

export const BASE_STYLE_TAGS =
  "Korean romance webtoon style, anime aesthetic, soft warm lighting, dreamy atmosphere, vibrant pastel colors, 8k resolution, highly detailed beautiful eyes, expressive facial emotion, fluttery romantic vibe";

export const DEFAULT_NEGATIVE_PROMPT =
  "lowres, bad anatomy, extra limbs, deformed hands, blurry, watermark, text, signature";

export const DEFAULT_CAMERA_ANGLE = "close-up";

export const EMOTION_KEYWORDS: {
  keywords: string[];
  tag: string;
  expression: string;
  expressionEn: string;
  cameraAngle: string;
}[] = [
  {
    keywords: ["설레", "두근", "떨리"],
    tag: "설레며",
    expression: "볼이 발그레해지며 눈을 피하는 표정",
    expressionEn: "cheeks blushing softly, eyes shyly looking away",
    cameraAngle: "close-up on face",
  },
  {
    keywords: ["당황", "허둥", "어쩔 줄"],
    tag: "당황하며",
    expression: "놀라며 눈이 커지는 표정",
    expressionEn: "flustered expression, eyes widening in surprise",
    cameraAngle: "close-up",
  },
  {
    keywords: ["화나", "분노", "짜증", "화가"],
    tag: "화내며",
    expression: "미간을 찌푸리며 노려보는 표정",
    expressionEn: "brows furrowed, glaring intensely",
    cameraAngle: "bust shot",
  },
  {
    keywords: ["슬프", "눈물", "울먹", "울며"],
    tag: "슬퍼하며",
    expression: "눈에 눈물이 고인 채 입술을 깨무는 표정",
    expressionEn: "eyes welling up with tears, biting lip",
    cameraAngle: "close-up on eyes",
  },
  {
    keywords: ["기뻐", "행복", "웃으며", "미소"],
    tag: "행복해하며",
    expression: "환하게 미소 짓는 표정",
    expressionEn: "bright warm smile, joyful expression",
    cameraAngle: "bust shot",
  },
  {
    keywords: ["놀라", "깜짝", "헉"],
    tag: "놀라며",
    expression: "눈을 크게 뜨고 숨을 삼키는 표정",
    expressionEn: "eyes wide open, gasping in shock",
    cameraAngle: "close-up",
  },
];

const DEFAULT_EMOTION = {
  tag: "담담하게",
  expression: "잔잔한 표정으로 상대를 바라보는 모습",
  expressionEn: "calm gentle expression, quietly gazing at the other person",
  cameraAngle: DEFAULT_CAMERA_ANGLE,
};

export function detectEmotion(text: string) {
  const found = EMOTION_KEYWORDS.find((entry) =>
    entry.keywords.some((keyword) => text.includes(keyword))
  );

  return found ?? DEFAULT_EMOTION;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "modern-romance-webtoon",
    label: "Modern Romance Webtoon",
    descriptionKo: "선명한 색감의 모던 로맨스 웹툰 스타일",
    styleTagsEn:
      "modern Korean romance webtoon style, clean bold linework, vibrant saturated colors, trendy fashion, crisp cel shading",
  },
  {
    id: "soft-pastel-anime",
    label: "Soft Pastel Anime",
    descriptionKo: "몽환적인 파스텔톤 애니메이션 스타일",
    styleTagsEn:
      "soft pastel anime style, dreamy atmosphere, gentle color gradients, delicate line art, airy diffused lighting",
  },
  {
    id: "cinematic-drama",
    label: "Cinematic Drama",
    descriptionKo: "영화적인 조명과 구도의 드라마틱한 연출",
    styleTagsEn:
      "cinematic drama lighting, dramatic shadows, subtle film grain, wide dynamic range, moody atmosphere",
  },
];

export function getStylePreset(
  id: string | undefined,
  customPresets: StylePreset[] = []
): StylePreset {
  return (
    STYLE_PRESETS.find((preset) => preset.id === id) ??
    customPresets.find((preset) => preset.id === id) ??
    STYLE_PRESETS[0]
  );
}

// "연수: 오빠, 나 좀 봐봐." 형식의 대사에서 앞부분 화자 이름만 뽑아낸다.
export function extractSpeakerName(dialogue: string): string {
  const match = dialogue.match(/^([^:：]{1,12})[:：]\s*/);
  return match ? match[1].trim() : "";
}

export interface CutPromptInput {
  dialogue: string;
  emotionTag: string;
  expression: string;
  cameraAngle: string;
  directionNote: string;
  // directionNote의 번역 캐시. 없으면(아직 번역 전) 영문 프롬프트에서는 그냥
  // 비워둔다 — 번역 안 된 한글 원문을 영문 프롬프트에 그대로 흘려보내지 않기 위해.
  directionNoteEn?: string;
}

export interface CutPrompt {
  promptEn: string;
  promptKo: string;
  negativePrompt: string;
}

export interface CharacterAppearance {
  name: string;
  hairTag: string;
  eyeTag: string;
  outfitTag: string;
  // 이미지 생성 시 캐릭터 일관성 참조로 보낼 프로필 이미지(data URL). 프롬프트
  // 텍스트 조합에는 쓰이지 않고 Gemini 이미지 생성 요청에서만 사용한다.
  profileImage?: string;
}

export function buildCutPrompt(
  cut: CutPromptInput,
  presetId: string | undefined,
  character?: CharacterAppearance,
  customPresets: StylePreset[] = []
): CutPrompt {
  const preset = getStylePreset(presetId, customPresets);
  const emotion = detectEmotion(`${cut.emotionTag} ${cut.expression} ${cut.dialogue}`);
  const speaker = extractSpeakerName(cut.dialogue);
  const cameraAngle = cut.cameraAngle || DEFAULT_CAMERA_ANGLE;
  const sceneActionKo = cut.directionNote.trim();
  // 번역 전이면 빈 문자열로 둔다 — 한글 원문을 영문 프롬프트에 그대로 끼워 넣으면
  // 이미지 생성 모델이 그 부분을 제대로 이해하지 못한다.
  const sceneActionEn = (cut.directionNoteEn ?? "").trim();

  // 캐릭터 시트에 등록된 인물이면 일관성 유지를 위해 헤어/눈/의상 태그를 우선 사용하고,
  // 등록되지 않은 인물이면 일반적인 캐릭터 문구로 대체한다.
  const appearanceEn = character
    ? [character.name, character.hairTag, character.eyeTag, character.outfitTag]
        .filter(Boolean)
        .join(", ")
    : speaker
      ? `${speaker}, Korean romance webtoon character`
      : "Korean romance webtoon character";

  const promptEn = [
    preset.styleTagsEn,
    BASE_STYLE_TAGS,
    appearanceEn,
    emotion.expressionEn,
    cameraAngle,
    sceneActionEn,
  ]
    .filter(Boolean)
    .join(", ");

  // 영문 프롬프트와 마찬가지로 순수하게 "그림에 어떻게 보여야 하는가"만 담는다 —
  // 대사(말풍선에 들어갈 텍스트)는 이미지 생성과 무관한 정보라 영문 쪽엔 애초에
  // 없었는데, 한글 쪽에만 맨 끝에 붙어 있어 두 프롬프트가 서로 다른 내용을
  // 담게 되는 불일치가 있었다 — 제거해 둘을 같은 내용의 번역 관계로 맞춘다.
  const promptKo = [
    preset.descriptionKo,
    speaker,
    cut.emotionTag ? `[${cut.emotionTag}]` : "",
    cut.expression,
    cameraAngle ? `${cameraAngle} 구도` : "",
    sceneActionKo,
  ]
    .filter(Boolean)
    .join(" / ");

  return { promptEn, promptKo, negativePrompt: DEFAULT_NEGATIVE_PROMPT };
}

export const MIDJOURNEY_ASPECT_RATIO = "--ar 16:9";

/**
 * 영문 프롬프트(캐릭터 외형 태그 + 씬 프롬프트가 이미 조합되어 있음)에 미드저니
 * 비율 파라미터를 붙여 그대로 붙여넣기 가능한 형태로 만든다.
 */
export function buildMidjourneyPrompt(
  promptEn: string,
  aspectRatio: string = MIDJOURNEY_ASPECT_RATIO
): string {
  return [promptEn.trim(), aspectRatio].filter(Boolean).join(" ");
}

export interface ResolvableCut extends CutPromptInput {
  promptEn?: string;
  promptKo?: string;
}

export function matchSpeakerCharacter(
  dialogue: string,
  characters: CharacterAppearance[]
): CharacterAppearance | null {
  const speaker = extractSpeakerName(dialogue);
  if (!speaker) return null;
  return characters.find((character) => character.name.trim() === speaker.trim()) ?? null;
}

/** 대사 화자뿐 아니라 연출 메모에 언급된 다른 인물까지, 이 컷에 실제로 등장하는
 *  캐릭터를 전부 이름으로 찾아낸다. 이미지 생성 시 참조 이미지로 등록된 캐릭터
 *  전체가 아니라 이 컷에 나오는 인물만 보내기 위함 — 화자가 있으면 배열 맨 앞에 둔다. */
export function matchCutCharacters(
  cut: { dialogue: string; directionNote: string },
  characters: CharacterAppearance[]
): CharacterAppearance[] {
  const haystack = `${cut.dialogue} ${cut.directionNote}`;
  const matched = characters.filter((character) => {
    const name = character.name.trim();
    return name.length > 0 && haystack.includes(name);
  });
  const speaker = extractSpeakerName(cut.dialogue).trim();
  return matched.sort((a, b) => {
    if (a.name.trim() === speaker) return -1;
    if (b.name.trim() === speaker) return 1;
    return 0;
  });
}

/** 대사 화자를 캐릭터 시트와 매칭해 프롬프트를 만들고, 사용자가 직접 수정한 값이 있으면 그걸 우선한다. */
export function resolveCutPrompt(
  cut: ResolvableCut,
  presetId: string | undefined,
  characters: CharacterAppearance[],
  customPresets: StylePreset[] = []
): CutPrompt {
  const matchedCharacter = matchSpeakerCharacter(cut.dialogue, characters);
  const generated = buildCutPrompt(cut, presetId, matchedCharacter ?? undefined, customPresets);

  return {
    promptEn: cut.promptEn ?? generated.promptEn,
    promptKo: cut.promptKo ?? generated.promptKo,
    negativePrompt: generated.negativePrompt,
  };
}

/**
 * "나노바나나(Gemini)"류 태그형 프롬프트. 스타일 프리셋 문구 없이 캐릭터 핵심 키워드
 * (이름·헤어·눈·의상 태그)와 씬 묘사만 쉼표로 나열한다 — 미드저니용 자연어 프롬프트보다
 * 짧고 직설적인 태그 나열을 선호하는 이미지 생성 모델에 적합하다.
 */
export function buildTagStylePrompt(
  cut: CutPromptInput,
  character?: CharacterAppearance
): string {
  const speaker = extractSpeakerName(cut.dialogue);
  const emotion = detectEmotion(`${cut.emotionTag} ${cut.expression} ${cut.dialogue}`);
  const cameraAngle = cut.cameraAngle || DEFAULT_CAMERA_ANGLE;
  const sceneAction = cut.directionNote.trim();

  const characterTags = character
    ? [character.name, character.hairTag, character.eyeTag, character.outfitTag]
    : speaker
      ? [speaker]
      : [];

  return [...characterTags, emotion.expressionEn, cameraAngle, sceneAction]
    .filter(Boolean)
    .join(", ");
}
