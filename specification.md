# 무빙툰 제작 관리 웹서비스 — 상세 기술 설계도 (specification.md)

> 이 문서는 클로드 코드(Claude Code)가 곧바로 읽고 개발에 착수할 수 있도록 작성된 MVP 설계서입니다.
> 대상 서비스: **1인 로맨스 웹소설/무빙툰 창작자를 위한 제작 관리 웹**
> 문서 버전: v1.0 / 작성일: 2026-08-27 / 작성: 코디(웹서비스 개발 PM)

---

## 0. 프로젝트 한 줄 요약

원고 텍스트를 붙여넣으면 → 컷 단위로 자동 분할되고 → 컷마다 미드저니용 영문 프롬프트가 자동 생성되며 → 작화/음성 에셋을 컷 번호 기준으로 모아 관리하고 → 전체 제작 상태를 칸반 보드로 한눈에 추적하는, **1인 창작자용 무빙툰 제작 올인원 대시보드**.

기존 문제: 대본 분할, 프롬프트 작성, 에셋 관리를 각각 수작업으로 하다 보니 버전 혼선과 제작 지연이 발생함 → 이 4가지를 한 화면 체계 안에서 해결.

---

## 1. 타겟 사용자 및 콘텐츠 톤

- **사용자**: 로맨틱 코미디 중심의 로맨스 웹소설 작가 1인. 미드저니/클링 등 AI 툴로 숏 드라마·단편 무빙툰을 직접 제작.
- **구독자 타겟(최종 시청자)**: 30~40대 여성.
- **작화 톤**: 한국 로맨스 웹툰/애니메이션 스타일, soft warm lighting, dreamy atmosphere, pastel color, 감정선 극대화(클로즈업/바스트샷 중심). (자세한 규칙은 6장 참고)
- **서비스 사용자 자신에게는 복잡한 코딩/기술 판단을 요구하지 않는다** — 웹 화면은 최대한 직관적인 클릭/붙여넣기/드래그 위주로 설계할 것.

---

## 2. 기술 스택 제안 (MVP 기준)

1인 창작자용 MVP이므로 **가볍고 배포가 쉬운 구성**을 우선한다.

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 14+ (App Router, TypeScript) | 프론트+API 라우트를 한 프로젝트로 처리, 배포 용이(Vercel) |
| 스타일 | Tailwind CSS | 빠른 UI 구현, 커스텀 디자인 시스템 불필요 |
| DB | SQLite + Prisma ORM | 별도 서버 없이 로컬 파일 DB로 MVP 충분, 추후 Postgres 전환 용이 |
| 파일 스토리지 | 로컬 `/public/uploads` (MVP) → 추후 S3/Supabase Storage로 교체 가능하게 인터페이스 분리 | 초기 개발 속도 우선 |
| AI 연동 | Anthropic Claude API (컷 분할, 프롬프트 생성용) | 원고 분석 및 영문 프롬프트 생성에 사용 |
| 인증 | 없음 (v1, 단일 사용자 가정) 또는 단순 비밀번호 게이트 1개 | 개인 도구이므로 복잡한 인증 불필요 |
| 드래그앤드롭 | `@dnd-kit/core` | 칸반 보드 상태 변경용 |
| 상태관리 | React Server Components + 최소한의 client state (zustand 선택적) | 과설계 방지 |

---

## 3. 데이터 모델

### 3.1 엔티티 개요

- **Project(작품)**: 무빙툰 작품 단위 (예: "재벌집 계약직 로맨스")
- **Character(캐릭터 시트)**: 작품별 등장인물의 헤어/눈동자/의상 기준 태그 (일관성 유지용)
- **Cut(컷)**: 원고에서 분할된 최소 연출 단위. 모든 데이터의 중심 축.
- **Prompt(프롬프트)**: 컷에 연결된 영문 작화 프롬프트(+네거티브 프롬프트)
- **Asset(에셋)**: 컷에 연결된 이미지/음성 파일

### 3.2 Prisma 스키마 (그대로 사용 가능)

