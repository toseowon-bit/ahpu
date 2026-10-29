export const normalize = (text = '') => text.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko');
// 품목번호 + 업체 인허가번호 모두 정확히 일치할 때만 제품 연결.
// 제품 연결은 해당 소비자가 보유한 LOT가 회수 대상이라는 판정이 아니다.
export function matchProduct(product, event) {
  const a = product.identifiers, b = event.identifiers;
  if (a.reportNumber && b.reportNumber && a.reportNumber === b.reportNumber &&
      a.licenseNumber && b.licenseNumber && a.licenseNumber === b.licenseNumber) return 'identifier-match';
  if ((a.reportNumber && b.reportNumber && a.reportNumber !== b.reportNumber) ||
      (a.licenseNumber && b.licenseNumber && a.licenseNumber !== b.licenseNumber)) return 'none';
  if (normalize(product.name) === normalize(event.name) && normalize(product.manufacturer) === normalize(event.manufacturer)) return 'candidate';
  return 'none';
}
export function productSafety(product, events) {
  const matched = [], candidates = [];
  for (const event of events) {
    const match = matchProduct(product, event);
    if (match === 'identifier-match') matched.push({...event, match});
    if (match === 'candidate') candidates.push({...event, match});
  }
  return {status: matched.length ? 'records-found' : 'not-confirmed', events:matched, candidates,
    coverage:'예시 데이터만 조회. 실제 제품의 회수 여부 및 안전성을 확인할 수 없습니다.'};
}
