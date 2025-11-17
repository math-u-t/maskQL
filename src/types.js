/**
 * types.js
 * 型判定と型保持のためのユーティリティ関数群
 */

/**
 * 値の型を判定する
 * @param {any} value - 判定する値
 * @returns {string} 型名 ('string' | 'number' | 'boolean' | 'null' | 'undefined' | 'object' | 'array')
 */
export function getValueType(value) {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  const type = typeof value;

  if (type === 'object') {
    return 'object';
  }

  // 'string' | 'number' | 'boolean' | 'function' | 'symbol' | 'bigint'
  return type;
}

/**
 * 値を文字列にシリアライズする
 * @param {any} value - シリアライズする値
 * @returns {string} シリアライズされた文字列
 *
 * 変換規則:
 *   - null/undefined → ''
 *   - string → そのまま
 *   - number/boolean → String(value)
 *   - array/object → JSON.stringify(value)
 */
export function serializeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const type = getValueType(value);

  switch (type) {
    case 'string':
      return value;

    case 'number':
    case 'boolean':
      return String(value);

    case 'array':
    case 'object':
      return JSON.stringify(value);

    default:
      return String(value);
  }
}

/**
 * 文字列を元の型に復元する
 * @param {string} serialized - シリアライズされた文字列
 * @param {string} valueType - 元の型情報
 * @returns {any} 復元された値
 *
 * 復元規則:
 *   - 'null' → null
 *   - 'undefined' → undefined
 *   - 'number' → Number(serialized)
 *   - 'boolean' → serialized === 'true'
 *   - 'array'/'object' → JSON.parse(serialized)
 *   - 'string' → serialized
 */
export function deserializeValue(serialized, valueType) {
  // null または undefined の場合
  if (valueType === 'null' || serialized === '') {
    return null;
  }

  if (valueType === 'undefined') {
    return undefined;
  }

  // 文字列の場合
  if (valueType === 'string') {
    return serialized;
  }

  // 数値の場合
  if (valueType === 'number') {
    const num = Number(serialized);
    return isNaN(num) ? 0 : num;
  }

  // 真偽値の場合
  if (valueType === 'boolean') {
    return serialized === 'true';
  }

  // 配列またはオブジェクトの場合
  if (valueType === 'array' || valueType === 'object') {
    try {
      return JSON.parse(serialized);
    } catch (e) {
      // パースエラーの場合は空配列/空オブジェクトを返す
      return valueType === 'array' ? [] : {};
    }
  }

  // その他の場合は文字列として返す
  return serialized;
}

/**
 * 値をD1に保存する形式に変換する
 * @param {any} value - 変換する値
 * @returns {{value: string, type: string}} シリアライズされた値と型情報
 */
export function toStorageFormat(value) {
  const type = getValueType(value);
  const serialized = serializeValue(value);

  return {
    value: serialized,
    type: type
  };
}

/**
 * D1から取得した値を元の型に復元する
 * @param {string} value - シリアライズされた値
 * @param {string} type - 型情報
 * @returns {any} 復元された値
 */
export function fromStorageFormat(value, type) {
  return deserializeValue(value, type);
}

/**
 * パスが有効かどうかを検証する
 * @param {string} path - 検証するパス
 * @returns {boolean} パスが有効な場合 true
 */
export function isValidPath(path) {
  // 空文字列はNG
  if (!path || typeof path !== 'string') {
    return false;
  }

  // 前後の空白はNG
  if (path.trim() !== path) {
    return false;
  }

  // 先頭または末尾のドットはNG
  if (path.startsWith('.') || path.endsWith('.')) {
    return false;
  }

  // 連続したドットはNG
  if (path.includes('..')) {
    return false;
  }

  // 空のセグメント（例: "a..b"）はNG - 上記の連続ドットチェックでカバー済み

  return true;
}

/**
 * オブジェクトIDが有効かどうかを検証する
 * @param {string} objId - 検証するオブジェクトID
 * @returns {boolean} オブジェクトIDが有効な場合 true
 */
export function isValidObjId(objId) {
  // 空文字列はNG
  if (!objId || typeof objId !== 'string') {
    return false;
  }

  // 前後の空白はNG
  if (objId.trim() !== objId) {
    return false;
  }

  // 長すぎるIDはNG（最大255文字）
  if (objId.length > 255) {
    return false;
  }

  return true;
}

/**
 * 値が変更されたかどうかを判定する
 * @param {any} oldValue - 古い値
 * @param {any} newValue - 新しい値
 * @returns {boolean} 値が変更された場合 true
 */
export function hasValueChanged(oldValue, newValue) {
  // 参照が同じ場合は変更なし
  if (oldValue === newValue) {
    return false;
  }

  // null/undefined の比較
  if (oldValue === null || oldValue === undefined) {
    return newValue !== null && newValue !== undefined;
  }

  if (newValue === null || newValue === undefined) {
    return oldValue !== null && oldValue !== undefined;
  }

  // 型が異なる場合は変更あり
  const oldType = getValueType(oldValue);
  const newType = getValueType(newValue);

  if (oldType !== newType) {
    return true;
  }

  // プリミティブ型の場合は === で比較
  if (oldType === 'string' || oldType === 'number' || oldType === 'boolean') {
    return oldValue !== newValue;
  }

  // オブジェクトや配列の場合は JSON.stringify で比較
  try {
    return JSON.stringify(oldValue) !== JSON.stringify(newValue);
  } catch (e) {
    // シリアライズできない場合は変更ありとする
    return true;
  }
}
