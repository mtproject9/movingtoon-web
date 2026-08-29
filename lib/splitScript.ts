import { detectEmotion } from "./promptRules";
import type { Cut } from "./types";

const MIN_CUTS_PER_SCENE = 3;
const MAX_CUTS_PER_SCENE = 5;

// 따옴표 추출은 정규식 한 방으로 훑는 대신, 여는/닫는 문자를 명시적으로 짝지어 문자열을
// 직접 스캔한다 — 어떤 줄이 왜 매칭되고 왜 안 되는지 눈으로 바로 추적할 수 있고, 서로
// 다른 스타일의 따옴표가 잘못 짝지어지는 것도 막는다.
const QUOTE_PAIRS: readonly [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
];
const QUOTE_CHARS = new Set(QUOTE_PAIRS.flat());

/**
 * text에서 가장 먼저 등장하는 따옴표 쌍을 찾아 그 안의 문장(dialogue)과, 그 구간을
 * 들어낸 나머지 텍스트(remainder)를 돌려준다. 완전한 쌍이 없으면(닫는 따옴표가
 * 아예 없는 등) null.
 */
function extractQuotedDialogue(text: string): { dialogue: string; remainder: string } | null {
  let openIndex = -1;
  let pair: [string, string] | null = null;

  for (const candidate of QUOTE_PAIRS) {
    const index = text.indexOf(candidate[0]);
    if (index === -1) continue;
    if (openIndex === -1 || index < openIndex) {
      openIndex = index;
      pair = candidate;
    }
  }

  if (openIndex === -1 || !pair) return null;

  const [openChar, closeChar] = pair;
  const closeIndex = text.indexOf(closeChar, openIndex + openChar.length);
  if (closeIndex === -1) return null;

  const dialogue = text.slice(openIndex + openChar.length, closeIndex).trim();
  const remainder = text.slice(0, openIndex) + text.slice(closeIndex + closeChar.length);

  return { dialogue, remainder };
}

// 닫는 짝을 못 찾아 extractQuotedDialogue가 null을 돌려준 경우(예: 닫는 따옴표
// 누락)를 위한 최후의 정리 — 앞/뒤에 남은 낱개 따옴표 문자만 걷어낸다.
function stripStrayQuoteChars(text: string): string {
  let result = text;
  if (result.length > 0 && QUOTE_CHARS.has(result[0])) result = result.slice(1);
  if (result.length > 0 && QUOTE_CHARS.has(result[result.length - 1])) {
    result = result.slice(0, -1);
  }
  return result.trim();
}

// 지문/씬 라인의 신호가 되는 접두 키워드. 대괄호로 감싼 "[씬 5]" 형태도 인정한다.
const DIRECTION_LABEL_PATTERN = /^\[?\s*(화면|씬|장면|효과음|bgm|scene|shot|cut|s#)/i;

const PAREN_PATTERN = /\(([^()]*)\)/g;

interface ParsedUnit {
  raw: string;
  dialogue: string;
  directionNote: string;
  emotionOverride: string;
  emotionSource: string;
}

function splitIntoParagraphs(text: string): string[] {
  const byBlankLine = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (byBlankLine.length > 1) return byBlankLine;

  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitIntoSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?…])\s+(?=[^)])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function chunk<T>(items: T[], max: number): T[][] {
  if (items.length <= max) return [items];

  const sceneCount = Math.ceil(items.length / max);
  // Math.max(1, ...)로 명시적으로 하한을 두어 i가 절대 멈추지 않는 값(0)만큼
  // 증가하는 경우가 생기지 않도록 방어한다 — 현재 입력으로는 발생할 수 없지만
  // 이 값이 0이면 아래 for 루프가 무한 루프가 되므로 감사 가능하게 명시해 둔다.
  const perScene = Math.max(1, Math.ceil(items.length / sceneCount));
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += perScene) {
    chunks.push(items.slice(i, i + perScene));
  }

  return chunks;
}

