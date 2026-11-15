// 원재료명 문자열에서 알레르기 유발 항목(표시 의무 19개)과 관련된 표현을 찾는다.
// 주의: 이것은 '원재료명 안의 단어 찾기'이며 알레르기 표시나 혼입 가능성 판정이 아니다.
// 찾지 못했다고 해서 해당 성분이 없다는 뜻이 아니다(복합원재료 하위 성분, 표기 방식 차이 등).
export const ALLERGEN_KEYWORDS = {
 난류: ['난류', '계란', '달걀', '전란', '난백', '난황', '알부민'],
 우유: ['우유', '분유', '유청', '유당', '카제인', '카세인', '치즈', '버터', '크림', '연유', '요구르트', '요거트', '유크림', '유단백'],
 메밀: ['메밀'],
 땅콩: ['땅콩', '피넛'],
 대두: ['대두', '콩', '두유', '두부', '간장', '된장', '레시틴'],
 밀: ['밀', '소맥', '글루텐'],
 고등어: ['고등어'],
 게: ['게살', '꽃게', '대게', '게'],
 새우: ['새우'],
 돼지고기: ['돼지', '돈육', '돈지', '라드', '젤라틴(돼지'],
 복숭아: ['복숭아'],
 토마토: ['토마토'],
 아황산류: ['아황산', '이산화황', '메타중아황산'],
 호두: ['호두'],
 닭고기: ['닭', '계육', '치킨'],
 쇠고기: ['쇠고기', '소고기', '우육', '우지'],
 오징어: ['오징어'],
 조개류: ['조개', '굴', '전복', '홍합', '바지락', '가리비', '키조개'],
 잣: ['잣']
};

// 한 글자 키워드는 오탐을 줄이려고 원재료 항목(쉼표·괄호로 나눈 조각) 안에서만 찾는다.
// 예외 단어: 한 글자 키워드를 포함하지만 해당 알레르기와 무관한 흔한 원재료.
const EXCLUDE = {
 콩: ['강낭콩', '완두콩', '녹두', '팥'],
 밀: ['밀감'],
 게: ['게르마늄']
};

const splitParts = (text) => String(text || '').split(/[,，、()（）\[\]{}·/]/u).map(s => s.trim()).filter(Boolean);

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
   for (const word of words) {
    if (!part.includes(word)) continue;
    if ((EXCLUDE[word] || []).some(ex => part.includes(ex) && !part.replace(new RegExp(ex, 'gu'), '').includes(word))) continue;
    const key = allergen + '|' + part;
    if (!seen.has(key)) { seen.add(key); found.push({allergen, word, part}); }
    break;
   }
  }
 };
 for (const a of allergens) if (ALLERGEN_KEYWORDS[a]) check(a, ALLERGEN_KEYWORDS[a]);
 for (const w of customWords) if (w && w.trim()) check(w.trim(), [w.trim()]);
 return found;
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
