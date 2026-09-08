import JSZip from "jszip";
import type { BoardImage, Character, Cut, CutAsset, Episode, Series, TrashEntry } from "./types";
import {
  MAX_GALLERY_IMAGES,
  addGalleryImages,
  clearAllGalleryData,
  getOriginalImageBlob,
  listGalleryImages,
} from "./galleryDb";
import { addTrashEntries, listTrashEntries } from "./trashDb";
import { restoreAssetFile } from "./assetUpload";

const BACKUP_VERSION = 1;

interface EpisodeAux {
  cuts: Cut[];
  assets: CutAsset[];
  stylePreset: string | null;
  board: BoardImage[];
}

// 시리즈/회차/캐릭터와 회차별 cuts/assets/stylePreset/board는 이제 서버(Postgres)에
// 있으므로 localStorage 대신 이 API들을 거쳐 읽고 쓴다. 캐릭터 참조 이미지 갤러리와
// 휴지통은 여전히 브라우저 IndexedDB에 있어 기존 로직을 그대로 쓴다.
async function fetchBootstrap(): Promise<{ series: Series[]; episodes: Episode[]; characters: Character[] }> {
  const res = await fetch("/api/db/bootstrap");
  if (!res.ok) return { series: [], episodes: [], characters: [] };
  return res.json();
}

async function fetchEpisodeAux(episodeId: string): Promise<EpisodeAux> {
  const res = await fetch(`/api/db/episodes/${episodeId}`);
  if (!res.ok) return { cuts: [], assets: [], stylePreset: null, board: [] };
  const data = (await res.json()) as EpisodeAux;
  return {
    cuts: data.cuts ?? [],
    assets: data.assets ?? [],
    stylePreset: data.stylePreset ?? null,
    board: data.board ?? [],
  };
}

