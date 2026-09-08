"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AssetType, CutAsset } from "@/lib/types";

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
  ) => void;
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

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(false);

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
    };
  }, [episodeId]);

  const save = useCallback(
    (next: CutAsset[]) => {
      void fetch(`/api/db/episodes/${episodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: next }),
      });
    },
    [episodeId]
  );

  useEffect(() => {
    if (!hydrated) return;
    save(assets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, hydrated, episodeId]);

  const addAsset = useCallback(
    (
      cutId: string | undefined,
      type: AssetType,
      fileUrl: string,
      fileName: string,
      thumbnailUrl?: string,
      cutLabel?: string
    ) => {
      setAssets((prev) => {
        const existingVersions = prev.filter(
          (asset) => asset.cutId === cutId && asset.type === type
        ).length;
        const version = existingVersions + 1;
        const extensionMatch = fileName.match(/\.[a-zA-Z0-9]+$/);
        const extension = extensionMatch ? extensionMatch[0] : ".png";
        const asset: CutAsset = {
          id: makeId("asset"),
          cutId,
          type,
          fileUrl,
          thumbnailUrl,
          fileName: cutLabel ? `${cutLabel}_${version}${extension}` : fileName,
          version,
          uploadedAt: Date.now(),
        };
        return [...prev, asset];
      });
    },
    []
  );

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  }, []);

  const toggleAssetLock = useCallback((id: string) => {
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
