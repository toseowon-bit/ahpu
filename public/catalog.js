// 어푸 가상 제품 카탈로그와 자녀 기준 대조 규칙.
// 보호자 앱(/)과 전체 화면 데모(/demo)가 같은 데이터·규칙을 쓰도록 한 곳에 둔다.
// 모든 제품·업체·회수 사례는 가상이다. 실제 식품 판단에 사용할 수 없다.

export const DATA_DATE = '2026-11-01';
// 식품 알레르기 표시 의무 19개 항목(PRD 기준). 이 밖의 항목은 '대조 불가'로 표시한다.
export const ALLERGENS = ['난류','우유','메밀','땅콩','대두','밀','고등어','게','새우','돼지고기','복숭아','토마토','아황산류','호두','닭고기','쇠고기','오징어','조개류','잣'];
export const CATEGORIES = ['이유식','유아식','간식','음료','유제품'];
export const ICONS = {이유식:'🥣',유아식:'🍚',간식:'🍘',음료:'🧃',유제품:'🥛'};

const P = (id,name,maker,category,stage,contains,may,extra={}) => ({id,name,maker,category,stage,contains,may,label:'provided',coupangId:null,checked:['2026-10-20','2026-10-24'],...extra});
export const PRODUCTS = [
 P('p01','쌀눈 소고기 미음','가상 햇살식품','이유식',6,['쇠고기'],[]),
 P('p02','달걀 노른자 진밥','가상 햇살식품','유아식',12,['난류','우유'],['밀'],{coupangId:'1001'}),
 P('p03','바삭 쌀과자 오리지널','가상 달빛식품','간식',9,[],['우유','대두']),
 P('p04','바삭 쌀과자 치즈맛','가상 달빛식품','간식',12,['우유'],['대두']),
 P('p05','고소한 아기 두유','가상 아침식품','음료',12,['대두'],[]),
 P('p06','사과 당근 퓨레','가상 초록식품','간식',6,[],[],{label:'partial'}),
 P('p07','단호박 오트밀죽','가상 초록식품','이유식',8,['밀'],['우유']),
 P('p08','닭고기 채소 진밥','가상 햇살식품','유아식',12,['닭고기'],[]),
 P('p09','아기 플레인 요거트','가상 바다유업','유제품',12,['우유'],[],{coupangId:'3003'}),
 P('p10','고구마 쌀 퍼프','가상 달빛식품','간식',9,[],[]),
 P('p11','배 도라지 주스','가상 아침식품','음료',12,[],[]),
 P('p12','흰살생선 채소죽','가상 바다유업','이유식',9,[],['새우','게']),
 P('p13','현미 소고기 이유식 2단계','가상 햇살식품','이유식',8,['쇠고기'],['우유']),
 P('p14','바나나 쌀과자','가상 달빛식품','간식',9,[],[]),
 P('p15','시금치 감자 진밥','가상 초록식품','유아식',12,[],[]),
 P('p16','유기농 쌀 미음','가상 초록식품','이유식',6,[],[])
];
export const BUNDLES = {'2002':['p03','p04','p10','p14']}; // 묶음·옵션 상품 → 후보 선택
export const RECALLS = [
 {pid:'p05',type:'판매중지',title:'[가상 사례] 표시사항 확인 필요에 따른 판매중지',agency:'식품안전나라 (가상 연계)',date:'2026-10-27',lot:'제조일자 2026-10-01 ~ 2026-10-05'},
 {pid:'p09',type:'회수',title:'[가상 사례] 기준 부적합 검사 결과에 따른 회수',agency:'식품안전나라 (가상 연계)',date:'2026-10-28',lot:'소비기한 2026-12-10'}
];
export const productById = id => PRODUCTS.find(p => p.id === id);
export const recallOf = pid => RECALLS.find(r => r.pid === pid);

