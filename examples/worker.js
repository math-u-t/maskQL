/**
 * examples/worker.js
 * MaskQL を使用した Cloudflare Workers の実装例
 */

import MaskQL from '../src/index.js';

/**
 * Cloudflare Workers のエントリーポイント
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 例1: 新規作成とデータ保存
      if (path === '/create') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.use('user:123');
        mask.set('profile.name', 'Alice');
        mask.set('profile.age', 30);
        mask.set('profile.email', 'alice@example.com');
        mask.set('settings.theme', 'dark');
        mask.set('settings.notifications.email', true);
        mask.set('settings.notifications.push', false);
        await mask.save();

        return new Response(JSON.stringify({
          success: true,
          message: 'User created successfully',
          data: mask.getAll()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例2: データの読み込み
      if (path === '/read') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.use('user:123');
        const name = mask.get('profile.name');
        const age = mask.get('profile.age');
        const theme = mask.get('settings.theme');

        return new Response(JSON.stringify({
          success: true,
          data: {
            name,
            age,
            theme,
            all: mask.getAll()
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例3: 部分更新
      if (path === '/update') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.use('user:123');
        mask.set('profile.age', 31); // age のみ更新
        await mask.save();

        return new Response(JSON.stringify({
          success: true,
          message: 'User updated successfully',
          data: mask.getAll()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例4: パスの削除
      if (path === '/delete-path') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.use('user:123');
        mask.delete('profile.age');
        await mask.save();

        return new Response(JSON.stringify({
          success: true,
          message: 'Path deleted successfully',
          data: mask.getAll()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例5: オブジェクト全体の削除
      if (path === '/delete-object') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.deleteObject('user:123');

        return new Response(JSON.stringify({
          success: true,
          message: 'Object deleted successfully'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例6: 複雑なネスト構造のテスト
      if (path === '/complex') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.use('config:app');

        // 深いネスト構造
        mask.set('database.connections.primary.host', 'localhost');
        mask.set('database.connections.primary.port', 5432);
        mask.set('database.connections.primary.ssl', true);
        mask.set('database.connections.replica.host', 'replica.example.com');
        mask.set('database.connections.replica.port', 5432);

        // 配列のテスト
        mask.set('features.enabled', ['auth', 'api', 'dashboard']);
        mask.set('features.beta', ['analytics']);

        // 様々な型のテスト
        mask.set('metrics.requests', 12345);
        mask.set('metrics.errors', 42);
        mask.set('metrics.uptime', 99.9);
        mask.set('flags.maintenance', false);
        mask.set('flags.debug', true);
        mask.set('lastDeployment', null);

        await mask.save();

        return new Response(JSON.stringify({
          success: true,
          data: mask.getAll()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例7: オブジェクトの存在確認
      if (path === '/exists') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        const exists = await mask.exists('user:123');

        return new Response(JSON.stringify({
          success: true,
          exists
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例8: オブジェクト全体の置き換え
      if (path === '/replace') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.use('user:456');

        // オブジェクト全体を設定
        mask.setAll({
          profile: {
            name: 'Bob',
            age: 25,
            email: 'bob@example.com'
          },
          preferences: {
            language: 'en',
            timezone: 'UTC'
          }
        });

        await mask.save();

        return new Response(JSON.stringify({
          success: true,
          data: mask.getAll()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 例9: 未保存の変更チェック
      if (path === '/unsaved') {
        const mask = new MaskQL(env.DB, 'maskql_store');

        await mask.use('user:123');

        const beforeChanges = mask.hasUnsavedChanges();

        mask.set('profile.name', 'Alice Updated');

        const afterChanges = mask.hasUnsavedChanges();

        // 変更を破棄（保存しない）

        return new Response(JSON.stringify({
          success: true,
          beforeChanges,
          afterChanges
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ルートパス: 利用可能なエンドポイントを表示
      if (path === '/' || path === '') {
        return new Response(JSON.stringify({
          message: 'MaskQL Examples',
          endpoints: [
            'GET /create - Create a new user object',
            'GET /read - Read user data',
            'GET /update - Update user age',
            'GET /delete-path - Delete a specific path',
            'GET /delete-object - Delete entire object',
            'GET /complex - Test complex nested structures',
            'GET /exists - Check if object exists',
            'GET /replace - Replace entire object',
            'GET /unsaved - Check for unsaved changes'
          ]
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 404
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // エラーハンドリング
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
