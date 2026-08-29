"use client";

import { useEffect, useRef, useState } from "react";

// IntersectionObserver로 뷰포트 근처에 들어온 썸네일만 blob URL을 만들어 렌더링한다.
// 100장을 한 번에 디코딩하지 않기 위한 지연 로딩 처리.
export default function LazyThumbnail({
  blob,
  alt,
  className,
}: {
  blob: Blob;
  alt: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const objectUrl = URL.createObjectURL(blob);
    // blob URL 생성은 외부 브라우저 API 호출이라 렌더 중에는 할 수 없어 effect에서 처리한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [inView, blob]);

  return (
    <div ref={containerRef} className={className}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-slate-100" />
      )}
    </div>
  );
}
