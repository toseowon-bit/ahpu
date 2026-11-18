// 원재료명 문자열에서 알레르기 유발 항목(표시 의무 19개)과 관련된 표현을 찾는다.
// 주의: 이것은 '원재료명 안의 단어 찾기'이며 알레르기 표시나 혼입 가능성 판정이 아니다.
// 찾지 못했다고 해서 해당 성분이 없다는 뜻이 아니다(복합원재료 하위 성분, 표기 방식 차이 등).
// 놓치는 것(위음성)이 가장 위험하므로 넓게 잡는다. 오탐은 화면에서 '원재료명에서 발견 → 포장지 확인'으로만 안내된다.
// 영문 원재료 표기도 찾는다(대소문자 무시, 영문 단어는 단어 시작에서만 일치: 'ham'이 'graham'에 걸리지 않게).
export const ALLERGEN_KEYWORDS = {
 난류: ['난류', '계란', '달걀', '전란', '난백', '난황', '노른자', '흰자', '알부민', '마요네즈', '에그', 'egg', 'albumen'],
 우유: ['우유', '분유', '탈지유', '전지유', '조제유', '가공유', '발효유', '유청', '유당', '유지방', '유고형분', '유단백', '유크림', '카제인', '카세인', '치즈', '버터', '크림', '연유', '요구르트', '요거트', '밀크', '락토', 'milk', 'whey', 'casein', 'lactose', 'cheese', 'butter', 'cream'],
 메밀: ['메밀', 'buckwheat'],
 땅콩: ['땅콩', '피넛', 'peanut'],
 대두: ['대두', '콩', '두유', '두부', '간장', '된장', '청국장', '낫또', '미소', '레시틴', 'soy', 'soya', 'lecithin'],
 밀: ['밀', '소맥', '글루텐', '세몰리나', '듀럼', 'wheat', 'gluten', 'semolina', 'durum', 'spelt'],
 고등어: ['고등어', 'mackerel'],
 게: ['게살', '꽃게', '대게', '게', '크랩', 'crab'],
 새우: ['새우', 'shrimp', 'prawn'],
 돼지고기: ['돼지', '돈육', '돈지', '라드', '햄', '베이컨', '포크', 'pork', 'bacon', 'ham', 'lard'],
 복숭아: ['복숭아', 'peach'],
 토마토: ['토마토', 'tomato'],
 아황산류: ['아황산', '이산화황', 'sulfite', 'sulphite', 'sulfur dioxide'],
 호두: ['호두', 'walnut'],
 닭고기: ['닭', '계육', '치킨', 'chicken'],
 쇠고기: ['쇠고기', '소고기', '우육', '우지', '사골', '우골', '비프', 'beef'],
 오징어: ['오징어', 'squid'],
 조개류: ['조개', '굴', '전복', '홍합', '바지락', '가리비', '키조개', '꼬막', '재첩', '대합', '관자', 'clam', 'oyster', 'mussel', 'abalone', 'scallop'],
 잣: ['잣', 'pine nut']
};

// 예외: 키워드를 포함하지만 해당 알레르기와 무관한 흔한 원재료.
const EXCLUDE = {
 콩: ['강낭콩', '완두콩', '녹두', '팥'],
 밀: ['밀감'],
 게: ['게르마늄'],
 햄: ['햄프'],
 egg: ['eggplant']
};

const own = (obj, key) => (Object.hasOwn(obj, key) ? obj[key] : undefined);
const splitParts = (text) => String(text || '').split(/[,，、()（）\[\]{}·/;]/u).map(s => s.trim()).filter(Boolean);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 영문(ASCII) 키워드는 단어 시작에서만, 한글 등은 부분 문자열로 찾는다.
const contains = (text, word) => /^[\x20-\x7e]+$/.test(word)
 ? new RegExp(`(^|[^a-z])${escapeRe(word)}`, 'i').test(text)
 : text.includes(word);

/**
 * @param {string} rawMaterials 원재료명 원문
 * @param {string[]} allergens 찾을 항목(19개 중 일부)
 * @param {string[]} [customWords] 19개 밖 항목(예: 키위) — 글자 그대로 찾는다
 * @returns {{allergen:string, word:string, part:string}[]}
 */
export function findAllergenMentions(rawMaterials, allergens, customWords = []) {
 const parts = splitParts(rawMaterials);
 const found = [];
 const seen = new Set();
 const check = (allergen, words) => {
  for (const part of parts) {
   const lower = part.toLowerCase();
   for (const word of words) {
    const w = word.toLowerCase();
    if (!contains(lower, w)) continue;
    const ex = own(EXCLUDE, w) || [];
    if (ex.some(e => lower.includes(e) && !contains(lower.split(e).join(' '), w))) continue;
    const key = allergen + '|' + part;
    if (!seen.has(key)) { seen.add(key); found.push({allergen, word, part}); }
    break;
   }
  }
 };
 for (const a of allergens) { const words = own(ALLERGEN_KEYWORDS, a); if (words) check(a, words); }
 for (const w of customWords) if (typeof w === 'string' && w.trim()) check(w.trim(), [w.trim()]);
 return found;
}

// 하위 성분이 공개되지 않는 복합원재료(예: 기타가공품, 혼합제제, 효소식품, 시즈닝분말, 소스류).
// 이런 항목이 있으면 '찾지 못함'이어도 원재료 정보가 불완전하다는 뜻이다.
const COMPOSITE_ANYWHERE = /(가공품|혼합제제|조제품|시즈닝|양념|소스|베이스|믹스|조미료|드레싱|혼합분말|분말혼합|혼합물)/u;
const COMPOSITE_END = /식품(류)?$/u;
export function findCompositeIngredients(rawMaterials) {
 return [...new Set(splitParts(rawMaterials).filter(p => {
  const core = p.replace(/\s*\d+(?:\.\d+)?\s*%/gu, '').trim();
  return COMPOSITE_ANYWHERE.test(core) || COMPOSITE_END.test(core);
 }))];
}

// 쿠팡 상품명에서 용량·수량·괄호 설명을 걷어내 식품안전나라 제품명 검색어로 쓴다.
export function productSearchTerm(name) {
 return String(name || '')
  .replace(/\[[^\]]*\]|\([^)]*\)/gu, ' ')
  .replace(/[x×*]\s*\d+\s*(?:개|입|팩|봉|박스|매|병|캔|포|EA|ea)?/gu, ' ')
  .replace(/\d+(?:\.\d+)?\s*(?:kg|g|mL|ml|L|l|개월|개|입|팩|봉|박스|box|매|병|캔|포|EA|ea|세트)(?![A-Za-z가-힣])/gu, ' ')
  .replace(/,.*$/u, ' ')
  .replace(/\s+/gu, ' ')
  .trim()
  .slice(0, 40);
}
