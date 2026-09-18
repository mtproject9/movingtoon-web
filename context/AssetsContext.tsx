"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AssetType, CutAsset } from "@/lib/types";

// 회차 저장 주기마다 서버로 쓰는 대신 묶어서(debounce) 저장한다. CutsContext와
// 동일한 값을 쓴다.
const SAVE_DEBOUNCE_MS = 500;

interface AssetsContextValue {
  assets: CutAsset[];
  addAsset: (
    cutId: string | undefined,
    type: AssetType,
    fileUrl: string,
    fileName: string,
    thumbnailUrl?: string,
    // 컷에 연결된 이미지 자산이면 넘긴다(예: "Cut_01") — 갤러리/보드 어디서 봐도
    // 어느 컷의 몇 번째 버전인지 바로 보이도록 파일명을 "Cut_01_1"처럼 덮어쓴다.
    cutLabel?: string
  ) => CutAsset;
  removeAsset: (id: string) => void;
  toggleAssetLock: (id: string) => void;
  getAssetsForCut: (cutId: string, type: AssetType) => CutAsset[];
}

const AssetsContext = createContext<AssetsContextValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AssetsProvider({
  episodeId,
  children,
}: {
  episodeId: string;
  children: React.ReactNode;
}) {
  const [assets, setAssets] = useState<CutAsset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // CutsContext와 동일한 이유로 필요하다 — episodeId가 바뀌는 그 순간의 커밋에서,
  // "assets가 바뀌면 저장" 이펙트도 의존성 배열에 episodeId가 들어있어 함께
  // 다시 실행된다. 그때 이 이펙트가 읽는 hydrated/assets는 아직 새 값으로
  // 갱신되기 전(직전 회차의 값 그대로)인데, save만 새 episodeId로 재생성돼 있으면
  // "새 회차 URL로 옛 회차의 assets를 그대로 저장"해버려 새 회차 데이터를
  // 덮어쓰는 사고가 난다. episodeId/최신 상태를 ref로 미러링해 flush를 완전히
  // 안정된 함수로 만들고, 회차를 떠나기 직전에만(이 effect의 클린업) 그 회차로
  // 저장하도록 고정한다.
  const latestRef = useRef({ assets });
  const hydratedRef = useRef(false);
  const episodeIdRef = useRef(episodeId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    latestRef.current = { assets };
    hydratedRef.current = hydrated;
    episodeIdRef.current = episodeId;
  });

  const flush = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!hydratedRef.current || !dirtyRef.current) return;

    const targetEpisodeId = episodeIdRef.current;
    const { assets: latestAssets } = latestRef.current;

    void fetch(`/api/db/episodes/${targetEpisodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assets: latestAssets }),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(false);
    dirtyRef.current = false;

    (async () => {
      let restored: CutAsset[] = [];
      try {
        const res = await fetch(`/api/db/episodes/${episodeId}`);
        if (res.ok) {
          const data = (await res.json()) as { assets: CutAsset[] };
          restored = data.assets ?? [];
        }
      } catch {
        // 네트워크 실패 시 빈 상태로 시작
      }
      if (cancelled) return;

      setAssets(restored);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
      // 다음 회차로 넘어가거나 언마운트되기 직전, 아직 저장 안 된 변경사항을
      // 지금 회차(episodeIdRef가 아직 가리키는 옛 값) 앞으로 즉시 저장한다.
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
  }, [assets, hydrated, flush]);

  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
    };
  }, [flush]);

  const addAsset = useCallback(
    (
      cutId: string | undefined,
      type: AssetType,
      fileUrl: string,
      fileName: string,
      thumbnailUrl?: string,
      cutLabel?: string
    ) => {
      let created!: CutAsset;
      dirtyRef.current = true;
      setAssets((prev) => {
        const existingVersions = prev.filter(
          (asset) => asset.cutId === cutId && asset.type === type
        ).length;
        const version = existingVersions + 1;
        const extensionMatch = fileName.match(/\.[a-zA-Z0-9]+$/);
        const extension = extensionMatch ? extensionMatch[0] : ".png";
        created = {
          id: makeId("asset"),
          cutId,
          type,
          fileUrl,
          thumbnailUrl,
          fileName: cutLabel ? `${cutLabel}_${version}${extension}` : fileName,
          version,
          uploadedAt: Date.now(),
        };
        return [...prev, created];
      });
      return created;
    },
    []
  );

  const removeAsset = useCallback((id: string) => {
    dirtyRef.current = true;
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  }, []);

  const toggleAssetLock = useCallback((id: string) => {
    dirtyRef.current = true;
    setAssets((prev) =>
      prev.map((asset) => (asset.id === id ? { ...asset, locked: !asset.locked } : asset))
    );
  }, []);

  const getAssetsForCut = useCallback(
    (cutId: string, type: AssetType) =>
      assets.filter((asset) => asset.cutId === cutId && asset.type === type),
    [assets]
  );

  const value: AssetsContextValue = {
    assets,
    addAsset,
    removeAsset,
    toggleAssetLock,
    getAssetsForCut,
  };

  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
}

export function useAssets() {
  const ctx = useContext(AssetsContext);
  if (!ctx) throw new Error("useAssets must be used within AssetsProvider");
  return ctx;
}