async function postJson(url: string, body: unknown): Promise<void> {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchJson(url: string, body: unknown): Promise<void> {
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface EpisodeBackupData {
  cuts: Cut[];
  assets: CutAsset[];
  stylePreset: string | null;
  board: BoardImage[];
}

interface GalleryIndexEntry {
  characterId: string;
  fileName: string;
  zipPath: string;
}

export interface BackupData {
  version: number;
  exportedAt: number;
  series: Series[];
  episodes: Episode[];
  characters: Character[];
  episodeData: Record<string, EpisodeBackupData>;
  galleryIndex: GalleryIndexEntry[];
  // 휴지통 항목은 Blob(참조 이미지)을 담을 수 있어 직렬화 전 extractBlobsForZip으로
  // Blob을 zip 파일로 빼내고 JSON에는 zip 경로 문자열만 남긴다. 내보내기 옵션에서
  // 휴지통 포함을 껐으면 이 필드 자체가 없다.
  trash?: unknown[];
}

export type ImportMode = "overwrite" | "merge";
export type ProgressCallback = (phase: string, percent: number) => void;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const ZIP_BLOB_PLACEHOLDER = "__zipBlob__:";

// 휴지통 payload는 타입마다(시리즈→회차/캐릭터→갤러리이미지) Blob이 서로 다른 깊이에
// 중첩돼 있다. 타입별로 일일이 분기하는 대신 트리를 재귀적으로 훑어 Blob을 만나면
// zip 파일로 옮기고 그 자리에 경로 문자열만 남기는 방식으로 통일해 처리한다.
function extractBlobsForZip(value: unknown, zip: JSZip, pathPrefix: string, counter: { n: number }): unknown {
  if (value instanceof Blob) {
    const path = `${pathPrefix}/${counter.n++}.bin`;
    zip.file(path, value);
    return `${ZIP_BLOB_PLACEHOLDER}${path}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => extractBlobsForZip(item, zip, pathPrefix, counter));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = extractBlobsForZip(item, zip, pathPrefix, counter);
    }
    return out;
  }
  return value;
}

async function hydrateBlobsFromZip(value: unknown, zip: JSZip): Promise<unknown> {
  if (typeof value === "string" && value.startsWith(ZIP_BLOB_PLACEHOLDER)) {
    const path = value.slice(ZIP_BLOB_PLACEHOLDER.length);
    const entry = zip.file(path);
    return entry ? await entry.async("blob") : null;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => hydrateBlobsFromZip(item, zip)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = await hydrateBlobsFromZip(item, zip);
    }
    return out;
  }
  return value;
}

// CutAsset.fileUrl/thumbnailUrl은 public/uploads/ 아래 실제 파일을 가리키는 경로
// 문자열이다(4K 이미지·오디오는 용량 때문에 localStorage가 아닌 서버 로컬 파일로
// 저장한다). 필드 이름을 일일이 나열하는 대신 episodeData·휴지통 트리를 통째로
// 훑어 "/uploads/"로 시작하는 문자열을 전부 모은다 — 나중에 새 필드가 추가돼도
// 자동으로 백업 대상에 포함된다.
function collectUploadPaths(value: unknown, into: Set<string>) {
  if (typeof value === "string" && value.includes("/uploads/")) {
    into.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectUploadPaths(item, into));
  } else if (value && typeof value === "object" && !(value instanceof Blob)) {
    // 휴지통 payload에 이미 Blob으로 담긴 값(갤러리 원본 등)은 대상이 아니다.
    Object.values(value).forEach((item) => collectUploadPaths(item, into));
  }
}

// Vercel Blob 마이그레이션 이전에는 fileUrl이 "/uploads/..." 형태의 상대 경로였지만
// 지금은 "https://<store>.public.blob.vercel-storage.com/uploads/..." 형태의 완전한
// URL이다. zip 안에는 경로 부분만 "uploads/..."로 저장해야 restoreUploadedFiles의
// /^uploads\//  매칭과 맞아떨어진다 — 도메인을 무시하고 pathname만 뽑아낸다.
function toZipUploadPath(uploadPath: string): string {
  try {
    return new URL(uploadPath).pathname.replace(/^\/+/, "");
  } catch {
    return uploadPath.replace(/^\/+/, "");
  }
}

// 병합 복원 시 회차 id가 새로 매겨지면 그 회차 소유 업로드 파일의 경로도 새 id
// 아래로 옮겨야 CutAsset.fileUrl 참조가 깨지지 않는다. 휴지통이 참조하는 경로처럼
// episodeIdMap에 없는 id는 그대로 둔다(휴지통은 병합 시에도 원본 id를 유지한다).
// fileUrl은 완전한 Blob URL("https://<store>/uploads/...")일 수도, 예전 형식의
// 상대 경로("/uploads/...")일 수도 있어 둘 다 처리한다 — URL이면 origin은 그대로
// 두고 pathname의 episodeId 부분만 바꿔치기한다.
function remapUploadPath(originalPath: string, episodeIdMap: Map<string, string>): string {
  let url: URL | null = null;
  try {
    url = new URL(originalPath);
  } catch {
    url = null;
  }
  const pathname = url ? url.pathname : originalPath;
  const match = pathname.match(/^\/uploads\/([^/]+)\//);
  if (!match) return originalPath;
  const newEpisodeId = episodeIdMap.get(match[1]);
  if (!newEpisodeId) return originalPath;
  const newPathname = pathname.replace(`/uploads/${match[1]}/`, `/uploads/${newEpisodeId}/`);
  if (url) {
    url.pathname = newPathname;
    return url.toString();
  }
  return newPathname;
}

async function restoreUploadedFiles(
  zip: JSZip,
  remapPath: (originalPath: string) => string,
  onProgress?: ProgressCallback
) {
  const entries = zip.file(/^uploads\//);
  const total = entries.length;
  onProgress?.("로컬 이미지/오디오 복원 중", total === 0 ? 100 : 0);
  let done = 0;

  for (const entry of entries) {
    const originalPath = `/${entry.name}`;
    const targetPath = remapPath(originalPath);
    try {
      const blob = await entry.async("blob");
      await restoreAssetFile(targetPath, blob);
    } catch {
      // 개별 파일 복원 실패는 건너뛰고 계속 진행 — 나머지 데이터 복원은 이어간다.
    }
    done += 1;
    onProgress?.("로컬 이미지/오디오 복원 중", Math.round((done / total) * 100));
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function backupFileName(date = new Date()): string {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`;
  return `movingtoon_backup_${stamp}.zip`;
}

/** localStorage + IndexedDB에 흩어진 전체 데이터를 모아 백업 zip Blob을 만든다. */
export async function exportBackup(
  onProgress?: ProgressCallback,
  includeTrash = false
): Promise<Blob> {
  onProgress?.("데이터 수집 중", 0);

  const { series, episodes, characters } = await fetchBootstrap();

  const episodeData: Record<string, EpisodeBackupData> = {};
  for (const episode of episodes) {
    episodeData[episode.id] = await fetchEpisodeAux(episode.id);
  }

  const zip = new JSZip();
  const galleryIndex: GalleryIndexEntry[] = [];

  const perCharacterImages = await Promise.all(
    characters.map(async (character) => ({
      characterId: character.id,
      images: await listGalleryImages(character.id),
    }))
  );
  const totalImages = perCharacterImages.reduce((sum, entry) => sum + entry.images.length, 0);

  onProgress?.("참조 이미지 수집 중", totalImages === 0 ? 100 : 0);
  let imagesDone = 0;

  for (const { characterId, images } of perCharacterImages) {
    for (const image of images) {
      const blob = await getOriginalImageBlob(image.fileUrl);
      if (blob) {
        const zipPath = `gallery/${characterId}/${image.id}__${image.fileName}`;
        zip.file(zipPath, blob);
        galleryIndex.push({ characterId, fileName: image.fileName, zipPath });
      }
      imagesDone += 1;
      onProgress?.("참조 이미지 수집 중", Math.round((imagesDone / totalImages) * 100));
    }
  }

  const data: BackupData = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    series,
    episodes,
    characters,
    episodeData,
    galleryIndex,
  };

  const trashEntries = includeTrash ? await listTrashEntries() : [];

  // 4K 이미지·오디오는 localStorage가 아닌 public/uploads/ 아래 실제 파일로 저장돼
  // 있어서, 지금까지는 CutAsset.fileUrl 경로 "문자열"만 백업에 담기고 파일 자체는
  // 빠져 있었다 — 다른 PC에서 복원하면 그 경로가 가리키는 파일이 없어 깨진다.
  // episodeData(+ 포함했다면 휴지통)를 훑어 모은 경로의 실제 파일을 함께 담는다.
  const uploadPaths = new Set<string>();
  collectUploadPaths(episodeData, uploadPaths);
  if (includeTrash) collectUploadPaths(trashEntries, uploadPaths);

  onProgress?.("로컬 이미지/오디오 수집 중", uploadPaths.size === 0 ? 100 : 0);
  let uploadsDone = 0;
  for (const uploadPath of uploadPaths) {
    try {
      const res = await fetch(uploadPath);
      if (res.ok) {
        zip.file(toZipUploadPath(uploadPath), await res.blob());
      }
    } catch {
      // 개별 파일 수집 실패는 건너뛰고 계속 진행 — 이미 지워졌을 수 있다.
    }
    uploadsDone += 1;
    onProgress?.(
      "로컬 이미지/오디오 수집 중",
      Math.round((uploadsDone / uploadPaths.size) * 100)
    );
  }

  if (includeTrash) {
    onProgress?.("휴지통 데이터 수집 중", 0);
    const counter = { n: 0 };
    data.trash = trashEntries.map((entry) =>
      extractBlobsForZip(entry, zip, `trash/${entry.id}`, counter)
    );
    onProgress?.("휴지통 데이터 수집 중", 100);
  }

  zip.file("data.json", JSON.stringify(data));

  onProgress?.("압축 중", 0);
  const blob = await zip.generateAsync({ type: "blob" }, (metadata) => {
    onProgress?.("압축 중", Math.round(metadata.percent));
  });
  onProgress?.("완료", 100);
  return blob;
}

export interface BackupReadResult {
  valid: boolean;
  error?: string;
  data?: BackupData;
  zip?: JSZip;
}

/** 업로드된 파일이 유효한 백업 zip인지 확인하고 내용을 파싱한다. */
export async function readBackupFile(file: File): Promise<BackupReadResult> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return { valid: false, error: "ZIP 형식의 백업 파일만 불러올 수 있습니다." };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { valid: false, error: "손상되었거나 올바르지 않은 ZIP 파일입니다." };
  }

  const dataEntry = zip.file("data.json");
  if (!dataEntry) {
    return { valid: false, error: "백업 파일에서 data.json을 찾을 수 없습니다." };
  }

  let data: BackupData;
  try {
    const text = await dataEntry.async("string");
    data = JSON.parse(text) as BackupData;
  } catch {
    return { valid: false, error: "백업 데이터 형식이 올바르지 않습니다." };
  }

  const looksValid =
    data &&
    typeof data === "object" &&
    Array.isArray(data.series) &&
    Array.isArray(data.episodes) &&
    Array.isArray(data.characters) &&
    typeof data.episodeData === "object" &&
    Array.isArray(data.galleryIndex);

  if (!looksValid) {
    return { valid: false, error: "백업 데이터 구조가 올바르지 않습니다." };
  }

  return { valid: true, data, zip };
}