// Pulls every "(...)" out of a string, returning the leftover text (parens
// removed, whitespace collapsed) and the trimmed contents of each paren pair.
function extractParens(text: string): { clean: string; notes: string[] } {
  const notes: string[] = [];
  const clean = text
    .replace(PAREN_PATTERN, (_match, inner: string) => {
      const trimmed = inner.trim();
      if (trimmed) notes.push(trimmed);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  return { clean, notes };
}

function findLabelColonIndex(line: string): number {
  const half = line.indexOf(":");
  const full = line.indexOf("：");
  if (half === -1) return full;
  if (full === -1) return half;
  return Math.min(half, full);
}

// Plain-prose fallback for lines with no "이름:" 콜론 구조 at all — 따옴표가 있으면
// 그 안쪽만 대사로 뽑고, 없으면 통째로 지문(directionNote)이다.
function parseSentenceFallback(sentence: string): ParsedUnit {
  const quoted = extractQuotedDialogue(sentence);
  const dialogue = quoted ? quoted.dialogue : "";
  const narration = quoted ? quoted.remainder.trim() : sentence;

  return {
    raw: sentence,
    dialogue,
    directionNote: narration || "",
    emotionOverride: "",
    emotionSource: sentence,
  };
}

// 한 줄을 대사/지문으로 분류하는 핵심 로직. 볼드(**)로 감쌌든 안 감쌌든, 대시(-)로
// 시작하든 안 하든 완전히 같은 경로를 타도록 먼저 마크다운 기호를 걷어낸 뒤 콜론
// 구조만으로 판단한다 — "**민주:** ..."와 "민주: ..."가 서로 다르게 처리되던 것이
// 정확히 이번에 고친 버그(볼드로 안 감싼 대사 줄이 통째로 지문으로 새던 문제)의 원인이었다.
// 한 줄이 여러 ParsedUnit으로 쪼개질 수 있어(콜론 없는 서술문은 문장 단위로 나뉜다)
// 배열을 돌려준다.
function classifyLine(rawLine: string): ParsedUnit[] {
  const line = rawLine
    .replace(/^[-*—–]\s*/, "")
    .replace(/\*\*/g, "")
    .trim();

  const colonIndex = findLabelColonIndex(line);

  // 콜론이 아예 없는 순수 서술문 — 문장 단위로 쪼개 따옴표만 대사로 뽑아낸다.
  // (예: "문이 열렸다. 연수가 들어왔다. 민주가 놀랐다." → 컷 3개)
  if (colonIndex === -1) {
    return splitIntoSentences(line).map(parseSentenceFallback);
  }

  const beforeColon = line.slice(0, colonIndex).trim();
  const afterColon = line.slice(colonIndex + 1).trim();
  const { clean: labelName, notes: labelNotes } = extractParens(beforeColon);

  if (DIRECTION_LABEL_PATTERN.test(labelName)) {
    // 화면/씬/효과음/BGM 등 지문 라인: dialogue는 항상 빈 값, 전부 directionNote로.
    const { clean: contentClean, notes: contentNotes } = extractParens(afterColon);
    const directionNote = (contentClean || afterColon).trim();
    const emotionSource = [...contentNotes, directionNote].filter(Boolean).join(" ") || line;

    return [
      {
        raw: rawLine,
        dialogue: "",
        directionNote,
        emotionOverride: "",
        emotionSource,
      },
    ];
  }

  // 캐릭터 대사 라인 — 최우선 처리. 콜론 뒤 텍스트를 무조건 dialogue로 삼는다.
  // 따옴표 쌍이 온전하면 그 안쪽만, 아니면(따옴표가 없거나 짝이 안 맞으면) 콜론 뒤
  // 텍스트 전체(낱개로 남은 따옴표 문자만 제거)를 그대로 쓴다.
  // ★ directionNote는 이 분기에서 절대 채우지 않는다 — 대사 문장이 지문 필드에
  //   중복으로 들어가는 것을 원천 차단한다.
  const quoted = extractQuotedDialogue(afterColon);
  const dialogueText = quoted ? quoted.dialogue : stripStrayQuoteChars(afterColon);
  const remainderRaw = quoted ? quoted.remainder : "";
  const { notes: remainderNotes } = extractParens(remainderRaw);

  const stageNotes = [...labelNotes, ...remainderNotes].filter(Boolean);
  const emotionOverride = stageNotes.join(", ");
  const dialogue = labelName ? `${labelName}: ${dialogueText}` : dialogueText;

  return [
    {
      raw: rawLine,
      dialogue,
      directionNote: "",
      emotionOverride,
      emotionSource: [emotionOverride, dialogueText].filter(Boolean).join(" ") || rawLine,
    },
  ];
}

function paragraphToUnits(paragraph: string): ParsedUnit[] {
  const lines = paragraph
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const units: ParsedUnit[] = [];

  for (const line of lines) {
    // 한 줄을 처리하다 예기치 못한 예외가 나도(문자열 파싱 로직이 아무리 방어적이어도
    // 완전히 배제할 수는 없다) 그 줄만 건너뛰고 나머지 원고는 계속 분할되게 한다 —
    // 줄 하나의 문제로 "컷으로 분할하기" 전체가 먹통이 되는 일을 막는다.
    try {
      units.push(...classifyLine(line));
    } catch (err) {
      console.warn("[splitScript] 줄 파싱 실패, 건너뜀:", line, err);
    }
  }

  return units;
}

function buildCut(cutNumber: number, sceneNumber: number, unit: ParsedUnit): Cut {
  const detected = detectEmotion(unit.emotionSource);
  const emotion = unit.emotionOverride
    ? { ...detected, tag: unit.emotionOverride }
    : detected;

  return {
    id: `cut-${cutNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cutNumber,
    sceneNumber,
    scriptText: unit.raw,
    dialogue: unit.dialogue,
    emotionTag: emotion.tag,
    cameraAngle: emotion.cameraAngle,
    expression: emotion.expression,
    directionNote: unit.directionNote,
    status: "SCRIPT_DONE",
  };
}

// 정상적인 원고는 이 줄 수를 넘지 않는다 — 잘못 붙여넣은 초대용량 텍스트(예: 파일
// 전체를 실수로 붙여넣은 경우)가 파싱 시간을 과도하게 늘리지 않도록 상한을 둔다.
const MAX_INPUT_LINES = 5000;

export function splitScriptIntoCuts(scriptText: string): Cut[] {
  const lines = scriptText.split("\n");
  const boundedText =
    lines.length > MAX_INPUT_LINES ? lines.slice(0, MAX_INPUT_LINES).join("\n") : scriptText;

  const paragraphs = splitIntoParagraphs(boundedText);
  const cuts: Cut[] = [];
  let cutNumber = 1;
  let sceneNumber = 0;

  for (const paragraph of paragraphs) {
    const units = paragraphToUnits(paragraph);
    if (units.length === 0) continue;

    const sceneChunks = chunk(units, MAX_CUTS_PER_SCENE);

    for (const sceneChunk of sceneChunks) {
      sceneNumber += 1;
      for (const unit of sceneChunk) {
        cuts.push(buildCut(cutNumber, sceneNumber, unit));
        cutNumber += 1;
      }
    }
  }

  return cuts;
}

export { MIN_CUTS_PER_SCENE, MAX_CUTS_PER_SCENE };
