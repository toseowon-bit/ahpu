// 해시 라우팅·이름 조회 보조 함수 (브라우저 데모와 테스트에서 함께 사용).
// 화면·동작 이름은 주소나 data- 속성에서 오므로 객체 자신의 키만 허용한다.
// (예: '#/constructor/...'가 Object.prototype.constructor로 해석되어 주소 문자열이 화면에 그대로 삽입되던 문제 방지)

/** obj가 key를 '자기 속성'으로 가질 때만 값을 돌려준다. */
export function own(obj, key) {
 return typeof key === 'string' && Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/**
 * location.hash를 화면 이름·인자·쿼리로 나눈다. 잘못된 % 인코딩이 있으면 fallback 화면으로 보낸다.
 * @returns {{name:string, args:string[], params:URLSearchParams, path:string, valid:boolean}}
 */
export function parseHash(hash, fallback) {
 const raw = String(hash || '').replace(/^#\/?/, '') || fallback;
 const [path, qs = ''] = raw.split('?');
 const decode = s => { try { return decodeURIComponent(s); } catch { return null; } };
 const parts = path.split('/').map(decode);
 if (parts.some(p => p === null)) return {name: fallback, args: [], params: new URLSearchParams(), path: fallback, valid: false};
 return {name: parts[0], args: parts.slice(1), params: new URLSearchParams(qs), path, valid: true};
}