```prisma
model Project {
  id         String      @id @default(cuid())
  title      String
  synopsis   String?
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt
  characters Character[]
  cuts       Cut[]
}

model Character {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id])
  name        String
  hairTag     String   // 예: "long wavy brown hair"
  eyeTag      String   // 예: "big sparkling brown eyes"
  outfitTag   String   // 예: "cream knit sweater"
  baseTags    String   // 캐릭터 일관성 유지를 위한 종합 프롬프트 태그 문자열
  createdAt   DateTime @default(now())
}

model Cut {
  id             String    @id @default(cuid())
  projectId      String
  project        Project   @relation(fields: [projectId], references: [id])
  cutNumber      Int       // 1, 2, 3 ... → 화면에는 Cut_01 형식으로 표시
  sceneNumber    Int       // 하나의 씬은 3~5컷으로 구성 (토토 규칙)
  scriptText     String    // 원문 대사/지문 원본
  dialogue       String?   // 정제된 대사
  emotionTag     String?   // 성우 감정선 지문. 예: "[설레며]"
  cameraAngle    String?   // 예: "close-up", "bust shot", "wide shot"
  expression     String?   // 인물 표정 지문. 예: "놀라며 눈이 커지는 표정"
  directionNote  String?   // 토토의 연출 지문 자유 메모
  status         CutStatus @default(SCRIPT_DONE)
  prompt         Prompt?
  assets         Asset[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@unique([projectId, cutNumber])
}

enum CutStatus {
  SCRIPT_DONE   // 원고 완료
  DRAWING       // 작화 중
  VOICE_DONE    // 음성 완료
  FINAL_DONE    // 최종 완성
}

model Prompt {
  id              String   @id @default(cuid())
  cutId           String   @unique
  cut             Cut      @relation(fields: [cutId], references: [id])
  promptText      String   // 영문 작화 프롬프트 (미드저니/SD용)
  negativePrompt  String?  // 네거티브 프롬프트
  characterTags   String?  // 적용된 캐릭터 일관성 태그 스냅샷
  version         Int      @default(1)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model Asset {
  id         String    @id @default(cuid())
  cutId      String
  cut        Cut       @relation(fields: [cutId], references: [id])
  type       AssetType
  fileUrl    String
  fileName   String    // 규칙: Cut_01_image_v1.png, Cut_01_voice_v1.mp3
  version    Int       @default(1)
  uploadedAt DateTime  @default(now())
}

enum AssetType {
  IMAGE
  AUDIO
  CHARACTER_SHEET
}
```

### 3.3 상태(Status) 정의

칸반 보드의 4단계는 `CutStatus` enum과 1:1 매칭된다.

| 상태 값 | 화면 표시명 | 전이 조건(자동/수동) |
|---|---|---|
| `SCRIPT_DONE` | 원고 완료 | 컷 분할 직후 기본값 |
| `DRAWING` | 작화 중 | 프롬프트 생성 또는 이미지 1개 이상 업로드 시 자동 전이(수동 변경도 허용) |
| `VOICE_DONE` | 음성 완료 | 음성 에셋 업로드 시 자동 전이 |
| `FINAL_DONE` | 최종 완성 | 사용자가 칸반 보드에서 수동으로만 이동 (최종 검수 개념이므로 자동화하지 않음) |

---

## 4. 폴더/파일 구조 제안

```
/app
  /project/[projectId]
    /split         → 화면① 원고 자동 분할
    /prompts        → 화면② 컷별 프롬프트 생성
    /assets         → 화면③ 캐릭터/음성 에셋 갤러리
    /board          → 화면④ 제작 진행 상태 대시보드
  /api
    /cuts/split      → POST: 원고 텍스트 → 컷 분할 (Claude API 호출)
    /prompts/generate → POST: 컷 정보 → 영문 프롬프트 생성 (Claude API 호출)
    /cuts/[id]       → GET/PATCH: 컷 상세 조회/수정 (상태 변경 포함)
    /assets/upload   → POST: 파일 업로드 (컷 연결, 자동 상태 전이 트리거)
/prisma
  schema.prisma
/components
  CutListSidebar.tsx      → 4개 화면 공용 좌측 컷 리스트
  PromptCard.tsx           → 프롬프트 표시 + 원클릭 복사 버튼
  AssetUploadCard.tsx      → 컷별 이미지/음성 업로드 슬롯
  KanbanBoard.tsx          → 드래그앤드롭 칸반 보드
  StatusBadge.tsx          → 4단계 상태 뱃지
/lib
  claude.ts                → Anthropic API 클라이언트 래퍼
  promptRules.ts            → 6장의 프롬프트 생성 규칙을 코드화한 상수/함수
/public/uploads             → MVP 단계 파일 저장 위치
```

---

## 5. 화면별 상세 기능 명세

공통: 4개 화면 모두 **좌측에 컷 리스트(Cut_01, Cut_02 …)를 고정 사이드바로 유지**하고, 우측 메인 영역에서 화면별 기능을 수행한다. 컷을 클릭하면 4개 화면 어디서든 같은 컷의 상세로 이동한다.

