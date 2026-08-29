import Link from "next/link";
import { Heart } from "lucide-react";

// 헤더 로고와 홈 화면 히어로 타이틀에서 공통으로 쓰는 "무빙툰 스튜디오" 브랜드 텍스트.
// 두 군데서 각자 스타일을 따로 관리하면 쉽게 어긋나므로 여기 한 곳에서만 정의한다.
export default function StudioLogo({
  href,
  size = "md",
}: {
  href?: string;
  size?: "md" | "lg";
}) {
  const iconClass = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  const textClass = size === "lg" ? "text-2xl" : "text-lg";

  const content = (
    <>
      <Heart className={`${iconClass} shrink-0 fill-rose-400 text-rose-400`} />
      <span
        className={`${textClass} font-logo tracking-tight bg-linear-to-r from-rose-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent drop-shadow-sm`}
      >
        무빙툰 스튜디오
      </span>
    </>
  );

  const className = "flex shrink-0 items-center gap-2";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
