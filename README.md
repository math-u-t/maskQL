# maskQL

**JSON manipulation library for Cloudflare D1**

maskQL は Cloudflare D1（SQLite 3.x 互換）上で動作する JSON 操作ライブラリです。ネストされたオブジェクトを平坦化して D1 に保存し、高速な読み書きを実現します。

## 特徴

- **シンプルな API**: `use()`, `get()`, `set()`, `save()` の直感的なメソッド
- **型保持**: number, boolean, null などの型を正確に復元
- **高パフォーマンス**: メモリキャッシュと dirty tracking による効率的な更新
- **トランザクション対応**: D1 の batch API を使用した一括処理
- **依存関係なし**: Cloudflare Workers 標準 API のみを使用

## インストール

### 1. D1 データベース作成

```bash
npx wrangler d1 create maskql-db
```

出力例:
```
✅ Successfully created DB 'maskql-db'

[[d1_databases]]
binding = "DB"
database_name = "maskql-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. wrangler.toml に設定を追加

`wrangler.toml` に以下を追加します（database_id は上記コマンドの出力から取得）:

```toml
[[d1_databases]]
binding = "DB"
database_name = "maskql-db"
database_id = "<YOUR_DATABASE_ID>"
```

### 3. テーブル初期化

```bash
npx wrangler d1 execute maskql-db --file=./schema/init.sql
```

### 4. パッケージインストール

```bash
npm install
```

### 5. デプロイ

```bash
npx wrangler deploy
```

## 基本的な使い方

### Cloudflare Workers での使用

```javascript
import MaskQL from 'maskql';

export default {
  async fetch(request, env) {
    const mask = new MaskQL(env.DB, 'maskql_store');

    // オブジェクトをロード（存在しない場合は新規作成）
    await mask.use('user:123');

    // 値を設定
    mask.set('profile.name', 'Alice');
    mask.set('profile.age', 30);
    mask.set('settings.theme', 'dark');

    // D1 に保存
    await mask.save();

    // 値を取得
    const name = mask.get('profile.name'); // 'Alice'
    const age = mask.get('profile.age');   // 30

    // オブジェクト全体を取得
    const data = mask.getAll();
    // {
    //   profile: { name: 'Alice', age: 30 },
    //   settings: { theme: 'dark' }
    // }

    return new Response(JSON.stringify(data));
  }
};
```

## API リファレンス

### `constructor(d1, tableName)`

MaskQL インスタンスを作成します。

- **d1**: D1Database インスタンス（env.DB など）
- **tableName**: 使用するテーブル名（デフォルト: 'maskql_store'）

```javascript
const mask = new MaskQL(env.DB, 'maskql_store');
```

### `async use(objId)`

指定された ID のオブジェクトをロードします。存在しない場合は新規作成されます。

- **objId**: オブジェクト識別子（例: 'user:123', 'config:app'）
- **戻り値**: Promise<void>

```javascript
await mask.use('user:123');
```

### `get(path)`

指定されたパスの値を取得します（メモリキャッシュから）。

- **path**: ドット区切りのパス（例: 'profile.name'）
- **戻り値**: 値（存在しない場合は undefined）

```javascript
const name = mask.get('profile.name');
const age = mask.get('profile.age');
```

### `set(path, value)`

指定されたパスに値を設定します（メモリ内のみ、D1 には保存されません）。

- **path**: ドット区切りのパス
- **value**: 設定する値（プリミティブ、オブジェクト、配列）

```javascript
mask.set('profile.name', 'Alice');
mask.set('profile.age', 30);
mask.set('settings.notifications', { email: true, push: false });
```

### `async save()`

メモリ内の変更を D1 に永続化します。変更されたキーのみが更新されます（dirty tracking）。

- **戻り値**: Promise<void>

```javascript
await mask.save();
```

### `getAll()`

オブジェクト全体をネストされた形式で取得します。

- **戻り値**: Object

```javascript
const data = mask.getAll();
// { profile: { name: 'Alice', age: 30 }, settings: { ... } }
```

### `delete(path)`

指定されたパスを削除します（メモリ内のみ）。`save()` を呼ぶまで D1 からは削除されません。

- **path**: ドット区切りのパス

```javascript
mask.delete('profile.age');
await mask.save();
```

### `setAll(obj)`

オブジェクト全体を設定します。既存のデータは全て削除されます。

- **obj**: 設定するオブジェクト

```javascript
mask.setAll({
  profile: { name: 'Bob', age: 25 },
  settings: { theme: 'light' }
});
await mask.save();
```

### `async deleteObject(objId)`

指定されたオブジェクトを D1 から完全に削除します。

- **objId**: 削除するオブジェクト ID（省略時は現在のオブジェクト）
- **戻り値**: Promise<void>

```javascript
await mask.deleteObject('user:123');
```

### `async exists(objId)`

指定されたオブジェクトが D1 に存在するかどうかを確認します。

- **objId**: 確認するオブジェクト ID
- **戻り値**: Promise<boolean>

```javascript
const exists = await mask.exists('user:123');
if (exists) {
  await mask.use('user:123');
}
```

### `hasUnsavedChanges()`

未保存の変更があるかどうかを確認します。

- **戻り値**: boolean

```javascript
mask.set('profile.name', 'Alice');
console.log(mask.hasUnsavedChanges()); // true