### 화면① 원고 자동 분할 (`/project/[id]/split`)

**목적**: 원고 텍스트를 붙여넣으면 무빙툰 컷 단위로 자동 분할.

**UI 구성**
- 상단: 큰 텍스트 입력창 (원고 붙여넣기)
- 버튼: `컷으로 분할하기`
- 좌측: 분할 결과 컷 리스트 (Cut_01, Cut_02 …), 씬 경계는 구분선으로 표시
- 우측: 선택한 컷의 상세 편집 패널
  - 대사(dialogue), 감정선 지문(emotionTag), 표정(expression), 카메라 앵글(cameraAngle), 연출 메모(directionNote) — 모두 인라인 수정 가능

**기능 요구사항**
1. `컷으로 분할하기` 클릭 → `POST /api/cuts/split` 호출 → Claude API로 원고 분석 → 컷 배열 반환
2. 분할 로직은 **한 씬(scene)당 3~5컷 이내**로 호흡을 쪼갠다 (토토 규칙, 7.1 참고)
3. 각 컷에는 표정 지문, 카메라 앵글(구도), 대사, 연출 지문이 자동 채워지며 사용자가 수정 가능
4. 감정선 지문은 대사 앞에 `[설레며]`, `[당황하며]` 같은 대괄호 표기로 자동 생성 (에코 규칙, 7.2 참고)
5. 저장 시 각 컷은 기본 상태 `SCRIPT_DONE`으로 DB에 생성됨
6. 컷 순서는 드래그로 재정렬 가능 (선택 기능, MVP 이후 우선순위 낮음)

**수용 기준**
- 원고 500자 기준 분할 결과가 10초 이내 반환된다
- 분할된 컷은 새로고침해도 유지된다(DB 저장 확인)

---

### 화면② 컷별 프롬프트 생성 (`/project/[id]/prompts`)

**목적**: 선택한 컷의 미드저니/SD용 고품질 영문 프롬프트를 자동 생성하고 즉시 복사 가능하게 제공.

**UI 구성**
- 좌측: 컷 리스트 (공통)
- 우측:
  - 프롬프트 카드: 생성된 영문 프롬프트 전문 표시
  - `원클릭 복사` 버튼 (클립보드 API, 클릭 시 "복사됨!" 토스트)
  - `프롬프트 재생성` 버튼
  - 네거티브 프롬프트 별도 영역 (역시 복사 버튼 포함)
  - 적용된 캐릭터 일관성 태그 표시 (어떤 캐릭터의 헤어/눈동자/의상 태그가 반영됐는지)

**기능 요구사항**
1. 컷 선택 시 저장된 프롬프트가 없으면 `자동 생성` 버튼 노출 → `POST /api/prompts/generate` 호출
2. 프롬프트 생성 규칙은 6장의 스타일 가이드를 그대로 반영 (로맨스 웹툰 스타일, 클로즈업/바스트샷, 캐릭터 일관성 태그, 네거티브 프롬프트 포함)
3. 프롬프트는 컷에 연결된 `Character`의 `baseTags`를 자동으로 불러와 프롬프트 앞부분에 삽입
4. `원클릭 복사`는 프롬프트 텍스트만 클립보드에 담는다 (마크다운 기호 등 불필요한 문자 제외)
5. 프롬프트를 수정 후 저장하면 `version`이 +1 되어 이력 관리됨 (이전 버전은 MVP에서는 조회만, 롤백은 이후 버전)
6. 프롬프트가 생성/저장되면 해당 컷 상태가 자동으로 `DRAWING`으로 전이 (이미 그 이후 상태면 유지)

**수용 기준**
- 프롬프트 생성 결과는 항상 영문이며 네거티브 프롬프트를 포함한다
- 복사 버튼 클릭 시 클립보드 내용이 프롬프트 텍스트와 정확히 일치한다

---

### 화면③ 캐릭터/음성 에셋 갤러리 (`/project/[id]/assets`)

**목적**: 컷 번호 기준으로 작화 이미지, 캐릭터 시트, 음성 파일을 업로드하고 한눈에 모아본다.

**UI 구성**
- 그리드 갤러리: 컷 번호별 카드 (Cut_01, Cut_02 …)
- 각 카드 내부:
  - 작화 이미지 업로드 슬롯 (드래그앤드롭 또는 클릭 업로드, 썸네일 미리보기)
  - 음성 파일 업로드 슬롯 (오디오 플레이어 내장)
  - 연결된 캐릭터 시트 썸네일 (참조용, 클릭 시 확대)
  - 각 파일 버전 표시 (v1, v2 …) 및 교체 업로드 지원
