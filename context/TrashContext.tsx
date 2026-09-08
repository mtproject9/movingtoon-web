"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type {
  BoardImage,
  BoardImageTrashPayload,
  Character,
  CharacterTrashPayload,
  Cut,
  CutAsset,
  CutAssetTrashPayload,
  CutTrashPayload,
  Episode,
  EpisodeTrashPayload,
  GalleryImageMeta,
  GalleryImageTrashPayload,
  GalleryImageTrashRecord,
  Series,
  SeriesTrashPayload,
  TrashEntry,
  TrashItemType,
} from "@/lib/types";
import {
  addTrashEntries,
  addTrashEntry,
  clearTrashEntries,
  listTrashEntries,
  removeTrashEntries,
} from "@/lib/trashDb";
import {
  deleteGalleryImage,
  deleteGalleryImagesForCharacter,
  getOriginalImageBlob,
  listGalleryImages,
  restoreGalleryImage,
} from "@/lib/galleryDb";
import { deleteUploadedFiles } from "@/lib/assetUpload";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface EpisodeAux {
  cuts: Cut[];
  assets: CutAsset[];
  stylePreset: string | null;
  board: BoardImage[];
}

interface EpisodeAuxWithVersion extends EpisodeAux {
  // cuts/board를 함께 저장할 때 서버가 "그 사이 다른 곳에서 먼저 저장한 게 없는지"
  // 대조하는 값 — 휴지통/백업처럼 사용자가 명시적으로 요청한 복원 작업도 이
  // 값을 넘겨야 최신 버전 위에 정확히 반영된다. 진행 보드는 원고 분할 화면과
  // 별개 화면이라 버전도 따로 관리한다.
  cutsUpdatedAt: number;
  boardUpdatedAt: number;
}

// 회차의 cuts/assets/stylePreset/board는 이제 서버(episodes 테이블 컬럼)에 있으므로
// 휴지통 캡처/복원 시 localStorage 대신 이 API를 거쳐 읽고 쓴다.
async function fetchEpisodeAux(episodeId: string): Promise<EpisodeAuxWithVersion> {
  try {
    const res = await fetch(`/api/db/episodes/${episodeId}`);
    if (!res.ok) return { cuts: [], assets: [], stylePreset: null, board: [], cutsUpdatedAt: 0, boardUpdatedAt: 0 };
    const data = (await res.json()) as EpisodeAuxWithVersion;
    return {
      cuts: data.cuts ?? [],
      assets: data.assets ?? [],
      stylePreset: data.stylePreset ?? null,
      board: data.board ?? [],
      cutsUpdatedAt: data.cutsUpdatedAt ?? 0,
      boardUpdatedAt: data.boardUpdatedAt ?? 0,
    };
  } catch {
    return { cuts: [], assets: [], stylePreset: null, board: [], cutsUpdatedAt: 0, boardUpdatedAt: 0 };
  }
}

async function patchEpisodeAux(
  episodeId: string,
  patch: Partial<Pick<EpisodeAux, "cuts" | "assets" | "stylePreset">>,
  expectedCutsUpdatedAt: number
): Promise<void> {
  await fetch(`/api/db/episodes/${episodeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...patch, expectedCutsUpdatedAt }),
  });
}

async function patchEpisodeBoard(
  episodeId: string,
  board: BoardImage[],
  expectedBoardUpdatedAt: number
): Promise<void> {
  await fetch(`/api/db/episodes/${episodeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board, expectedBoardUpdatedAt }),
  });
}

async function createSeriesRow(series: Series): Promise<void> {
  await fetch("/api/db/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(series),
  });
}

async function createEpisodeRow(episode: Episode, aux: EpisodeAux): Promise<void> {
  await fetch("/api/db/episodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(episode),
  });
  // 방금 POST로 만든 새 행은 cuts_updated_at/board_updated_at이 항상 기본값 0이다.
  await patchEpisodeAux(episode.id, aux, 0);
  await patchEpisodeBoard(episode.id, aux.board, 0);
}

async function createCharacterRow(character: Character): Promise<void> {
  await fetch("/api/db/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(character),
  });
}

