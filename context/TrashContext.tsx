"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type {
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

const SERIES_KEY = "movingtoon:series";
const EPISODES_KEY = "movingtoon:episodes";
const CHARACTERS_KEY = "movingtoon:characters";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function cutsKey(episodeId: string) {
  return `movingtoon:${episodeId}:cuts`;
}
function assetsKey(episodeId: string) {
  return `movingtoon:${episodeId}:assets`;
}
function stylePresetKey(episodeId: string) {
  return `movingtoon:${episodeId}:stylePreset`;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// 컷 에셋(4K 이미지/음성)은 IndexedDB가 아닌 서버 로컬 폴더(public/uploads)에 저장되므로
// 영구 삭제 시 파일도 함께 정리해야 디스크에 고아 파일이 남지 않는다.
function collectAssetPaths(entry: TrashEntry): (string | undefined)[] {
  switch (entry.itemType) {
    case "cutAsset": {
      const { asset } = entry.payload as CutAssetTrashPayload;
      return [asset.fileUrl, asset.thumbnailUrl];
    }
    case "episode": {
      const { assets } = entry.payload as EpisodeTrashPayload;
      return assets.flatMap((asset) => [asset.fileUrl, asset.thumbnailUrl]);
    }
    case "series": {
      const { episodes } = entry.payload as SeriesTrashPayload;
      return episodes.flatMap((ep) => ep.assets.flatMap((asset) => [asset.fileUrl, asset.thumbnailUrl]));
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

function collectEpisodeAuxData(episodeId: string) {
  return {
    cuts: readJson<Cut[]>(cutsKey(episodeId), []),
    assets: readJson<CutAsset[]>(assetsKey(episodeId), []),
    stylePreset: window.localStorage.getItem(stylePresetKey(episodeId)),
  };
}

interface TrashContextValue {
  entries: TrashEntry[];
  hydrated: boolean;
  refresh: () => Promise<void>;

  captureCut: (episodeId: string, cut: Cut) => Promise<void>;
  captureCutAsset: (episodeId: string, asset: CutAsset) => Promise<void>;
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

      const cuts = readJson<Cut[]>(cutsKey(episodeId), []);
      writeJson(
        cutsKey(episodeId),
        cuts.filter((c) => c.id !== cut.id)
      );

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

      const assets = readJson<CutAsset[]>(assetsKey(episodeId), []);
      writeJson(
        assetsKey(episodeId),
        assets.filter((a) => a.id !== asset.id)
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
      const aux = collectEpisodeAuxData(episode.id);
      const payload: EpisodeTrashPayload = { episode, ...aux };
      await addTrashEntry({
        id: makeId("trash"),
        itemType: "episode",
        label: episode.title || `${episode.episodeNumber}화`,
        deletedAt: Date.now(),
        originPath: { seriesId: episode.seriesId },
        payload,
      });

      window.localStorage.removeItem(cutsKey(episode.id));
      window.localStorage.removeItem(assetsKey(episode.id));
      window.localStorage.removeItem(stylePresetKey(episode.id));

      await refresh();
    },
    [refresh]
  );

  const captureSeries = useCallback(
    async (series: Series, episodes: Episode[], characters: Character[]) => {
      const episodePayloads: EpisodeTrashPayload[] = episodes.map((episode) => ({
        episode,
        ...collectEpisodeAuxData(episode.id),
      }));

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

      for (const episode of episodes) {
        window.localStorage.removeItem(cutsKey(episode.id));
        window.localStorage.removeItem(assetsKey(episode.id));
        window.localStorage.removeItem(stylePresetKey(episode.id));
      }
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
        const cuts = readJson<Cut[]>(cutsKey(episodeId), []);
        if (!cuts.some((c) => c.id === cut.id)) {
          writeJson(cutsKey(episodeId), [...cuts, cut]);
        }
        break;
      }
      case "cutAsset": {
        const { asset } = entry.payload as CutAssetTrashPayload;
        const episodeId = entry.originPath.episodeId;
        const assets = readJson<CutAsset[]>(assetsKey(episodeId), []);
        if (!assets.some((a) => a.id === asset.id)) {
          writeJson(assetsKey(episodeId), [...assets, asset]);
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
        const characters = readJson<Character[]>(CHARACTERS_KEY, []);
        if (!characters.some((c) => c.id === character.id)) {
          writeJson(CHARACTERS_KEY, [...characters, character]);
        }
        for (const image of galleryImages) {
          await restoreGalleryImage(image.meta, image.originalBlob);
        }
        break;
      }
      case "episode": {
        const { episode, cuts, assets, stylePreset } = entry.payload as EpisodeTrashPayload;
        const episodes = readJson<Episode[]>(EPISODES_KEY, []);
        if (!episodes.some((e) => e.id === episode.id)) {
          writeJson(EPISODES_KEY, [...episodes, episode]);
        }
        writeJson(cutsKey(episode.id), cuts);
        writeJson(assetsKey(episode.id), assets);
        if (stylePreset) window.localStorage.setItem(stylePresetKey(episode.id), stylePreset);
        break;
      }
      case "series": {
        const { series, episodes: episodePayloads, characters: characterPayloads } =
          entry.payload as SeriesTrashPayload;

        const seriesList = readJson<Series[]>(SERIES_KEY, []);
        if (!seriesList.some((s) => s.id === series.id)) {
          writeJson(SERIES_KEY, [...seriesList, series]);
        }

        const episodesList = readJson<Episode[]>(EPISODES_KEY, []);
        const newEpisodes = episodePayloads
          .map((ep) => ep.episode)
          .filter((episode) => !episodesList.some((e) => e.id === episode.id));
        writeJson(EPISODES_KEY, [...episodesList, ...newEpisodes]);

        for (const ep of episodePayloads) {
          writeJson(cutsKey(ep.episode.id), ep.cuts);
          writeJson(assetsKey(ep.episode.id), ep.assets);
          if (ep.stylePreset) window.localStorage.setItem(stylePresetKey(ep.episode.id), ep.stylePreset);
        }

        const charactersList = readJson<Character[]>(CHARACTERS_KEY, []);
        const newCharacters = characterPayloads
          .map((cp) => cp.character)
          .filter((character) => !charactersList.some((c) => c.id === character.id));
        writeJson(CHARACTERS_KEY, [...charactersList, ...newCharacters]);

        for (const cp of characterPayloads) {
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
    captureCutAsset,
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
