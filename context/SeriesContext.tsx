"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AlertCircle, X } from "lucide-react";
import type { Character, Episode, Series } from "@/lib/types";

interface SeriesContextValue {
  hydrated: boolean;
  // 백업 복원처럼 localStorage를 외부에서(React state를 거치지 않고) 직접 바꾼 뒤
  // 새로고침 없이 화면을 최신 상태로 맞추기 위한 강제 재로딩.
  reloadFromStorage: () => void;

  seriesList: Series[];
  getSeries: (id: string) => Series | null;
  addSeries: (data: Omit<Series, "id" | "createdAt">) => Series;
  updateSeries: (id: string, patch: Partial<Series>) => void;
  removeSeries: (id: string) => void;

  episodes: Episode[];
  getEpisode: (id: string) => Episode | null;
  getEpisodesForSeries: (seriesId: string) => Episode[];
  addEpisode: (seriesId: string, title: string) => Episode;
  updateEpisode: (id: string, patch: Partial<Episode>) => void;
  removeEpisode: (id: string) => void;

  characters: Character[];
  getCharactersForSeries: (seriesId: string) => Character[];
  addCharacter: (
    seriesId: string,
    data: Omit<Character, "id" | "seriesId" | "createdAt">
  ) => Character;
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
}

const SeriesContext = createContext<SeriesContextValue | null>(null);

const SERIES_KEY = "movingtoon:series";
const EPISODES_KEY = "movingtoon:episodes";
const CHARACTERS_KEY = "movingtoon:characters";
const MIGRATION_MARKER_KEY = "movingtoon:migrated:demo-v1";

// 멀티 시리즈 구조로 개편되기 전, 단일 데모 프로젝트("demo")로 저장되어 있던
// 로컬 데이터를 최초 1회 "데모 시리즈 / 1화"로 자동 이전한다.
function migrateLegacyDemoData() {
  if (window.localStorage.getItem(MIGRATION_MARKER_KEY)) return;

  const legacyCutsRaw = window.localStorage.getItem("movingtoon:demo:cuts");
  const legacyCharactersRaw = window.localStorage.getItem("movingtoon:demo:characters");
  const legacyAssetsRaw = window.localStorage.getItem("movingtoon:demo:assets");
  const legacyPresetRaw = window.localStorage.getItem("movingtoon:demo:stylePreset");

  const hasLegacyData = legacyCutsRaw || legacyCharactersRaw || legacyAssetsRaw;
  if (!hasLegacyData) {
    window.localStorage.setItem(MIGRATION_MARKER_KEY, "1");
    return;
  }

  const seriesId = makeId("series");
  const episodeId = makeId("ep");

  const series: Series = {
    id: seriesId,
    title: "데모 시리즈",
    logline: "멀티 시리즈 구조로 개편되기 전 기존 데모 프로젝트에서 자동으로 이전되었습니다.",
    thumbnail: "",
    createdAt: Date.now(),
  };
  const episode: Episode = {
    id: episodeId,
    seriesId,
    title: "1화",
    episodeNumber: 1,
    createdAt: Date.now(),
  };

  if (legacyCutsRaw) {
    window.localStorage.setItem(`movingtoon:${episodeId}:cuts`, legacyCutsRaw);
    window.localStorage.removeItem("movingtoon:demo:cuts");
  }
  if (legacyAssetsRaw) {
    window.localStorage.setItem(`movingtoon:${episodeId}:assets`, legacyAssetsRaw);
    window.localStorage.removeItem("movingtoon:demo:assets");
  }
  if (legacyPresetRaw) {
    window.localStorage.setItem(`movingtoon:${episodeId}:stylePreset`, legacyPresetRaw);
    window.localStorage.removeItem("movingtoon:demo:stylePreset");
  }

  let migratedCharacters: Character[] = [];
  if (legacyCharactersRaw) {
    try {
      const parsed = JSON.parse(legacyCharactersRaw) as Omit<Character, "seriesId">[];
      migratedCharacters = parsed.map((character) => ({ ...character, seriesId }));
    } catch {
      // 손상된 데이터는 이전하지 않고 건너뛴다
    }
    window.localStorage.removeItem("movingtoon:demo:characters");
  }

  const existingSeries = readJson<Series[]>(SERIES_KEY, []);
  const existingEpisodes = readJson<Episode[]>(EPISODES_KEY, []);
  const existingCharacters = readJson<Character[]>(CHARACTERS_KEY, []);

  window.localStorage.setItem(SERIES_KEY, JSON.stringify([...existingSeries, series]));
  window.localStorage.setItem(EPISODES_KEY, JSON.stringify([...existingEpisodes, episode]));
  window.localStorage.setItem(
    CHARACTERS_KEY,
    JSON.stringify([...existingCharacters, ...migratedCharacters])
  );
  window.localStorage.setItem(MIGRATION_MARKER_KEY, "1");
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22)
  );
}

