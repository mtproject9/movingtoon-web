export const CUT_STATUSES = ["SCRIPT_DONE", "DRAWING", "FINAL_DONE"] as const;

export type CutStatus = (typeof CUT_STATUSES)[number];

export const CUT_STATUS_LABEL: Record<CutStatus, string> = {
  SCRIPT_DONE: "원고 완료",
  DRAWING: "작화완료",
  FINAL_DONE: "최종 완성",
};

// 배지에 마우스를 올렸을 때 보여줄 설명 — 각 상태가 정확히 무엇을 의미하고
// 언제 자동으로 바뀌는지 명시해 혼동을 줄인다.
export const CUT_STATUS_DESCRIPTION: Record<CutStatus, string> = {
  SCRIPT_DONE: "컷 분할까지 완료된 상태입니다. 아직 이미지가 생성되지 않았습니다.",
  DRAWING: "이 컷에 이미지가 하나 이상 생성/업로드되어 작화가 끝났습니다.",
  FINAL_DONE: "이전 버전에서 쓰이던 상태입니다. 지금은 자동으로 지정되지 않습니다.",
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
  // directionNote(한글 자유 연출 메모)의 영문 번역 캐시. 이미지 생성용 영문
  // 프롬프트에는 이 값을 쓰고, 한글 프롬프트에는 원문 directionNote를 그대로 쓴다 —
  // 번역 API 호출이 필요해 동기적으로 계산할 수 없으므로 컷 저장 시 함께 캐싱해둔다.
  directionNoteEn?: string;
  status: CutStatus;
  // 사용자가 직접 수정한 프롬프트. 없으면 에셋 스튜디오에서 스타일 프리셋 기준으로
  // 매번 새로 조합해 보여준다 (수정 즉시 여기에 저장되어 프리셋을 바꿔도 유지됨).
  promptEn?: string;
  promptKo?: string;
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

export interface StylePreset {
  id: string;
  label: string;
  descriptionKo: string;
  styleTagsEn: string;
}

export interface Series {
  id: string;
  title: string;
  logline: string;
  thumbnail: string; // data URL, 없으면 빈 문자열
  createdAt: number;
  // 사용자가 직접 추가한 스타일 프리셋. 시리즈 전체 회차에서 공유해, 한 번 등록하면
  // 그 시리즈의 모든 회차에서 선택해 쓸 수 있다.
  customStylePresets: StylePreset[];
}

export interface Episode {
  id: string;
  seriesId: string;
  title: string; // 예: "1화", "프롤로그"
  episodeNumber: number;
  createdAt: number;
  // 캡컷 등에서 편집을 마친 완성 영상의 구글 드라이브(등) 링크만 등록해두는
  // 필드 — 영상 파일 자체는 앱에 올리지 않고, 이 값의 유무로 회차별 완성
  // 여부를 추적한다.
  finalVideoUrl?: string;
}

export function formatEpisodeLabel(episode: Episode) {
  return episode.title || `${episode.episodeNumber}화`;
}

export const ASSET_TYPES = ["IMAGE", "AUDIO"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface CutAsset {
  id: string;
  // 없으면(undefined) 특정 컷에 속하지 않는 이미지다 — 배경/참고용으로 갤러리에
  // 직접 업로드한 경우처럼, 원고 분할과 무관하게 회차 전체에서 쓰는 이미지.
  cutId?: string;
  type: AssetType;
  // 원본(IMAGE) 또는 오디오 파일의 공개 URL. /api/assets/upload로 올린 뒤에는
  // Vercel Blob의 정적 URL이고, 과거 데이터는 data URL일 수 있다.
  fileUrl: string;
  // IMAGE 전용: 그리드/카드 렌더링에 쓰는 800px 경량 썸네일 URL. 없으면 fileUrl로 대체 표시.
  thumbnailUrl?: string;
  fileName: string;
  version: number;
  uploadedAt: number;
  // 이미지 갤러리에서 실수로 지우는 것을 막는 잠금 표시. 잠긴 동안은 갤러리에서
  // 삭제 버튼이 비활성화된다 — 다른 화면(에셋 스튜디오 등)의 삭제에는 관여하지 않는다.
  locked?: boolean;
}

// 진행 보드("최종 이미지 모음"): 여러 버전 중 실제로 쓰기로 확정한 이미지만 따로
// 모아 순서를 매겨 관리하는 공간. CutAsset과 별개로 존재해 — 원본 컷의 버전
// 히스토리는 그대로 두고, "이 버전을 최종으로 쓴다"는 결정만 복사해 담는다.
export interface BoardImage {
  id: string;
  fileUrl: string;
  thumbnailUrl?: string;
  fileName: string;
  // 이 이미지가 어느 컷에서 왔는지(있다면) — 참고용, 없으면 보드에 직접 업로드한 이미지.
  sourceCutId?: string;
  order: number;
  addedAt: number;
  // 업스케일된 고화질 버전의 URL. 원본(fileUrl)은 비교/재시도를 위해 그대로 두고,
  // 있으면 이쪽이 최종 다운로드용으로 쓰인다.
  upscaledUrl?: string;
}

// 캐릭터 참조 이미지(최대 100장)는 서버(Postgres 메타데이터 + Vercel Blob 파일)에
// 저장한다. 브라우저 로컬(IndexedDB)에만 있으면 다른 기기/브라우저에서는 안 보이는
// 문제가 있어, 어디서 접속하든 똑같이 보이도록 서버로 옮겼다(lib/galleryDb.ts).
export interface GalleryImageMeta {
  id: string;
  characterId: string;
  fileName: string;
  // 그리드/휴지통 미리보기용 320px 썸네일의 공개 URL.
  thumbnailUrl: string;
  // 원본 화질 파일의 공개 URL — 다운로드/라이트박스에서 쓴다.
  fileUrl: string;
  originalWidth: number;
  originalHeight: number;
  order: number;
  createdAt: number;
}

// ── 휴지통(soft delete) ──────────────────────────────────────────────
// 삭제된 항목은 즉시 지우지 않고 서버 DB(lib/trashDb.ts, trash_entries 테이블)의
// 휴지통 저장소로 옮긴다 — 브라우저 로컬(IndexedDB)에만 있으면 그 브라우저에서만
// 복구 가능해 다른 기기에서 삭제/복원이 어긋나는 문제가 있어 서버로 옮겼다.
// 컨테이너 성격의 항목(시리즈/회차/캐릭터)을 지우면 그 안에 속한 하위 데이터까지
// payload 안에 통째로 묶어 하나의 휴지통 항목으로 보관한다 — 복원 시 한 번에 되돌아오고,
// 목록도 항목 수만큼 폭발적으로 늘어나지 않는다.
export type TrashItemType =
  | "series"
  | "episode"
  | "character"
  | "cut"
  | "cutAsset"
  | "galleryImage"
  | "boardImage";

export interface CutTrashPayload {
  cut: Cut;
}

export interface CutAssetTrashPayload {
  asset: CutAsset;
}

export interface BoardImageTrashPayload {
  image: BoardImage;
}

export interface GalleryImageTrashPayload {
  image: GalleryImageMeta;
}

export interface CharacterTrashPayload {
  character: Character;
  galleryImages: GalleryImageMeta[];
}

export interface EpisodeTrashPayload {
  episode: Episode;
  cuts: Cut[];
  assets: CutAsset[];
  stylePreset: string | null;
  board: BoardImage[];
}

export interface SeriesTrashPayload {
  series: Series;
  episodes: EpisodeTrashPayload[];
  characters: CharacterTrashPayload[];
}

export type TrashPayload =
  | CutTrashPayload
  | CutAssetTrashPayload
  | BoardImageTrashPayload
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
