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

export type CutInsertPosition = "before" | "after";

// 텍스트 입력/컷 수정처럼 빠르게 연속 발생하는 이벤트마다 서버에 쓰지 않도록
// 묶어서(debounce) 저장한다. 값 자체는 항상 최신 React state이므로 유실 없이
// 저장 "빈도"만 줄인다 — 탭 종료 등으로 타이머가 미처 돌기 전이면 flush()가
// 즉시 최신 상태를 써서 보완한다.
const SAVE_DEBOUNCE_MS = 500;

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
  stylePresetId: string | null;
  setStylePresetId: (id: string) => void;
  saveError: string | null;
}

const CutsContext = createContext<CutsContextValue | null>(null);

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
  const [stylePresetId, setStylePresetIdState] = useState<string | null>(null);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // flush()가 (디바운스 타이머와 무관하게) 언제 불려도 항상 최신 값을 쓸 수 있도록
  // 렌더마다 최신 state를 ref에 미러링해 둔다.
  const latestRef = useRef({ cuts, scriptText, stylePresetId });
  const hydratedRef = useRef(false);
  // flush를 episodeId에 의존하는 useCallback으로 만들면(과거 방식) 회차를 옮길 때마다
  // flush 함수 자체가 새로 생겨, 그걸 참조하던 별도 effect의 클린업이 "언마운트"가
  // 아니라 "회차 전환"에도 걸려 나오게 된다. 그 클린업과, 다음 회차를 위해 dirtyRef 등을
  // 리셋하는 이 effect의 새 실행이 서로 다른 effect라 순서가 실행 시점에 따라 꼬일 수
  // 있어(리셋이 먼저 반영되면 방금 떠난 회차의 flush가 "편집 없음"으로 오인해 조용히
  // 스킵됨), 결과적으로 빠르게 회차를 넘나들 때 마지막 몇 초의 편집이 저장 안 되고
  // 사라질 위험이 있었다. episodeId를 ref로 옮겨 flush를 완전히 안정된(의존성 없는)
  // 함수로 만들고, "이 회차를 떠나기 전에 저장"은 아예 이 effect 자신의 클린업에서
  // 처리해 같은 effect 안에서 항상 flush(옛 회차) → 리셋(새 회차) 순서가 보장되게 한다.
  const episodeIdRef = useRef(episodeId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 이 탭에서 실제로 뭔가 편집했을 때만 true — 서버에서 막 불러온 값을 그대로
  // 들고 있기만 한 탭이 나중에(예: 오래 열어뒀다 닫을 때) 그 사이 다른 곳에서
  // 저장된 최신 내용을 옛날 값으로 덮어쓰는 사고를 막기 위한 안전장치.
  const dirtyRef = useRef(false);
  // 서버가 마지막으로 확인해 준 cuts 버전 — flush()가 이 값을 함께 보내 "내가
  // 불러온 이후 다른 곳에서 먼저 저장된 게 없는지" 서버가 대조하게 한다.
  const cutsUpdatedAtRef = useRef(0);
  // 서버가 한 번이라도 버전 충돌(다른 곳에서 먼저 저장됨)로 거부하면, 이 탭은
  // 최신 상태가 아니므로 새로고침 전까지 더 이상 저장을 시도하지 않는다.
  const conflictRef = useRef(false);

  useEffect(() => {
    latestRef.current = { cuts, scriptText, stylePresetId };
    hydratedRef.current = hydrated;
    // 다음 커밋의 클린업 단계에서 실행될 flush()가 "떠나는 회차"를 정확히
    // 가리키도록, 이 ref는 항상 setup 단계(클린업 이후)에서만 갱신한다.
    episodeIdRef.current = episodeId;
  });

  // episodeId를 의존성으로 잡지 않는 안정된 함수 — 대신 항상 episodeIdRef.current를
  // 읽는다(위 미러링 effect가 setup 단계에서만 갱신해주므로, 회차 전환 클린업 시점엔
  // 아직 "떠나는" 옛 회차 값 그대로다).
  const flush = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // 하이드레이션이 끝나기 전(=아직 저장된 값을 읽어오기 전) state는 빈 초기값이라,
    // 이 시점에 flush가 실행되면 실제 저장된 데이터를 빈 값으로 덮어쓰게 된다.
    // 이 탭에서 실제 편집이 한 번도 없었다면(불러온 값 그대로) 저장할 이유가 없고,
    // 오히려 그 사이 다른 곳에서 갱신된 최신 데이터를 옛 값으로 덮어쓸 위험만 있다.
    // 이미 버전 충돌이 한 번 확인된 탭이면(다른 곳에서 먼저 저장함) 새로고침 전까지
    // 같은 문제를 반복해서 시도하지 않는다.
    if (!hydratedRef.current || !dirtyRef.current || conflictRef.current) return;

    const targetEpisodeId = episodeIdRef.current;
    const { cuts: latestCuts, scriptText: latestScriptText, stylePresetId: latestPreset } =
      latestRef.current;

    fetch(`/api/db/episodes/${targetEpisodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cuts: latestCuts,
        scriptText: latestScriptText,
        stylePreset: latestPreset,
        expectedCutsUpdatedAt: cutsUpdatedAtRef.current,
      }),
    })
      .then(async (res) => {
        if (res.status === 409) {
          conflictRef.current = true;
          setSaveError(
            "다른 곳에서 먼저 저장되어 이 화면은 최신 상태가 아니에요. 새로고침 후 다시 시도해주세요."
          );
          return;
        }
        if (!res.ok) throw new Error("save failed");
        const body = (await res.json().catch(() => null)) as { cutsUpdatedAt?: number } | null;
        if (typeof body?.cutsUpdatedAt === "number") {
          cutsUpdatedAtRef.current = body.cutsUpdatedAt;
        }
        setSaveError(null);
      })
      .catch(() => {
        setSaveError("저장하지 못했습니다. 인터넷 연결을 확인해주세요.");
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(false);
    dirtyRef.current = false;
    conflictRef.current = false;

    (async () => {
      let restoredCuts: Cut[] = [];
      let restoredScriptText = "";
      let restoredStylePreset: string | null = null;
      try {
        const res = await fetch(`/api/db/episodes/${episodeId}`);
        if (res.ok) {
          const data = (await res.json()) as {
            cuts: Cut[];
            scriptText: string;
            stylePreset: string | null;
            cutsUpdatedAt: number;
          };
          restoredCuts = data.cuts ?? [];
          restoredScriptText = data.scriptText ?? "";
          restoredStylePreset = data.stylePreset ?? null;
          cutsUpdatedAtRef.current = data.cutsUpdatedAt ?? 0;
        }
      } catch {
        // 네트워크 실패 시 빈 상태로 시작 — flush 저장 실패 알림과 별개로 조용히 처리
      }

      if (cancelled) return;

      setCutsState(restoredCuts);
      setScriptTextState(restoredScriptText);
      setStylePresetIdState(restoredStylePreset);
      setSelectedCutId(restoredCuts[0]?.id ?? null);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
      // 이 회차를 떠나기 직전(다른 회차로 이동 또는 언마운트)에 대기 중인 변경사항을
      // 즉시 저장한다. flush가 episodeId에 의존하지 않는 안정된 함수라, 이 클린업이
      // 먼저 실행되고 그 다음에야(같은 커밋의 setup 단계에서) 위 dirtyRef 리셋이
      // 일어나는 순서가 항상 보장된다 — flush(옛 회차)가 리셋보다 늦게 실행되어
      // "편집 없음"으로 오인되는 일이 없다.
      flush();
    };
  }, [episodeId, flush]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [cuts, scriptText, stylePresetId, hydrated, flush]);

  useEffect(() => {
    // 브라우저/탭을 닫을 때 디바운스 타이머가 아직 안 돌았어도 최신 상태를 즉시 저장한다.
    // (회차 전환/언마운트 시 flush는 위 데이터 로딩 effect의 클린업이 담당한다.)
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
    };
  }, [flush]);

  const setCuts = useCallback((next: Cut[]) => {
    dirtyRef.current = true;
    setCutsState(next);
    setSelectedCutId(next[0]?.id ?? null);
  }, []);

  const setScriptText = useCallback((text: string) => {
    dirtyRef.current = true;
    setScriptTextState(text);
  }, []);

  const setStylePresetId = useCallback((id: string) => {
    dirtyRef.current = true;
    setStylePresetIdState(id);
  }, []);

  const updateCut = useCallback((id: string, patch: Partial<Cut>) => {
    dirtyRef.current = true;
    setCutsState((prev) =>
      prev.map((cut) => (cut.id === id ? { ...cut, ...patch } : cut))
    );
  }, []);

  const removeCut = useCallback((id: string) => {
    dirtyRef.current = true;
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
    dirtyRef.current = true;
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
    stylePresetId,
    setStylePresetId,
    saveError,
  };

  return <CutsContext.Provider value={value}>{children}</CutsContext.Provider>;
}

export function useCuts() {
  const ctx = useContext(CutsContext);
  if (!ctx) throw new Error("useCuts must be used within CutsProvider");
  return ctx;
}
