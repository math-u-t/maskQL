/**
 * index.js
 * MaskQL - Cloudflare D1 上で動作する JSON 操作ライブラリ
 */

import { flatten, unflatten, getDiff, getDeletedKeys } from './flatten.js';
import { toStorageFormat, fromStorageFormat, isValidPath, isValidObjId } from './types.js';

/**
 * MaskQLクラス
 * ネストされたJSONオブジェクトをCloudflare D1に保存・操作するライブラリ
 */
export class MaskQL {
  /**
   * @param {D1Database} d1 - Cloudflare D1 データベースインスタンス
   * @param {string} tableName - 使用するテーブル名
   */
  constructor(d1, tableName = 'maskql_store') {
    if (!d1) {
      throw new Error('D1 database instance is required');
    }

    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Valid table name is required');
    }

    this.d1 = d1;
    this.tableName = tableName;
    this.currentObjId = null;
    this.flatData = {}; // 現在のオブジェクトの平坦化データ（メモリキャッシュ）
    this.originalFlatData = {}; // D1から読み込んだ時点のデータ（dirty tracking用）
    this.dirtyPaths = new Set(); // 変更されたパス
    this.deletedPaths = new Set(); // 削除されたパス
  }

  /**
   * 指定されたオブジェクトIDのデータをD1からロードする
   * @param {string} objId - オブジェクト識別子
   * @returns {Promise<void>}
   * @throws {Error} objIdが無効な場合
   */
  async use(objId) {
    if (!isValidObjId(objId)) {
      throw new Error(`Invalid object ID: ${objId}`);
    }

    // 現在のオブジェクトに未保存の変更がある場合は警告
    if (this.dirtyPaths.size > 0 || this.deletedPaths.size > 0) {
      console.warn(`MaskQL: Switching to new object "${objId}" with unsaved changes. Previous changes will be lost.`);
    }

    this.currentObjId = objId;
    this.flatData = {};
    this.originalFlatData = {};
    this.dirtyPaths.clear();
    this.deletedPaths.clear();

    try {
      // D1からデータを読み込む
      const query = `SELECT key_path, value, value_type FROM ${this.tableName} WHERE obj_id = ?`;
      const result = await this.d1.prepare(query).bind(objId).all();

      if (result.results) {
        for (const row of result.results) {
          const deserializedValue = fromStorageFormat(row.value, row.value_type);
          this.flatData[row.key_path] = deserializedValue;
          this.originalFlatData[row.key_path] = deserializedValue;
        }
      }
    } catch (error) {
      throw new Error(`Failed to load object "${objId}" from D1: ${error.message}`);
    }
  }

  /**
   * 指定されたパスの値を取得する（メモリキャッシュから）
   * @param {string} path - ドット区切りのパス
   * @returns {any} パスの値。存在しない場合は undefined
   * @throws {Error} パスが無効な場合
   */
  get(path) {
    if (!isValidPath(path)) {
      throw new Error(`Invalid path: ${path}`);
    }

    if (!this.currentObjId) {
      throw new Error('No object loaded. Call use() first.');
    }

    return this.flatData[path];
  }

  /**
   * 指定されたパスに値を設定する（メモリ内のみ）
   * @param {string} path - ドット区切りのパス
   * @param {any} value - 設定する値
   * @returns {void}
   * @throws {Error} パスが無効な場合
   */
  set(path, value) {
    if (!isValidPath(path)) {
      throw new Error(`Invalid path: ${path}`);
    }

    if (!this.currentObjId) {
      throw new Error('No object loaded. Call use() first.');
    }

    // 値が変更された場合のみ dirty マークをつける
    const oldValue = this.flatData[path];

    // 削除されたパスに再度値を設定する場合、削除フラグを解除
    if (this.deletedPaths.has(path)) {
      this.deletedPaths.delete(path);
    }

    // 値を設定
    this.flatData[path] = value;

    // 変更があった場合は dirty マークをつける
    if (oldValue !== value) {
      this.dirtyPaths.add(path);
    }
  }

  /**
   * 指定されたパスを削除する（メモリ内のみ）
   * @param {string} path - ドット区切りのパス
   * @returns {void}
   * @throws {Error} パスが無効な場合
   */
  delete(path) {
    if (!isValidPath(path)) {
      throw new Error(`Invalid path: ${path}`);
    }

    if (!this.currentObjId) {
      throw new Error('No object loaded. Call use() first.');
    }

    // パスが存在する場合のみ削除
    if (path in this.flatData) {
      delete this.flatData[path];
      this.deletedPaths.add(path);
      this.dirtyPaths.delete(path); // dirty フラグは削除
    }
  }

  /**
   * メモリ内の変更をD1に永続化する
   * @returns {Promise<void>}
   * @throws {Error} D1への書き込みに失敗した場合
   */
  async save() {
    if (!this.currentObjId) {
      throw new Error('No object loaded. Call use() first.');
    }

    const statements = [];

    try {
      // 削除されたパスの処理
      for (const path of this.deletedPaths) {
        // 元のデータに存在していた場合のみ DELETE を実行
        if (path in this.originalFlatData) {
          const deleteStmt = this.d1.prepare(
            `DELETE FROM ${this.tableName} WHERE obj_id = ? AND key_path = ?`
          ).bind(this.currentObjId, path);
          statements.push(deleteStmt);
        }
      }

      // 変更・追加されたパスの処理
      for (const path of this.dirtyPaths) {
        const value = this.flatData[path];
        const { value: serializedValue, type: valueType } = toStorageFormat(value);

        // UPSERT (INSERT OR REPLACE)
        const upsertStmt = this.d1.prepare(
          `INSERT INTO ${this.tableName} (obj_id, key_path, value, value_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
           ON CONFLICT(obj_id, key_path)
           DO UPDATE SET value = excluded.value, value_type = excluded.value_type, updated_at = unixepoch()`
        ).bind(this.currentObjId, path, serializedValue, valueType);

        statements.push(upsertStmt);
      }

      // batch API で一括実行
      if (statements.length > 0) {
        await this.d1.batch(statements);
      }

      // 保存が成功したら、originalFlatData を更新し、dirty フラグをクリア
      this.originalFlatData = { ...this.flatData };
      this.dirtyPaths.clear();
      this.deletedPaths.clear();
    } catch (error) {
      throw new Error(`Failed to save object "${this.currentObjId}" to D1: ${error.message}`);
    }
  }

  /**
   * オブジェクト全体を取得する
   * @returns {Object} ネストされたオブジェクト
   * @throws {Error} オブジェクトがロードされていない場合
   */
  getAll() {
    if (!this.currentObjId) {
      throw new Error('No object loaded. Call use() first.');
    }

    return unflatten(this.flatData);
  }

  /**
   * 現在ロードされているオブジェクトIDを取得する
   * @returns {string|null} 現在のオブジェクトID
   */
  getCurrentObjId() {
    return this.currentObjId;
  }

  /**
   * 未保存の変更があるかどうかを確認する
   * @returns {boolean} 未保存の変更がある場合 true
   */
  hasUnsavedChanges() {
    return this.dirtyPaths.size > 0 || this.deletedPaths.size > 0;
  }

  /**
   * オブジェクト全体を設定する（既存のデータは全て削除される）
   * @param {Object} obj - 設定するオブジェクト
   * @returns {void}
   * @throws {Error} オブジェクトがロードされていない場合
   */
  setAll(obj) {
    if (!this.currentObjId) {
      throw new Error('No object loaded. Call use() first.');
    }

    // 既存のすべてのキーを削除対象とする
    for (const path of Object.keys(this.flatData)) {
      this.deletedPaths.add(path);
    }

    // 新しいオブジェクトを平坦化
    const newFlatData = flatten(obj);

    // 新しいデータを設定
    this.flatData = {};
    for (const [path, value] of Object.entries(newFlatData)) {
      this.flatData[path] = value;
      this.dirtyPaths.add(path);
      // 削除対象から除外
      this.deletedPaths.delete(path);
    }
  }

  /**
   * 指定されたオブジェクトをD1から完全に削除する
   * @param {string} objId - 削除するオブジェクトID (省略時は現在のオブジェクト)
   * @returns {Promise<void>}
   * @throws {Error} 削除に失敗した場合
   */
  async deleteObject(objId = null) {
    const targetObjId = objId || this.currentObjId;

    if (!targetObjId) {
      throw new Error('No object ID specified for deletion');
    }

    if (!isValidObjId(targetObjId)) {
      throw new Error(`Invalid object ID: ${targetObjId}`);
    }

    try {
      await this.d1.prepare(
        `DELETE FROM ${this.tableName} WHERE obj_id = ?`
      ).bind(targetObjId).run();

      // 現在ロードされているオブジェクトを削除した場合は状態をクリア
      if (targetObjId === this.currentObjId) {
        this.currentObjId = null;
        this.flatData = {};
        this.originalFlatData = {};
        this.dirtyPaths.clear();
        this.deletedPaths.clear();
      }
    } catch (error) {
      throw new Error(`Failed to delete object "${targetObjId}" from D1: ${error.message}`);
    }
  }

  /**
   * 指定されたオブジェクトがD1に存在するかどうかを確認する
   * @param {string} objId - 確認するオブジェクトID
   * @returns {Promise<boolean>} 存在する場合 true
   */
  async exists(objId) {
    if (!isValidObjId(objId)) {
      throw new Error(`Invalid object ID: ${objId}`);
    }

    try {
      const result = await this.d1.prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE obj_id = ?`
      ).bind(objId).first();

      return result.count > 0;
    } catch (error) {
      throw new Error(`Failed to check existence of object "${objId}": ${error.message}`);
    }
  }
}

export default MaskQL;