// 컷 에셋(4K 이미지/음성)은 서버 로컬 폴더가 아닌 Vercel Blob에 저장되므로
// 영구 삭제 시 파일도 함께 정리해야 스토리지에 고아 파일이 남지 않는다.
function collectAssetPaths(entry: TrashEntry): (string | undefined)[] {
  switch (entry.itemType) {
    case "cutAsset": {
      const { asset } = entry.payload as CutAssetTrashPayload;
      return [asset.fileUrl, asset.thumbnailUrl];
    }
    case "boardImage": {
      const { image } = entry.payload as BoardImageTrashPayload;
      return [image.fileUrl, image.thumbnailUrl];
    }
    case "episode": {
      const { assets, board } = entry.payload as EpisodeTrashPayload;
      return [
        ...assets.flatMap((asset) => [asset.fileUrl, asset.thumbnailUrl]),
        ...board.flatMap((image) => [image.fileUrl, image.thumbnailUrl]),
      ];
    }
    case "series": {
      const { episodes } = entry.payload as SeriesTrashPayload;
      return episodes.flatMap((ep) => [
        ...ep.assets.flatMap((asset) => [asset.fileUrl, asset.thumbnailUrl]),
        ...ep.board.flatMap((image) => [image.fileUrl, image.thumbnailUrl]),
      ]);
    }
    default:
      return [];
  }
}

async function collectCharacterGalleryImages(characterId: string): Promise<GalleryImageTrashRecord[]> {
  const metas = await listGalleryImages(characterId);
  const records: GalleryImageTrashRecord[] = [];
  for (const meta of metas) {
    const originalBlob = await getOriginalImageBlob(meta.id);
    if (originalBlob) records.push({ meta, originalBlob });
  }
  return records;
}

interface TrashContextValue {
  entries: TrashEntry[];
  hydrated: boolean;
  refresh: () => Promise<void>;

  captureCut: (episodeId: string, cut: Cut) => Promise<void>;
  captureCutsSnapshot: (episodeId: string, cuts: Cut[]) => Promise<void>;
  captureCutAsset: (episodeId: string, asset: CutAsset) => Promise<void>;
  captureBoardImage: (episodeId: string, image: BoardImage) => Promise<void>;
  captureGalleryImages: (images: GalleryImageMeta[]) => Promise<void>;
  captureCharacter: (character: Character) => Promise<void>;
  captureEpisode: (episode: Episode) => Promise<void>;
  captureSeries: (series: Series, episodes: Episode[], characters: Character[]) => Promise<void>;

  restoreEntries: (ids: string[]) => Promise<void>;
  permanentlyDeleteEntries: (ids: string[]) => Promise<void>;
  emptyTrash: () => Promise<void>;
}

const TrashContext = createContext<TrashContextValue | null>(null);