async function restoreGalleryImages(
  galleryIndex: GalleryIndexEntry[],
  zip: JSZip,
  resolveCharacterId: (originalCharacterId: string) => string,
  onProgress?: ProgressCallback
) {
  const grouped = new Map<string, GalleryIndexEntry[]>();
  for (const entry of galleryIndex) {
    const list = grouped.get(entry.characterId) ?? [];
    list.push(entry);
    grouped.set(entry.characterId, list);
  }

  const total = galleryIndex.length;
  onProgress?.("참조 이미지 복원 중", total === 0 ? 100 : 0);
  let done = 0;

  for (const [originalCharacterId, entries] of grouped) {
    const targetCharacterId = resolveCharacterId(originalCharacterId);
    const files: File[] = [];

    for (const entry of entries) {
      const zipEntry = zip.file(entry.zipPath);
      if (zipEntry) {
        const blob = await zipEntry.async("blob");
        files.push(new File([blob], entry.fileName, { type: blob.type || "image/jpeg" }));
      }
      done += 1;
      onProgress?.("참조 이미지 복원 중", Math.round((done / total) * 100));
    }

    // addGalleryImages가 파일마다 새 id/순서를 매기므로 원본 메타는 그대로 옮길 필요가 없다.
    const capped = files.slice(0, MAX_GALLERY_IMAGES);
    if (capped.length > 0) {
      await addGalleryImages(targetCharacterId, capped);
    }
  }
}

