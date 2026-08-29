"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Cut } from "@/lib/types";
import { loadEpisodeDraftFromDb, saveEpisodeDraftToDb } from "@/lib/cutsDb";
import { buildSplitImagePrompt } from "@/lib/promptRules";

export type CutInsertPosition = "before" | "after";

// 텍스트 입력/컷 수정처럼 빠르게 연속 발생하는 이벤트마다 디스크에 쓰지 않도록
// 묶어서(debounce) 저장한다. 값 자체는 항상 최신 React state이므로 유실 없이
// 저장 "빈도"만 줄인다 — 탭 종료 등으로 타이머가 미처 돌기 전이면 flush()가
// 즉시 최신 상태를 써서 보완한다.
const SAVE_DEBOUNCE_MS = 300;

interface CutsContextValue {
  cuts: Cut[];
  selectedCutId: string | null;
  setSelectedCutId: (id: string | null) => void;
  setCuts: (cuts: Cut[]) => void;
  updateCut: (id: string, patch: Partial<Cut>) => void;
  removeCut: (id: string) => void;
  addCut: (referenceId: string, position: CutInsertPosition) => void;
  selectedCut: Cut | null;
  scriptText: string;
  setScriptText: (text: string) => void;
}

const CutsContext = createContext<CutsContextValue | null>(null);

function cutsStorageKey(episodeId: string) {
  return `movingtoon:${episodeId}:cuts`;
}

function scriptTextStorageKey(episodeId: string) {
  return `movingtoon:${episodeId}:scriptText`;
}

