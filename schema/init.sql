-- MaskQL D1 Database Schema
-- Cloudflare D1 (SQLite 3.x compatible)

-- テーブル構造
-- ネストされたJSONオブジェクトを平坦化したkey-valueペアを保存
CREATE TABLE IF NOT EXISTS maskql_store (
  obj_id TEXT NOT NULL,      -- オブジェクト識別子
  key_path TEXT NOT NULL,    -- ドット区切りパス (例: "user.profile.name")
  value TEXT,                -- JSON-serialized value
  value_type TEXT,           -- 型情報 (string, number, boolean, null, object, array)
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (obj_id, key_path)
);

-- インデックス
-- obj_id による検索を高速化
CREATE INDEX IF NOT EXISTS idx_obj_id ON maskql_store(obj_id);

-- key_path による検索を高速化（部分一致検索用）
CREATE INDEX IF NOT EXISTS idx_key_path ON maskql_store(key_path);

-- 複合インデックス（obj_id + key_path での検索を最適化）
-- PRIMARY KEY により自動的に作成されるため、明示的な作成は不要だが、
-- 念のため明示的に記載（D1では重複しても問題ない）
-- CREATE INDEX IF NOT EXISTS idx_obj_key ON maskql_store(obj_id, key_path);
