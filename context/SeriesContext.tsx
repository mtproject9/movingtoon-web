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

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// 서버 저장은 네트워크 요청이라 실패할 수 있다 — 화면은 이미 낙관적으로 갱신된
// 뒤이므로, 실패해도 조용히 무시하지 않고 사용자에게 알려 새로고침 시 유실 가능성을 알린다.
async function postJson(url: string, body: unknown, onError: (msg: string) => void) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) onError("서버에 저장하지 못했습니다. 인터넷 연결을 확인해주세요.");
  } catch {
    onError("서버에 저장하지 못했습니다. 인터넷 연결을 확인해주세요.");
  }
}

async function patchJson(url: string, body: unknown, onError: (msg: string) => void) {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) onError("서버에 저장하지 못했습니다. 인터넷 연결을 확인해주세요.");
  } catch {
    onError("서버에 저장하지 못했습니다. 인터넷 연결을 확인해주세요.");
  }
}

async function deleteJson(url: string, onError: (msg: string) => void) {
  try {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) onError("서버에서 삭제하지 못했습니다. 인터넷 연결을 확인해주세요.");
  } catch {
    onError("서버에서 삭제하지 못했습니다. 인터넷 연결을 확인해주세요.");
  }
}

export function SeriesProvider({ children }: { children: React.ReactNode }) {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const showError = useCallback((msg: string) => setStorageError(msg), []);

  useEffect(() => {
    if (!storageError) return;
    const timer = setTimeout(() => setStorageError(null), 6000);
    return () => clearTimeout(timer);
  }, [storageError]);

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch("/api/db/bootstrap");
      if (!res.ok) throw new Error("bootstrap failed");
      const data = (await res.json()) as {
        series: Series[];
        episodes: Episode[];
        characters: Character[];
      };
      setSeriesList(data.series);
      setEpisodes(data.episodes);
      setCharacters(data.characters);
    } catch {
      showError("서버에서 데이터를 불러오지 못했습니다. 새로고침해주세요.");
    } finally {
      setHydrated(true);
    }
  }, [showError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, [loadAll]);

  const reloadFromStorage = useCallback(() => {
    void loadAll();
  }, [loadAll]);

  const getSeries = useCallback(
    (id: string) => seriesList.find((series) => series.id === id) ?? null,
    [seriesList]
  );

  const addSeries = useCallback(
    (data: Omit<Series, "id" | "createdAt">) => {
      const series: Series = { ...data, id: makeId("series"), createdAt: Date.now() };
      setSeriesList((prev) => [...prev, series]);
      void postJson("/api/db/series", series, showError);
      return series;
    },
    [showError]
  );

  const updateSeries = useCallback(
    (id: string, patch: Partial<Series>) => {
      setSeriesList((prev) =>
        prev.map((series) => (series.id === id ? { ...series, ...patch } : series))
      );
      void patchJson(`/api/db/series/${id}`, patch, showError);
    },
    [showError]
  );

  const removeSeries = useCallback(
    (id: string) => {
      setSeriesList((prev) => prev.filter((series) => series.id !== id));
      setEpisodes((prev) => prev.filter((episode) => episode.seriesId !== id));
      setCharacters((prev) => prev.filter((character) => character.seriesId !== id));
      void deleteJson(`/api/db/series/${id}`, showError);
    },
    [showError]
  );

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
      void postJson("/api/db/episodes", episode, showError);
      return episode;
    },
    [episodes, showError]
  );

  const updateEpisode = useCallback(
    (id: string, patch: Partial<Episode>) => {
      setEpisodes((prev) =>
        prev.map((episode) => (episode.id === id ? { ...episode, ...patch } : episode))
      );
      void patchJson(`/api/db/episodes/${id}`, patch, showError);
    },
    [showError]
  );

  const removeEpisode = useCallback(
    (id: string) => {
      setEpisodes((prev) => prev.filter((episode) => episode.id !== id));
      void deleteJson(`/api/db/episodes/${id}`, showError);
    },
    [showError]
  );

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
      void postJson("/api/db/characters", character, showError);
      return character;
    },
    [showError]
  );

  const updateCharacter = useCallback(
    (id: string, patch: Partial<Character>) => {
      setCharacters((prev) =>
        prev.map((character) => (character.id === id ? { ...character, ...patch } : character))
      );
      void patchJson(`/api/db/characters/${id}`, patch, showError);
    },
    [showError]
  );

  const removeCharacter = useCallback(
    (id: string) => {
      setCharacters((prev) => prev.filter((character) => character.id !== id));
      void deleteJson(`/api/db/characters/${id}`, showError);
    },
    [showError]
  );

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
