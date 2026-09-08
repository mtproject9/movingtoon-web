import { neon } from "@neondatabase/serverless";

// Neon의 서버리스 드라이버는 각 쿼리를 HTTP 요청으로 보내 커넥션 풀 걱정 없이
// Vercel 서버리스 함수(매 요청마다 새로 뜨는 환경)에서 안전하게 쓸 수 있다.
export const sql = neon(process.env.DATABASE_URL!);

let schemaReady: Promise<void> | null = null;

/** 최초 호출 시 필요한 테이블을 전부 만든다. 이미 있으면 아무 일도 하지 않는다. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS series (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          logline TEXT NOT NULL DEFAULT '',
          thumbnail TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL,
          custom_style_presets JSONB NOT NULL DEFAULT '[]'
        )
      `;
      await sql`ALTER TABLE series ADD COLUMN IF NOT EXISTS custom_style_presets JSONB NOT NULL DEFAULT '[]'`;
      await sql`
        CREATE TABLE IF NOT EXISTS episodes (
          id TEXT PRIMARY KEY,
          series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          episode_number INTEGER NOT NULL,
          created_at BIGINT NOT NULL,
          cuts JSONB NOT NULL DEFAULT '[]',
          script_text TEXT NOT NULL DEFAULT '',
          assets JSONB NOT NULL DEFAULT '[]',
          style_preset TEXT,
          cuts_updated_at BIGINT NOT NULL DEFAULT 0,
          board JSONB NOT NULL DEFAULT '[]',
          board_updated_at BIGINT NOT NULL DEFAULT 0,
          final_video_url TEXT NOT NULL DEFAULT ''
        )
      `;
      // 오래된 배포(컬럼이 생기기 전)에서 만들어진 테이블에도 안전하게 컬럼을 추가한다.
      await sql`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cuts_updated_at BIGINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS board JSONB NOT NULL DEFAULT '[]'`;
      await sql`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS board_updated_at BIGINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS final_video_url TEXT NOT NULL DEFAULT ''`;
      await sql`
        CREATE TABLE IF NOT EXISTS characters (
          id TEXT PRIMARY KEY,
          series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          gender TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT '',
          hair_tag TEXT NOT NULL DEFAULT '',
          eye_tag TEXT NOT NULL DEFAULT '',
          outfit_tag TEXT NOT NULL DEFAULT '',
          profile_image TEXT NOT NULL DEFAULT '',
          created_at BIGINT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS gallery_images (
          id TEXT PRIMARY KEY,
          character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          thumbnail_url TEXT NOT NULL,
          original_url TEXT NOT NULL,
          original_width INTEGER NOT NULL,
          original_height INTEGER NOT NULL,
          order_index BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;
      // order_index는 Date.now() 기반 값(밀리초 타임스탬프)이라 INTEGER(최대 약 21억) 범위를
      // 넘는다 — 초기 스키마가 INTEGER로 만들어진 적이 있어 안전하게 BIGINT로 맞춘다.
      await sql`ALTER TABLE gallery_images ALTER COLUMN order_index TYPE BIGINT`;
      await sql`
        CREATE TABLE IF NOT EXISTS trash_entries (
          id TEXT PRIMARY KEY,
          item_type TEXT NOT NULL,
          label TEXT NOT NULL,
          deleted_at BIGINT NOT NULL,
          origin_path JSONB NOT NULL DEFAULT '{}',
          payload JSONB NOT NULL DEFAULT '{}'
        )
      `;
    })();
  }
  return schemaReady;
}