/** 백업을 복원한다. overwrite는 기존 데이터를 완전히 비우고 백업 내용으로 교체하고,
 *  merge는 시리즈/캐릭터에 새 id를 부여해 기존 데이터 옆에 추가한다. */
export async function importBackup(
  data: BackupData,
  zip: JSZip,
  mode: ImportMode,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.("데이터 준비 중", 0);

  if (mode === "overwrite") {
    const existing = await fetchBootstrap();
    await clearAllGalleryData();

    // 시리즈를 지우면 DB 외래키 CASCADE로 회차/캐릭터까지 함께 지워진다.
    for (const series of existing.series) {
      await fetch(`/api/db/series/${series.id}`, { method: "DELETE" });
    }

    for (const series of data.series) {
      await postJson("/api/db/series", series);
    }
    for (const episode of data.episodes) {
      await postJson("/api/db/episodes", episode);
      const ep = data.episodeData[episode.id];
      // 방금 만든 새 회차 행은 cuts_updated_at/board_updated_at이 항상 기본값 0이다.
      if (ep) {
        await patchJson(`/api/db/episodes/${episode.id}`, {
          ...ep,
          expectedCutsUpdatedAt: 0,
          expectedBoardUpdatedAt: 0,
        });
      }
    }
    for (const character of data.characters) {
      await postJson("/api/db/characters", character);
    }

    await restoreGalleryImages(data.galleryIndex, zip, (id) => id, onProgress);
    // overwrite는 id를 그대로 쓰므로 원래 경로 그대로 복원하면 된다.
    await restoreUploadedFiles(zip, (path) => path, onProgress);
  } else {
    const seriesIdMap = new Map<string, string>();
    const episodeIdMap = new Map<string, string>();
    const characterIdMap = new Map<string, string>();

    const newSeries = data.series.map((series) => {
      const newId = makeId("series");
      seriesIdMap.set(series.id, newId);
      return { ...series, id: newId };
    });

    const newEpisodes = data.episodes.map((episode) => {
      const newId = makeId("ep");
      episodeIdMap.set(episode.id, newId);
      return { ...episode, id: newId, seriesId: seriesIdMap.get(episode.seriesId) ?? episode.seriesId };
    });

    const newCharacters = data.characters.map((character) => {
      const newId = makeId("char");
      characterIdMap.set(character.id, newId);
      return {
        ...character,
        id: newId,
        seriesId: seriesIdMap.get(character.seriesId) ?? character.seriesId,
      };
    });

    for (const series of newSeries) {
      await postJson("/api/db/series", series);
    }
    for (const character of newCharacters) {
      await postJson("/api/db/characters", character);
    }

    for (const episode of newEpisodes) {
      await postJson("/api/db/episodes", episode);
    }
    for (const episode of data.episodes) {
      const ep = data.episodeData[episode.id];
      const newEpisodeId = episodeIdMap.get(episode.id);
      if (!ep || !newEpisodeId) continue;
      // 회차 id가 바뀌므로 그 회차 소유 업로드 파일의 경로(/uploads/<id>/...)도
      // 새 id 아래로 다시 써줘야 fileUrl 참조가 깨지지 않는다.
      const remappedAssets = ep.assets.map((asset) => ({
        ...asset,
        fileUrl: remapUploadPath(asset.fileUrl, episodeIdMap),
        thumbnailUrl: asset.thumbnailUrl
          ? remapUploadPath(asset.thumbnailUrl, episodeIdMap)
          : asset.thumbnailUrl,
      }));
      // 방금 만든 새 회차 행은 cuts_updated_at/board_updated_at이 항상 기본값 0이다.
      await patchJson(`/api/db/episodes/${newEpisodeId}`, {
        cuts: ep.cuts,
        assets: remappedAssets,
        stylePreset: ep.stylePreset,
        board: ep.board,
        expectedCutsUpdatedAt: 0,
        expectedBoardUpdatedAt: 0,
      });
    }

    await restoreGalleryImages(
      data.galleryIndex,
      zip,
      (originalCharacterId) => characterIdMap.get(originalCharacterId) ?? originalCharacterId,
      onProgress
    );
    // 활성 데이터가 참조하는 경로는 새 회차 id로, 휴지통이 참조하는 경로(episodeIdMap에
    // 없는 id)는 원본 그대로 복원된다 — remapUploadPath가 매핑이 없으면 그대로 돌려준다.
    await restoreUploadedFiles(zip, (path) => remapUploadPath(path, episodeIdMap), onProgress);
  }

  if (data.trash && data.trash.length > 0) {
    onProgress?.("휴지통 데이터 복원 중", 0);
    // 병합 모드에서 시리즈/회차/캐릭터 id가 새로 매겨져도 휴지통 항목이 참조하는 id는
    // 원본 그대로 옮긴다 — 병합 직후 그 휴지통 항목을 복원하면 대상을 못 찾을 수 있다는
    // 뜻이지만(드문 경우), 대신 백업에 있던 휴지통 데이터 자체는 그대로 보존된다.
    const hydrated = await Promise.all(
      data.trash.map((entry) => hydrateBlobsFromZip(entry, zip))
    );
    await addTrashEntries(hydrated as TrashEntry[]);
    onProgress?.("휴지통 데이터 복원 중", 100);
  }

  onProgress?.("완료", 100);
}
