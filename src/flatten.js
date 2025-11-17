/**
 * flatten.js
 * ネストされたオブジェクトをドット区切りのキーバリューペアに変換する関数群
 */

/**
 * ネストされたオブジェクトを平坦化する
 * @param {Object} obj - 平坦化する対象のオブジェクト
 * @param {string} prefix - 現在のパスのプレフィックス（再帰用）
 * @param {Object} result - 結果を格納するオブジェクト（再帰用）
 * @returns {Object} 平坦化されたキーバリューペア
 *
 * 例:
 *   flatten({a: {b: 1}}) → {"a.b": 1}
 *   flatten({arr: [1,2]}) → {"arr": "[1,2]"}
 *   flatten({val: null}) → {"val": ""}
 */
export function flatten(obj, prefix = '', result = {}) {
  // null または undefined の場合
  if (obj === null || obj === undefined) {
    if (prefix) {
      result[prefix] = '';
    }
    return result;
  }

  // プリミティブ型の場合
  if (typeof obj !== 'object') {
    if (prefix) {
      result[prefix] = obj;
    }
    return result;
  }

  // 配列の場合は JSON.stringify で文字列化
  if (Array.isArray(obj)) {
    if (prefix) {
      result[prefix] = JSON.stringify(obj);
    }
    return result;
  }

  // オブジェクトの場合は再帰的に処理
  const keys = Object.keys(obj);

  // 空オブジェクトの場合
  if (keys.length === 0) {
    if (prefix) {
      result[prefix] = '{}';
    }
    return result;
  }

  for (const key of keys) {
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    // 値が null または undefined
    if (value === null || value === undefined) {
      result[newPrefix] = '';
      continue;
    }

    // 値が配列
    if (Array.isArray(value)) {
      result[newPrefix] = JSON.stringify(value);
      continue;
    }

    // 値がオブジェクト（Date などの特殊オブジェクトも含む）
    if (typeof value === 'object') {
      // Date オブジェクトは ISO 文字列に変換
      if (value instanceof Date) {
        result[newPrefix] = value.toISOString();
        continue;
      }

      // 空オブジェクトの場合
      const valueKeys = Object.keys(value);
      if (valueKeys.length === 0) {
        result[newPrefix] = '{}';
        continue;
      }

      // 通常のオブジェクトは再帰処理
      flatten(value, newPrefix, result);
      continue;
    }

    // プリミティブ値（string, number, boolean）
    result[newPrefix] = value;
  }

  return result;
}

/**
 * 平坦化されたオブジェクトを元のネスト構造に戻す
 * @param {Object} flatObj - 平坦化されたオブジェクト
 * @returns {Object} ネストされたオブジェクト
 *
 * 例:
 *   unflatten({"a.b": 1}) → {a: {b: 1}}
 *   unflatten({"arr": "[1,2]"}) → {arr: [1,2]}
 *   unflatten({"val": ""}) → {val: null}
 */
export function unflatten(flatObj) {
  const result = {};

  for (const [path, value] of Object.entries(flatObj)) {
    const keys = path.split('.');
    let current = result;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const isLast = i === keys.length - 1;

      if (isLast) {
        // 最後のキーの場合、値を設定
        current[key] = parseValue(value);
      } else {
        // 中間のキーの場合、オブジェクトを作成
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }
    }
  }

  return result;
}

/**
 * 文字列化された値を適切な型に変換する
 * @param {any} value - 変換する値
 * @returns {any} パースされた値
 *
 * 変換規則:
 *   - 空文字列 → null
 *   - "{}" → {}
 *   - JSON配列文字列 → array
 *   - その他 → 元の値
 */
function parseValue(value) {
  // 空文字列は null として扱う
  if (value === '') {
    return null;
  }

  // 文字列でない場合はそのまま返す
  if (typeof value !== 'string') {
    return value;
  }

  // 空オブジェクトの場合
  if (value === '{}') {
    return {};
  }

  // 配列または複雑なオブジェクトの可能性がある場合、JSON.parse を試みる
  if ((value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('{') && value.endsWith('}'))) {
    try {
      return JSON.parse(value);
    } catch (e) {
      // パースできない場合は文字列として返す
      return value;
    }
  }

  // その他の文字列はそのまま返す
  return value;
}

/**
 * 2つの平坦化されたオブジェクトの差分を取得する
 * @param {Object} oldFlat - 古い平坦化オブジェクト
 * @param {Object} newFlat - 新しい平坦化オブジェクト
 * @returns {Object} 変更されたキーバリューペア
 */
export function getDiff(oldFlat, newFlat) {
  const diff = {};

  // 新しいキーまたは変更されたキーを検出
  for (const [key, value] of Object.entries(newFlat)) {
    if (!(key in oldFlat) || oldFlat[key] !== value) {
      diff[key] = value;
    }
  }

  return diff;
}

/**
 * 削除されたキーを検出する
 * @param {Object} oldFlat - 古い平坦化オブジェクト
 * @param {Object} newFlat - 新しい平坦化オブジェクト
 * @returns {string[]} 削除されたキーの配列
 */
export function getDeletedKeys(oldFlat, newFlat) {
  const deleted = [];

  for (const key of Object.keys(oldFlat)) {
    if (!(key in newFlat)) {
      deleted.push(key);
    }
  }

  return deleted;
}