- 별도 탭/섹션: "캐릭터 시트 관리" — 작품 등장인물별 기준 이미지 및 헤어/눈동자/의상 태그 등록

**기능 요구사항**
1. 파일 업로드 시 자동 네이밍: `Cut_01_image_v1.png`, `Cut_01_voice_v1.mp3` (8장 규칙)
2. 이미지 업로드 완료 시 해당 컷 상태가 `DRAWING`으로 전이 (이미 프롬프트 단계여도 유지), 음성 업로드 완료 시 `VOICE_DONE`으로 전이
3. 캐릭터 시트는 `Character` 테이블에 저장되며 화면②의 프롬프트 자동 생성 시 참조됨
4. 이미지/음성 파일은 `POST /api/assets/upload`로 업로드, `multipart/form-data` 처리
5. 파일 삭제/교체 시 이전 버전은 유지하고 버전 번호만 올린다 (실수 삭제 방지)

**수용 기준**
- 업로드한 파일은 새로고침 후에도 컷 카드에 정상 표시된다
- 이미지 업로드 즉시 화면④ 대시보드의 해당 컷 상태가 갱신된다

---

### 화면④ 제작 진행 상태 대시보드 (`/project/[id]/board`)

**목적**: 컷별 상태(원고 완료 / 작화 중 / 음성 완료 / 최종 완성)를 칸반 보드로 한눈에 추적.

**UI 구성**
- 4개 컬럼: `원고 완료` / `작화 중` / `음성 완료` / `최종 완성`
- 각 컬럼 내 카드: 컷 번호, 썸네일(있으면), 씬 번호, 마지막 수정 시각
- 상단: 전체 진행률 바 (전체 컷 대비 `최종 완성` 비율 %)
- 카드는 드래그앤드롭으로 컬럼 간 이동 가능 → 이동 시 `PATCH /api/cuts/[id]`로 상태 즉시 반영

**기능 요구사항**
1. 카드를 다른 컬럼으로 드래그하면 즉시 DB에 상태 반영 (낙관적 업데이트 + 실패 시 롤백)
2. `최종 완성`으로의 이동은 항상 수동으로만 가능 (자동 전이 대상에서 제외)
3. 카드 클릭 시 화면②/③으로 바로 이동하는 바로가기 아이콘 제공 (제작 흐름 단축)
4. 전체 진행률은 실시간으로 재계산되어 상단에 표시

**수용 기준**
- 드래그로 상태를 변경하면 새로고침 후에도 유지된다
- 진행률 계산이 컷 총 개수 변화(추가/삭제)에도 정확히 반영된다

---

## 6. 로맨스 스타일 가이드 반영 규칙 (프롬프트/연출 자동화 로직)

`romance_style_guide.txt` 기준을 코드(`lib/promptRules.ts`)에 상수로 고정할 것.

### 6.1 작화 기본 스타일 (모든 프롬프트에 기본 포함)
```
Korean romance webtoon style, anime aesthetic,
soft warm lighting, dreamy atmosphere, vibrant pastel colors, 8k resolution,
highly detailed beautiful eyes, expressive facial emotion, fluttery romantic vibe
```

### 6.2 프롬프트 생성 필수 규칙 (애니 담당 로직)
- 캐릭터 일관성을 위해 해당 컷에 등장하는 `Character`의 `hairTag`, `eyeTag`, `outfitTag`를 항상 프롬프트 앞부분에 삽입
- 감정선 극대화를 위해 기본 구도는 **클로즈업(close-up) 또는 바스트샷(bust shot)** 우선, `cameraAngle` 필드 값이 있으면 그것을 우선 반영
- 프롬프트는 영문으로만 생성
- 네거티브 프롬프트 기본값(수정 가능하게 필드로 노출):
```
lowres, bad anatomy, extra limbs, deformed hands, blurry, watermark, text, signature
```

### 6.3 대본/연출 규칙 (토토 & 에코 로직)
- 컷 분할 시 **한 씬당 3~5컷 이내**로 나눌 것 (화면① 분할 API의 시스템 프롬프트에 강제 조건으로 명시)
- 대사 앞에 성우 감정선 지문을 대괄호로 표기: 예) `[설레며] "저... 그게 아니라..."`
- 표정/구도는 감정선과 세트로 생성 (예: `[설레며]` → 표정 "볼이 발그레해지며 눈을 피하는 표정", 구도 "close-up on face")

