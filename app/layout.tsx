import type { Metadata } from "next";
import { Geist, Geist_Mono, Gugi } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// "무빙툰 스튜디오" 로고/히어로 타이틀 전용 서체 — 둥글고 굵은 한글 디스플레이 폰트.
// 본문에는 쓰지 않고 StudioLogo 컴포넌트에서만 font-logo 유틸리티로 적용한다.
const gugi = Gugi({
  weight: "400",
  // next/font/google에 번들된 이 폰트의 서브셋 메타데이터가 "latin"만 등록돼 있어
  // (실제로는 한글 전용 폰트인데도) subsets를 지정하면 한글 글리프가 빠진다.
  // 생략하면 기본 전체 문자셋으로 내려받아 한글이 정상적으로 포함된다.
  variable: "--font-logo",
});

export const metadata: Metadata = {
  title: "무빙툰 스튜디오",
  description: "로맨스 무빙툰 제작 관리 웹",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${gugi.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-full flex-col">{children}</body>
    </html>
  );
}
