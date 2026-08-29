export const CUT_STATUSES = [
  "SCRIPT_DONE",
  "DRAWING",
  "VOICE_DONE",
  "FINAL_DONE",
] as const;

export type CutStatus = (typeof CUT_STATUSES)[number];

export const CUT_STATUS_LABEL: Record<CutStatus, string> = {
  SCRIPT_DONE: "원고 완료",
  DRAWING: "작화 중",
  VOICE_DONE: "음성 완료",
  FINAL_DONE: "최종 완성",
};

export interface Cut {
  id: string;
  cutNumber: number;
  sceneNumber: number;
  scriptText: string;
  dialogue: string;
  emotionTag: string;
  cameraAngle: string;
  expression: string;
  directionNote: string;
  status: CutStatus;
  // 사용자가 직접 수정한 프롬프트. 없으면 화면②에서 스타일 프리셋 기준으로
  // 매번 새로 조합해 보여준다 (수정 즉시 여기에 저장되어 프리셋을 바꿔도 유지됨).
  promptEn?: string;
  promptKo?: string;
  // 원고 분할 화면 우측 패널의 AI 이미지 프롬프트. buildSplitImagePrompt로 자동
  // 채워지고, 사용자가 자유롭게 수정할 수 있다. 승인(isPromptApproved)되면 잠긴다.
  imagePrompt?: string;
  isPromptApproved?: boolean;
  // 원고 분할 화면에서 Gemini로 생성한 컷 미리보기 이미지 (data URL). 용량이 커
  // localStorage에는 담기지 않고 IndexedDB(lib/cutsDb.ts)에만 전체 값이 저장된다.
  imageUrl?: string;
}

export function formatCutLabel(cutNumber: number) {
  return `Cut_${String(cutNumber).padStart(2, "0")}`;
}

export const CHARACTER_GENDERS = ["여성", "남성", "기타"] as const;
export type CharacterGender = (typeof CHARACTER_GENDERS)[number];

export interface Character {
  id: string;
  seriesId: string; // 캐릭터 시트는 시리즈 단위로 공유된다
  name: string;
  gender: CharacterGender;
  role: string; // 예: "여주인공", "남주인공", "조연"
  hairTag: string; // 영문 외형 태그
  eyeTag: string; // 영문 외형 태그
  outfitTag: string; // 영문 외형 태그
  profileImage: string; // data URL, 없으면 빈 문자열
  createdAt: number;
}

export interface Series {
  id: string;
  title: string;
  logline: string;
  thumbnail: string; // data URL, 없으면 빈 문자열
  createdAt: number;
}

export interface Episode {
  id: string;
  seriesId: string;
  title: string; // 예: "1화", "프롤로그"
  episodeNumber: number;
  createdAt: number;
}

export function formatEpisodeLabel(episode: Episode) {
  return episode.title || `${episode.episodeNumber}화`;
}

export const ASSET_TYPES = ["IMAGE", "AUDIO"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface CutAsset {
  id: string;
  cutId: string;
  type: AssetType;
  // 4K 원본(IMAGE) 또는 오디오 파일 경로. /api/assets/upload로 올린 뒤에는
  // public/uploads 아래 정적 경로("/uploads/...")이고, 과거 데이터는 data URL일 수 있다.
  fileUrl: string;
  // IMAGE 전용: 그리드/카드 렌더링에 쓰는 800px 경량 썸네일 경로. 없으면 fileUrl로 대체 표시.
  thumbnailUrl?: string;
  fileName: string;
  version: number;
  uploadedAt: number;
}

// 캐릭터 참조 이미지(최대 100장)는 용량이 커 localStorage가 아닌 IndexedDB(lib/galleryDb.ts)에
// 저장한다. 이 타입은 그 레코드 중 목록 렌더링에 필요한 메타데이터 + 썸네일만 담는다.
export interface GalleryImageMeta {
  id: string;
  characterId: string;
  fileName: string;
  thumbnailBlob: Blob;
  originalWidth: number;
  originalHeight: number;
  order: number;
  createdAt: number;
}

// ── 휴지통(soft delete) ──────────────────────────────────────────────
// 삭제된 항목은 즉시 지우지 않고 IndexedDB(lib/trashDb.ts)의 휴지통 저장소로 옮긴다.
// 컨테이너 성격의 항목(시리즈/회차/캐릭터)을 지우면 그 안에 속한 하위 데이터까지
// payload 안에 통째로 묶어 하나의 휴지통 항목으로 보관한다 — 복원 시 한 번에 되돌아오고,
// 목록도 항목 수만큼 폭발적으로 늘어나지 않는다.
export type TrashItemType = "series" | "episode" | "character" | "cut" | "cutAsset" | "galleryImage";

export interface GalleryImageTrashRecord {
  meta: GalleryImageMeta;
  originalBlob: Blob;
}

export interface CutTrashPayload {
  cut: Cut;
}

export interface CutAssetTrashPayload {
  asset: CutAsset;
}

export interface GalleryImageTrashPayload {
  image: GalleryImageTrashRecord;
}

export interface CharacterTrashPayload {
  character: Character;
  galleryImages: GalleryImageTrashRecord[];
}

export interface EpisodeTrashPayload {
  episode: Episode;
  cuts: Cut[];
  assets: CutAsset[];
  stylePreset: string | null;
}

export interface SeriesTrashPayload {
  series: Series;
  episodes: EpisodeTrashPayload[];
  characters: CharacterTrashPayload[];
}

export type TrashPayload =
  | CutTrashPayload
  | CutAssetTrashPayload
  | GalleryImageTrashPayload
  | CharacterTrashPayload
  | EpisodeTrashPayload
  | SeriesTrashPayload;

export interface TrashEntry {
  id: string;
  itemType: TrashItemType;
  label: string;
  deletedAt: number;
  // 복원 시 어디로 되돌려야 하는지에 필요한 부모 id들 (예: 컷 → episodeId)
  originPath: Record<string, string>;
  payload: TrashPayload;
}
