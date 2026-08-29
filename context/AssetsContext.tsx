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
    cutId: string,
    type: AssetType,
    fileUrl: string,
    fileName: string,
    thumbnailUrl?: string
  ) => void;
  removeAsset: (id: string) => void;
  getAssetsForCut: (cutId: string, type: AssetType) => CutAsset[];
}

const AssetsContext = createContext<AssetsContextValue | null>(null);

function assetsKey(episodeId: string) {
  return `movingtoon:${episodeId}:assets`;
}

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
    try {
      const rawAssets = window.localStorage.getItem(assetsKey(episodeId));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssets(rawAssets ? (JSON.parse(rawAssets) as CutAsset[]) : []);
    } catch {
      setAssets([]);
    } finally {
      setHydrated(true);
    }
  }, [episodeId]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(assetsKey(episodeId), JSON.stringify(assets));
  }, [assets, episodeId, hydrated]);

  const addAsset = useCallback(
    (
      cutId: string,
      type: AssetType,
      fileUrl: string,
      fileName: string,
      thumbnailUrl?: string
    ) => {
      setAssets((prev) => {
        const existingVersions = prev.filter(
          (asset) => asset.cutId === cutId && asset.type === type
        ).length;
        const asset: CutAsset = {
          id: makeId("asset"),
          cutId,
          type,
          fileUrl,
          thumbnailUrl,
          fileName,
          version: existingVersions + 1,
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

  const getAssetsForCut = useCallback(
    (cutId: string, type: AssetType) =>
      assets.filter((asset) => asset.cutId === cutId && asset.type === type),
    [assets]
  );

  const value: AssetsContextValue = {
    assets,
    addAsset,
    removeAsset,
    getAssetsForCut,
  };

  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>;
}

export function useAssets() {
  const ctx = useContext(AssetsContext);
  if (!ctx) throw new Error("useAssets must be used within AssetsProvider");
  return ctx;
}