export function SeriesProvider({ children }: { children: React.ReactNode }) {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const safeSetItem = useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // 저장 공간이 가득 차 setItem이 실패해도 앱이 멈추지 않도록 막고, 사용자에게
      // 알린다 — 이 시점에는 이미 React state는 갱신된 뒤라 화면상으로는 반영돼
      // 보이지만 새로고침하면 유실될 수 있어 저장 실패를 반드시 알려야 한다.
      setStorageError(
        isQuotaExceededError(error)
          ? "저장 공간이 가득 찼습니다. 썸네일 용량을 줄이거나 사용하지 않는 시리즈를 삭제해주세요."
          : "데이터를 저장하지 못했습니다. 새로고침하면 방금 변경한 내용이 사라질 수 있습니다."
      );
    }
  }, []);

  useEffect(() => {
    if (!storageError) return;
    const timer = setTimeout(() => setStorageError(null), 6000);
    return () => clearTimeout(timer);
  }, [storageError]);

  useEffect(() => {
    migrateLegacyDemoData();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeriesList(readJson<Series[]>(SERIES_KEY, []));
    setEpisodes(readJson<Episode[]>(EPISODES_KEY, []));
    setCharacters(readJson<Character[]>(CHARACTERS_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // safeSetItem은 성공 경로에서는 setState를 호출하지 않고, 저장 실패(용량 초과 등)
    // 시에만 사용자 알림용 storageError를 설정한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    safeSetItem(SERIES_KEY, JSON.stringify(seriesList));
  }, [seriesList, hydrated, safeSetItem]);

  useEffect(() => {
    if (!hydrated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    safeSetItem(EPISODES_KEY, JSON.stringify(episodes));
  }, [episodes, hydrated, safeSetItem]);

  useEffect(() => {
    if (!hydrated) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    safeSetItem(CHARACTERS_KEY, JSON.stringify(characters));
  }, [characters, hydrated, safeSetItem]);

  const reloadFromStorage = useCallback(() => {
    setSeriesList(readJson<Series[]>(SERIES_KEY, []));
    setEpisodes(readJson<Episode[]>(EPISODES_KEY, []));
    setCharacters(readJson<Character[]>(CHARACTERS_KEY, []));
  }, []);

  const getSeries = useCallback(
    (id: string) => seriesList.find((series) => series.id === id) ?? null,
    [seriesList]
  );

  const addSeries = useCallback((data: Omit<Series, "id" | "createdAt">) => {
    const series: Series = { ...data, id: makeId("series"), createdAt: Date.now() };
    setSeriesList((prev) => [...prev, series]);
    return series;
  }, []);

  const updateSeries = useCallback((id: string, patch: Partial<Series>) => {
    setSeriesList((prev) =>
      prev.map((series) => (series.id === id ? { ...series, ...patch } : series))
    );
  }, []);

  const removeSeries = useCallback((id: string) => {
    setSeriesList((prev) => prev.filter((series) => series.id !== id));
    setEpisodes((prev) => prev.filter((episode) => episode.seriesId !== id));
    setCharacters((prev) => prev.filter((character) => character.seriesId !== id));
  }, []);

  const getEpisode = useCallback(
    (id: string) => episodes.find((episode) => episode.id === id) ?? null,
    [episodes]
  );

  const getEpisodesForSeries = useCallback(
    (seriesId: string) =>
      episodes
        .filter((episode) => episode.seriesId === seriesId)
        .sort((a, b) => a.episodeNumber - b.episodeNumber),
    [episodes]
  );

  const addEpisode = useCallback(
    (seriesId: string, title: string) => {
      const existingCount = episodes.filter((episode) => episode.seriesId === seriesId).length;
      const episode: Episode = {
        id: makeId("ep"),
        seriesId,
        title: title.trim() || `${existingCount + 1}화`,
        episodeNumber: existingCount + 1,
        createdAt: Date.now(),
      };
      setEpisodes((prev) => [...prev, episode]);
      return episode;
    },
    [episodes]
  );

  const updateEpisode = useCallback((id: string, patch: Partial<Episode>) => {
    setEpisodes((prev) =>
      prev.map((episode) => (episode.id === id ? { ...episode, ...patch } : episode))
    );
  }, []);

  const removeEpisode = useCallback((id: string) => {
    setEpisodes((prev) => prev.filter((episode) => episode.id !== id));
  }, []);

  const getCharactersForSeries = useCallback(
    (seriesId: string) => characters.filter((character) => character.seriesId === seriesId),
    [characters]
  );

  const addCharacter = useCallback(
    (seriesId: string, data: Omit<Character, "id" | "seriesId" | "createdAt">) => {
      const character: Character = {
        ...data,
        id: makeId("char"),
        seriesId,
        createdAt: Date.now(),
      };
      setCharacters((prev) => [...prev, character]);
      return character;
    },
    []
  );

  const updateCharacter = useCallback((id: string, patch: Partial<Character>) => {
    setCharacters((prev) =>
      prev.map((character) => (character.id === id ? { ...character, ...patch } : character))
    );
  }, []);

  const removeCharacter = useCallback((id: string) => {
    setCharacters((prev) => prev.filter((character) => character.id !== id));
  }, []);

  const value: SeriesContextValue = {
    hydrated,
    reloadFromStorage,
    seriesList,
    getSeries,
    addSeries,
    updateSeries,
    removeSeries,
    episodes,
    getEpisode,
    getEpisodesForSeries,
    addEpisode,
    updateEpisode,
    removeEpisode,
    characters,
    getCharactersForSeries,
    addCharacter,
    updateCharacter,
    removeCharacter,
  };

  return (
    <SeriesContext.Provider value={value}>
      {children}
      {storageError && (
        <div className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {storageError}
          <button
            onClick={() => setStorageError(null)}
            className="ml-1 shrink-0 text-white/80 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </SeriesContext.Provider>
  );
}

export function useSeries() {
  const ctx = useContext(SeriesContext);
  if (!ctx) throw new Error("useSeries must be used within SeriesProvider");
  return ctx;
}