export const STATUS = {
 match:{label:'일치 성분 있음',cls:'s-match',rank:5},
 may:{label:'혼입 가능성 표시 있음',cls:'s-may',rank:4},
 info:{label:'정보 부족',cls:'s-info',rank:3},
 na:{label:'대조 불가',cls:'s-na',rank:2},
 none:{label:'일치 성분 없음',cls:'s-none',rank:1},
 recall:{label:'회수·판매중지 해당',cls:'s-recall',rank:6},
 unreg:{label:'미등록',cls:'s-unreg',rank:0},
 nokid:{label:'자녀 미등록 · 대조 안 함',cls:'s-info',rank:0}
};

/** 한 자녀 기준으로 제품 표시를 대조한다. 정보가 없으면 '없음'이 아니라 '정보 부족'이다. */
export function compareChild(product, child) {
 const custom = child.custom || [];
 if (product.label !== 'provided') return {key:'info',text:'제품의 알레르기 표시 정보가 충분히 확보되지 않았습니다. 포장지 표시를 직접 확인해 주세요.'};
 const hit = product.contains.filter(a => child.allergens.includes(a));
 if (hit.length) return {key:'match',hit,text:`${hit.join(', ')} — 등록한 알레르기 항목과 같은 성분이 표시되어 있어요.`};
 const may = product.may.filter(a => child.allergens.includes(a));
 if (may.length) return {key:'may',hit:may,text:`${may.join(', ')} — 혼입 가능성(같은 제조시설 등) 표시가 있어요.`};
 if (custom.length) return {key:'na',text:`${custom.join(', ')}은(는) 표시 의무 19개 항목 밖이라 대조할 수 없어요. 원재료명을 직접 확인해 주세요.`};
 return {key:'none',text:'등록한 알레르기 항목과 일치하는 표시를 찾지 못했어요. 안전을 뜻하지 않으니 포장지를 확인해 주세요.'};
}

/** 등록한 모든 자녀 중 가장 주의가 필요한 상태. 회수가 있으면 회수가 우선이다. */
export function overallStatus(pid, children) {
 const p = productById(pid);
 if (!p) return 'unreg';
 if (recallOf(pid)) return 'recall';
 if (!children.length) return 'nokid'; // 대조할 자녀가 없으면 '일치 없음'으로 보이지 않게 한다
 return children.map(c => compareChild(p,c).key).sort((a,b)=>STATUS[b].rank-STATUS[a].rank)[0];
}

/** 같은 종류 중 모든 자녀 기준 함유·혼입 표시가 없고 회수되지 않은 제품. 월령 단계가 가까운 순. */
export function alternativesFor(p, children) {
 return PRODUCTS.filter(q => q.id !== p.id && q.category === p.category && q.label === 'provided' && !recallOf(q.id) &&
  children.every(c => !q.contains.some(a=>c.allergens.includes(a)) && !q.may.some(a=>c.allergens.includes(a))))
  .sort((a,b) => Math.abs(a.stage-p.stage) - Math.abs(b.stage-p.stage) || a.stage-b.stage);
}

/**
 * 검색창 입력을 해석한다. 쿠팡 상품 링크면 가상 카탈로그와 매칭하고, 아니면 제품명 검색어로 본다.
 * @returns {{kind:'query',q:string}|{kind:'product',pid:string}|{kind:'bundle',id:string}|{kind:'nomatch'}|{kind:'invalid'}|{kind:'not-coupang'}}
 */
export function parseLookup(input) {
 const v = String(input ?? '').trim();
 if (!/^https?:\/\//i.test(v)) return {kind:'query',q:v};
 let u; try { u = new URL(v); } catch { return {kind:'invalid'}; }
 if (!/(^|\.)coupang\.com$/.test(u.hostname)) return {kind:'not-coupang'};
 const id = (u.pathname.match(/products\/(\d+)/)||[])[1];
 const p = id && PRODUCTS.find(x=>x.coupangId===id);
 if (p) return {kind:'product',pid:p.id};
 if (id && Object.hasOwn(BUNDLES, id)) return {kind:'bundle',id};
 return {kind:'nomatch'};
}

/** 공백·대소문자를 무시하고 제품명+업체명에서 찾는다. */
export function searchProducts(q = '', cat = '') {
 const norm = s => String(s).replace(/\s/g,'').toLowerCase();
 return PRODUCTS.filter(p => (!cat || p.category===cat) && norm(p.name+p.maker).includes(norm(q)));
}