---

## 7. AI 연동 상세 (Claude API 호출 설계)

### 7.1 `/api/cuts/split` — 원고 → 컷 자동 분할
- Input: `{ projectId, scriptText }`
- 시스템 프롬프트 요지: "너는 로맨스 무빙툰 연출 감독이다. 아래 원고를 씬 단위로 나누고, 각 씬은 3~5개의 컷으로 분할하라. 각 컷마다 대사, 감정선 지문(대괄호), 표정, 카메라 앵글, 연출 메모를 JSON으로 반환하라."
- Output: 컷 배열(JSON) → 그대로 `Cut` 레코드 다건 생성

### 7.2 `/api/prompts/generate` — 컷 → 영문 프롬프트 생성
- Input: `{ cutId }` (서버에서 컷 정보 + 연결된 캐릭터 태그 조회)
- 시스템 프롬프트 요지: "너는 로맨스 웹툰 작화 프롬프트 전문가다. 6장의 스타일 규칙과 캐릭터 태그를 반영해 미드저니용 영문 프롬프트와 네거티브 프롬프트를 생성하라."
- Output: `{ promptText, negativePrompt }` → `Prompt` upsert, 컷 상태 `DRAWING`으로 전이

---

## 8. 에셋 네이밍 및 저장 규칙

- 컷 번호는 항상 2자리 이상 zero-padding: `Cut_01`, `Cut_02` … `Cut_10`
- 이미지: `Cut_XX_image_vN.확장자`
- 음성: `Cut_XX_voice_vN.확장자`
- 캐릭터 시트: `Character_[이름]_sheet.확장자`
- 저장 경로(MVP): `/public/uploads/[projectId]/[fileName]`

---

## 9. MVP 개발 우선순위 (Phase 구분)

**Phase 1 (필수, 1차 배포 목표)**
1. 데이터 모델/DB 세팅 (3장)
2. 화면① 원고 분할 + Claude API 연동
3. 화면② 프롬프트 생성 + 원클릭 복사
4. 화면④ 칸반 보드 (상태 조회/수동 변경만, 드래그 없이 버튼으로 상태 이동해도 무방)

**Phase 2**
5. 화면③ 에셋 갤러리 (업로드 + 자동 상태 전이)
6. 캐릭터 시트 관리 기능
7. 칸반 보드 드래그앤드롭 고도화

**Phase 3 (이후 확장)**
- 프롬프트 버전 이력/롤백 UI
- 다중 작품(Project) 전환 UI 고도화
- 클라우드 스토리지(S3 등) 전환
- 다중 사용자/협업 기능

---

## 10. 비기능 요구사항

- 반응형: 데스크톱 우선(제작 도구 특성상), 태블릿까지는 레이아웃 깨지지 않을 것
- 모든 "복사" 동작은 클릭 1회로 완료, 성공 피드백(토스트) 필수
- 파일 업로드는 드래그앤드롭 + 클릭 업로드 둘 다 지원
- 로딩/생성 중 상태(스피너 등) 명확히 표시 — AI 호출은 수 초 소요될 수 있음
- 에러 발생 시 사용자에게 기술 용어 없이 "다시 시도해주세요" 수준의 안내만 노출 (콘솔에는 상세 로그)

---

## 11. 클로드 코드용 실행 지시 요약 (그대로 복사해서 사용 가능)

```
Next.js 14(App Router, TypeScript) + Tailwind + Prisma(SQLite)로 무빙툰 제작 관리 MVP를 구축해줘.
아래 4개 화면을 이 문서의 3~9장 스펙대로 구현해줘:
1) /project/[id]/split — 원고 자동 분할 (Claude API로 씬당 3~5컷 분할)
2) /project/[id]/prompts — 컷별 영문 작화 프롬프트 생성 + 원클릭 복사
3) /project/[id]/assets — 컷 번호 기준 이미지/음성 업로드 갤러리
4) /project/[id]/board — 4단계 칸반 보드(원고완료/작화중/음성완료/최종완성)

데이터 모델은 3.2장의 Prisma 스키마를 그대로 사용하고,
프롬프트 생성 규칙은 6장을, AI 연동은 7장의 시스템 프롬프트 요지를 참고해줘.
Phase 1(9장)부터 순서대로 구현해줘.
```

---

*본 문서는 `service_features.txt`, `romance_style_guide.txt`(세컨드 브레인 프로젝트 문서) 내용을 기반으로 작성되었습니다.*