await mask.save();
console.log(mask.hasUnsavedChanges()); // false
```

### `getCurrentObjId()`

現在ロードされているオブジェクト ID を取得します。

- **戻り値**: string | null

```javascript
const objId = mask.getCurrentObjId(); // 'user:123'
```

## 使用例

### 例1: ユーザープロフィール管理

```javascript
const mask = new MaskQL(env.DB, 'maskql_store');

await mask.use('user:alice');
mask.set('profile.name', 'Alice');
mask.set('profile.email', 'alice@example.com');
mask.set('profile.age', 30);
await mask.save();

// 後で読み込む
await mask.use('user:alice');
const email = mask.get('profile.email'); // 'alice@example.com'
```

### 例2: アプリケーション設定

```javascript
const mask = new MaskQL(env.DB, 'maskql_store');

await mask.use('config:app');
mask.set('database.host', 'localhost');
mask.set('database.port', 5432);
mask.set('features.enabled', ['auth', 'api', 'dashboard']);
await mask.save();
```

### 例3: 部分更新

```javascript
await mask.use('user:alice');
mask.set('profile.age', 31); // age のみ更新
await mask.save(); // profile.age のみが D1 に書き込まれる
```

### 例4: 複雑なネスト構造

```javascript
await mask.use('config:database');

mask.set('connections.primary.host', 'db1.example.com');
mask.set('connections.primary.port', 5432);
mask.set('connections.primary.ssl', true);
mask.set('connections.replica.host', 'db2.example.com');
mask.set('connections.replica.port', 5432);

await mask.save();

const config = mask.getAll();
// {
//   connections: {
//     primary: { host: 'db1.example.com', port: 5432, ssl: true },
//     replica: { host: 'db2.example.com', port: 5432 }
//   }
// }
```

## データ型の取り扱い

maskQL は以下のデータ型を正確に保持・復元します:

```javascript
// プリミティブ型
mask.set('str', 'hello');        // string
mask.set('num', 42);             // number
mask.set('bool', true);          // boolean
mask.set('nil', null);           // null

// 配列
mask.set('arr', [1, 2, 3]);      // array

// オブジェクト（ネストされた構造）
mask.set('obj', { a: { b: 1 } }); // object

await mask.save();

// 型が正確に復元される
mask.get('num') === 42;          // true (not "42")
mask.get('bool') === true;       // true (not "true")
mask.get('nil') === null;        // true (not "")
```

## パフォーマンス特性

- **get()**: O(1) - メモリキャッシュから取得
- **set()**: O(1) - メモリ内で設定
- **save()**: O(n) - n = 変更されたキーの数（dirty tracking により最小化）
- **use()**: O(m) - m = オブジェクトのキーの総数

## D1 スキーマ

```sql
CREATE TABLE maskql_store (
  obj_id TEXT NOT NULL,      -- オブジェクト識別子
  key_path TEXT NOT NULL,    -- ドット区切りパス
  value TEXT,                -- JSON-serialized value
  value_type TEXT,           -- 型情報
  created_at INTEGER,
  updated_at INTEGER,
  PRIMARY KEY (obj_id, key_path)
);
```

## エラーハンドリング

```javascript
try {
  const mask = new MaskQL(env.DB, 'maskql_store');
  await mask.use('user:123');
  mask.set('profile.name', 'Alice');
  await mask.save();
} catch (error) {
  console.error('MaskQL error:', error.message);
  // エラー処理
}
```

主なエラー:
- `Invalid object ID`: オブジェクト ID が無効
- `Invalid path`: パスが無効（空文字列、先頭/末尾のドット、連続ドットなど）
- `No object loaded`: `use()` を呼ぶ前に操作を実行
- `Failed to save`: D1 への保存に失敗

## 制約事項

- オブジェクト ID の最大長: 255 文字
- パスに使用できる文字: 英数字、アンダースコア、ハイフン、ドット
- パスの先頭/末尾にドットは使用不可
- 連続したドット（`..`）は使用不可

## ライセンス

MIT

## コントリビューション

Issue や Pull Request を歓迎します。

## 開発

### ローカル開発

```bash
# ローカル開発サーバー起動
npm run dev

# デプロイ
npm run deploy

# D1 クエリ実行
npm run db:query "SELECT * FROM maskql_store WHERE obj_id = 'user:123'"
```

### テスト

```bash
# 例: curl でテスト
curl http://localhost:8787/create
curl http://localhost:8787/read
curl http://localhost:8787/update
```

## FAQ

### Q: 既存のオブジェクトを上書きせずに更新できますか？

A: はい。`use()` でロードした後、`set()` で必要なパスのみを更新し、`save()` で保存します。変更されたパスのみが更新されます。

### Q: 大きなオブジェクトのパフォーマンスは？

A: maskQL は変更されたキーのみを保存する dirty tracking を使用しているため、大きなオブジェクトでも効率的です。ただし、`use()` 時には全てのキーがメモリにロードされます。

### Q: トランザクションに対応していますか？

A: `save()` メソッドは D1 の batch API を使用しており、複数の UPDATE/INSERT が一括で実行されます。

### Q: 配列のインデックスアクセスはできますか？

A: 現在のバージョンでは、配列全体が1つの値として扱われます。個別の要素にアクセスする場合は、配列全体を取得して操作してください。

```javascript
const arr = mask.get('items'); // [1, 2, 3]
arr.push(4);
mask.set('items', arr);
await mask.save();
```

## バージョン履歴

- **1.0.0** (2024-01-01): 初回リリース
  - 基本的な CRUD 操作
  - 型保持機能
  - Dirty tracking
  - Batch API 対応