export function TrashProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listTrashEntries();
    setEntries(list);
  }, []);

  useEffect(() => {
    listTrashEntries().then((list) => {
      setEntries(list);
      setHydrated(true);
    });
  }, []);

  const captureCut = useCallback(
    async (episodeId: string, cut: Cut) => {
      const payload: CutTrashPayload = { cut };
      await addTrashEntry({
        id: makeId("trash"),
        itemType: "cut",
        label: cut.dialogue || cut.directionNote || cut.scriptText || `컷 ${cut.cutNumber}`,
        deletedAt: Date.now(),
        originPath: { episodeId },
        payload,
      });

      const aux = await fetchEpisodeAux(episodeId);
      await patchEpisodeAux(
        episodeId,
        { cuts: aux.cuts.filter((c) => c.id !== cut.id) },
        aux.cutsUpdatedAt
      );

      await refresh();
    },
    [refresh]
  );

  // 원고를 다시 분할하면 기존 컷 전체가 새 분할 결과로 통째로 교체된다 — 실수로
  // 눌렀을 때도 되돌릴 수 있도록, 교체되기 직전의 컷들을 서버에서는 지우지 않고
  // (곧 setCuts로 덮어써질 것이므로) 휴지통에만 스냅샷으로 남겨둔다.
  const captureCutsSnapshot = useCallback(
    async (episodeId: string, cuts: Cut[]) => {
      if (cuts.length === 0) return;
      const entries: TrashEntry[] = cuts.map((cut) => ({
        id: makeId("trash"),
        itemType: "cut",
        label: cut.dialogue || cut.directionNote || cut.scriptText || `컷 ${cut.cutNumber}`,
        deletedAt: Date.now(),
        originPath: { episodeId },
        payload: { cut } as CutTrashPayload,
      }));
      await addTrashEntries(entries);
      await refresh();
    },
    [refresh]
  );

  const captureCutAsset = useCallback(
    async (episodeId: string, asset: CutAsset) => {
      const payload: CutAssetTrashPayload = { asset };
      await addTrashEntry({
        id: makeId("trash"),
        itemType: "cutAsset",
        label: asset.fileName,
        deletedAt: Date.now(),
        originPath: { episodeId },
        payload,
      });

      const aux = await fetchEpisodeAux(episodeId);
      await patchEpisodeAux(
        episodeId,
        { assets: aux.assets.filter((a) => a.id !== asset.id) },
        aux.cutsUpdatedAt
      );

      await refresh();
    },
    [refresh]
  );

  const captureBoardImage = useCallback(
    async (episodeId: string, image: BoardImage) => {
      const payload: BoardImageTrashPayload = { image };
      await addTrashEntry({
        id: makeId("trash"),
        itemType: "boardImage",
        label: image.fileName,
        deletedAt: Date.now(),
        originPath: { episodeId },
        payload,
      });

      const aux = await fetchEpisodeAux(episodeId);
      await patchEpisodeBoard(
        episodeId,
        aux.board.filter((b) => b.id !== image.id),
        aux.boardUpdatedAt
      );

      await refresh();
    },
    [refresh]
  );

  const captureGalleryImages = useCallback(
    async (images: GalleryImageMeta[]) => {
      const trashEntries: TrashEntry[] = [];
      for (const meta of images) {
        const originalBlob = await getOriginalImageBlob(meta.id);
        if (!originalBlob) continue;
        const payload: GalleryImageTrashPayload = { image: { meta, originalBlob } };
        trashEntries.push({
          id: makeId("trash"),
          itemType: "galleryImage",
          label: meta.fileName,
          deletedAt: Date.now(),
          originPath: { characterId: meta.characterId },
          payload,
        });
      }
      await addTrashEntries(trashEntries);

      for (const meta of images) {
        await deleteGalleryImage(meta.id);
      }

      await refresh();
    },
    [refresh]
  );

  const captureCharacter = useCallback(
    async (character: Character) => {
      const galleryImages = await collectCharacterGalleryImages(character.id);
      const payload: CharacterTrashPayload = { character, galleryImages };
      await addTrashEntry({
        id: makeId("trash"),
        itemType: "character",
        label: character.name || "캐릭터",
        deletedAt: Date.now(),
        originPath: { seriesId: character.seriesId },
        payload,
      });

      await deleteGalleryImagesForCharacter(character.id);
      await refresh();
    },
    [refresh]
  );

  const captureEpisode = useCallback(
    async (episode: Episode) => {
      const { cutsUpdatedAt: _cutsUpdatedAt, boardUpdatedAt: _boardUpdatedAt, ...aux } =
        await fetchEpisodeAux(episode.id);
      const payload: EpisodeTrashPayload = { episode, ...aux };
      await addTrashEntry({
        id: makeId("trash"),
        itemType: "episode",
        label: episode.title || `${episode.episodeNumber}화`,
        deletedAt: Date.now(),
        originPath: { seriesId: episode.seriesId },
        payload,
      });

      // 회차 행 자체는 removeEpisode(DELETE /api/db/episodes/[id])가 곧 통째로 지우므로
      // 여기서 별도로 cuts/assets를 지울 필요가 없다.
      await refresh();
    },
    [refresh]
  );

  const captureSeries = useCallback(
    async (series: Series, episodes: Episode[], characters: Character[]) => {
      const episodePayloads: EpisodeTrashPayload[] = [];
      for (const episode of episodes) {
        const { cutsUpdatedAt: _cutsUpdatedAt, boardUpdatedAt: _boardUpdatedAt, ...aux } =
          await fetchEpisodeAux(episode.id);
        episodePayloads.push({ episode, ...aux });
      }

      const characterPayloads: CharacterTrashPayload[] = [];
      for (const character of characters) {
        characterPayloads.push({
          character,
          galleryImages: await collectCharacterGalleryImages(character.id),
        });
      }

      const payload: SeriesTrashPayload = {
        series,
        episodes: episodePayloads,
        characters: characterPayloads,
      };
      await addTrashEntry({
        id: makeId("trash"),
        itemType: "series",
        label: series.title || "시리즈",
        deletedAt: Date.now(),
        originPath: {},
        payload,
      });

      // 시리즈 행 삭제(removeSeries)가 DB 외래키 CASCADE로 회차까지 함께 지운다.
      for (const character of characters) {
        await deleteGalleryImagesForCharacter(character.id);
      }

      await refresh();
    },
    [refresh]
  );

  const restoreOne = useCallback(async (entry: TrashEntry) => {
    switch (entry.itemType) {
      case "cut": {
        const { cut } = entry.payload as CutTrashPayload;
        const episodeId = entry.originPath.episodeId;
        const aux = await fetchEpisodeAux(episodeId);
        if (!aux.cuts.some((c) => c.id === cut.id)) {
          await patchEpisodeAux(episodeId, { cuts: [...aux.cuts, cut] }, aux.cutsUpdatedAt);
        }
        break;
      }
      case "cutAsset": {
        const { asset } = entry.payload as CutAssetTrashPayload;
        const episodeId = entry.originPath.episodeId;
        const aux = await fetchEpisodeAux(episodeId);
        if (!aux.assets.some((a) => a.id === asset.id)) {
          await patchEpisodeAux(episodeId, { assets: [...aux.assets, asset] }, aux.cutsUpdatedAt);
        }
        break;
      }
      case "boardImage": {
        const { image } = entry.payload as BoardImageTrashPayload;
        const episodeId = entry.originPath.episodeId;
        const aux = await fetchEpisodeAux(episodeId);
        if (!aux.board.some((b) => b.id === image.id)) {
          await patchEpisodeBoard(episodeId, [...aux.board, image], aux.boardUpdatedAt);
        }
        break;
      }
      case "galleryImage": {
        const { image } = entry.payload as GalleryImageTrashPayload;
        await restoreGalleryImage(image.meta, image.originalBlob);
        break;
      }
      case "character": {
        const { character, galleryImages } = entry.payload as CharacterTrashPayload;
        await createCharacterRow(character);
        for (const image of galleryImages) {
          await restoreGalleryImage(image.meta, image.originalBlob);
        }
        break;
      }
      case "episode": {
        const { episode, cuts, assets, stylePreset, board } = entry.payload as EpisodeTrashPayload;
        await createEpisodeRow(episode, { cuts, assets, stylePreset, board });
        break;
      }
      case "series": {
        const { series, episodes: episodePayloads, characters: characterPayloads } =
          entry.payload as SeriesTrashPayload;

        await createSeriesRow(series);
        for (const ep of episodePayloads) {
          await createEpisodeRow(ep.episode, {
            cuts: ep.cuts,
            assets: ep.assets,
            stylePreset: ep.stylePreset,
            board: ep.board,
          });
        }
        for (const cp of characterPayloads) {
          await createCharacterRow(cp.character);
          for (const image of cp.galleryImages) {
            await restoreGalleryImage(image.meta, image.originalBlob);
          }
        }
        break;
      }
    }
  }, []);

  const restoreEntries = useCallback(
    async (ids: string[]) => {
      const targets = entries.filter((entry) => ids.includes(entry.id));
      for (const entry of targets) {
        await restoreOne(entry);
      }
      await removeTrashEntries(ids);
      await refresh();
    },
    [entries, restoreOne, refresh]
  );

  const permanentlyDeleteEntries = useCallback(
    async (ids: string[]) => {
      const targets = entries.filter((entry) => ids.includes(entry.id));
      await deleteUploadedFiles(targets.flatMap(collectAssetPaths));
      await removeTrashEntries(ids);
      await refresh();
    },
    [entries, refresh]
  );

  const emptyTrash = useCallback(async () => {
    await deleteUploadedFiles(entries.flatMap(collectAssetPaths));
    await clearTrashEntries();
    await refresh();
  }, [entries, refresh]);

  const value: TrashContextValue = {
    entries,
    hydrated,
    refresh,
    captureCut,
    captureCutsSnapshot,
    captureCutAsset,
    captureBoardImage,
    captureGalleryImages,
    captureCharacter,
    captureEpisode,
    captureSeries,
    restoreEntries,
    permanentlyDeleteEntries,
    emptyTrash,
  };

  return <TrashContext.Provider value={value}>{children}</TrashContext.Provider>;
}

export function useTrash() {
  const ctx = useContext(TrashContext);
  if (!ctx) throw new Error("useTrash must be used within TrashProvider");
  return ctx;
}

export type { TrashItemType };