function makeCutId() {
  return `cut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CutsProvider({
  episodeId,
  children,
}: {
  episodeId: string;
  children: React.ReactNode;
}) {
  const [cuts, setCutsState] = useState<Cut[]>([]);
  const [scriptText, setScriptTextState] = useState("");
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // flush()가 (디바운스 타이머와 무관하게) 언제 불려도 항상 최신 값을 쓸 수 있도록
  // 렌더마다 최신 state를 ref에 미러링해 둔다.
  const latestRef = useRef({ cuts, scriptText });
  latestRef.current = { cuts, scriptText };
  const hydratedRef = useRef(false);
  hydratedRef.current = hydrated;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // localStorage는 서버 렌더링 시점에 접근할 수 없어 lazy useState 초기값으로 쓰면
    // SSR과 클라이언트 첫 렌더 결과가 달라져 하이드레이션 불일치가 발생한다.
    let cancelled = false;

    (async () => {
      let restoredCuts: Cut[] = [];
      let restoredScriptText = "";
      try {
        // IndexedDB가 항상 완전한 데이터(생성된 이미지 imageUrl 포함)를 갖고 있으므로
        // 우선 시도한다 — localStorage는 용량 때문에 imageUrl을 뺀 경량 버전만 담는다.
        const fromDb = await loadEpisodeDraftFromDb(episodeId);
        if (fromDb && (fromDb.cuts.length > 0 || fromDb.scriptText)) {
          restoredCuts = fromDb.cuts;
          restoredScriptText = fromDb.scriptText;
        } else {
          // IndexedDB가 비어 있으면(이 기능 도입 이전 데이터, 사생활 보호 모드 등)
          // localStorage에서 복구한다.
          const rawCuts = window.localStorage.getItem(cutsStorageKey(episodeId));
          const rawScriptText = window.localStorage.getItem(scriptTextStorageKey(episodeId));
          if (rawCuts) restoredCuts = JSON.parse(rawCuts) as Cut[];
          if (rawScriptText !== null) restoredScriptText = rawScriptText;
        }
      } catch {
        // 저장된 데이터가 없거나 손상된 경우 빈 상태로 시작
      }

      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCutsState(restoredCuts);
      setScriptTextState(restoredScriptText);
      setSelectedCutId(restoredCuts[0]?.id ?? null);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  const flush = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // 하이드레이션이 끝나기 전(=아직 저장된 값을 읽어오기 전) state는 빈 초기값이라,
    // 이 시점에 flush가 실행되면 실제 저장된 데이터를 빈 값으로 덮어쓰게 된다.
    if (!hydratedRef.current) return;

    const { cuts: latestCuts, scriptText: latestScriptText } = latestRef.current;
    try {
      // 생성된 이미지(imageUrl, base64 data URL)는 용량이 커 localStorage 5~10MB
      // 한도를 금방 넘길 수 있다 — 빼고 저장하고, 전체 값은 IndexedDB에만 담는다.
      const lightweightCuts = latestCuts.map((cut) => {
        if (!cut.imageUrl) return cut;
        const clone: Cut = { ...cut };
        delete clone.imageUrl;
        return clone;
      });
      window.localStorage.setItem(cutsStorageKey(episodeId), JSON.stringify(lightweightCuts));
      window.localStorage.setItem(scriptTextStorageKey(episodeId), latestScriptText);
    } catch {
      // 저장 공간 초과 등 localStorage 쓰기 실패는 무시하고 IndexedDB 저장으로 보완한다.
    }
    void saveEpisodeDraftToDb(episodeId, { cuts: latestCuts, scriptText: latestScriptText });
  }, [episodeId]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [cuts, scriptText, hydrated, flush]);

  useEffect(() => {
    // 브라우저/탭을 닫을 때 디바운스 타이머가 아직 안 돌았어도 최신 상태를 즉시 저장한다.
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      // 다른 회차로 이동하거나 컴포넌트가 사라질 때도 대기 중인 저장을 즉시 반영한다.
      flush();
    };
  }, [flush]);

  const setCuts = useCallback((next: Cut[]) => {
    setCutsState(next);
    setSelectedCutId(next[0]?.id ?? null);
  }, []);

  const setScriptText = useCallback((text: string) => {
    setScriptTextState(text);
  }, []);

  const updateCut = useCallback((id: string, patch: Partial<Cut>) => {
    setCutsState((prev) =>
      prev.map((cut) => (cut.id === id ? { ...cut, ...patch } : cut))
    );
  }, []);

  const removeCut = useCallback((id: string) => {
    setCutsState((prev) => {
      const removedIndex = prev.findIndex((cut) => cut.id === id);
      const next = prev.filter((cut) => cut.id !== id);
      setSelectedCutId((prevSelected) => {
        if (prevSelected !== id) return prevSelected;
        if (next.length === 0) return null;
        // 삭제된 컷 다음 컷으로 자동 이동, 마지막 컷이었다면 새로운 마지막 컷으로 이동
        const nextIndex = Math.min(removedIndex, next.length - 1);
        return next[nextIndex]?.id ?? null;
      });
      return next;
    });
  }, []);

  const addCut = useCallback((referenceId: string, position: CutInsertPosition) => {
    setCutsState((prev) => {
      const refIndex = prev.findIndex((cut) => cut.id === referenceId);
      if (refIndex === -1) return prev;

      const reference = prev[refIndex];
      const blankCutInput = {
        scriptText: "",
        dialogue: "",
        emotionTag: "",
        cameraAngle: "medium shot",
        expression: "",
        directionNote: "",
      };
      const newCut: Cut = {
        id: makeCutId(),
        cutNumber: 0, // 삽입 후 전체 재정렬되므로 임시값
        sceneNumber: reference.sceneNumber,
        ...blankCutInput,
        status: "SCRIPT_DONE",
        // 빈 컷이라도 항상 완성된 형태의 기본 프롬프트가 채워져 있어야 한다.
        imagePrompt: buildSplitImagePrompt(blankCutInput),
      };

      const insertAt = position === "after" ? refIndex + 1 : refIndex;
      const inserted = [...prev.slice(0, insertAt), newCut, ...prev.slice(insertAt)];
      const renumbered = inserted.map((cut, index) => ({ ...cut, cutNumber: index + 1 }));

      setSelectedCutId(newCut.id);
      return renumbered;
    });
  }, []);

  const selectedCut = useMemo(
    () => cuts.find((cut) => cut.id === selectedCutId) ?? null,
    [cuts, selectedCutId]
  );

  const value: CutsContextValue = {
    cuts,
    selectedCutId,
    setSelectedCutId,
    setCuts,
    updateCut,
    removeCut,
    addCut,
    selectedCut,
    scriptText,
    setScriptText,
  };

  return <CutsContext.Provider value={value}>{children}</CutsContext.Provider>;
}

export function useCuts() {
  const ctx = useContext(CutsContext);
  if (!ctx) throw new Error("useCuts must be used within CutsProvider");
  return ctx;
}
