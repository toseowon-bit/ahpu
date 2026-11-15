// 어푸 데모 — 가상 데이터만 사용하는 화면 시연용 단일 페이지 앱.
// 서버 전송 없음. 상태는 이 브라우저의 localStorage에만 저장(실패해도 동작).

const STORE_KEY = 'ahpu-demo-v1';
const DATA_DATE = '2026-11-01';
// 식품 알레르기 표시 의무 19개 항목(PRD 기준). 이 밖의 항목은 '대조 불가'로 표시한다.
const ALLERGENS = ['난류','우유','메밀','땅콩','대두','밀','고등어','게','새우','돼지고기','복숭아','토마토','아황산류','호두','닭고기','쇠고기','오징어','조개류','잣'];
const CATEGORIES = ['이유식','유아식','간식','음료','유제품'];
const PROBLEM_TYPES = ['표시와 다른 성분','알레르기 유발 성분 혼입 의심','이물 발견','기타 표시 오류'];
const REJECT_REASONS = ['근거 없는 비방 또는 허위 사실','개인정보 포함','욕설·혐오 표현','항의 대상 제품과 무관한 내용'];
const MAKERS = ['가상 햇살식품','가상 초록식품','가상 달빛식품','가상 아침식품','가상 바다유업'];
const ICONS = {이유식:'🥣',유아식:'🍚',간식:'🍘',음료:'🧃',유제품:'🥛'};

const P = (id,name,maker,category,stage,contains,may,extra={}) => ({id,name,maker,category,stage,contains,may,label:'provided',coupangId:null,checked:['2026-10-20','2026-10-24'],...extra});
const PRODUCTS = [
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
const BUNDLES = {'2002':['p03','p04','p10','p14']}; // 묶음·옵션 상품 → 후보 선택
const RECALLS = [
 {pid:'p05',type:'판매중지',title:'[가상 사례] 표시사항 확인 필요에 따른 판매중지',agency:'식품안전나라 (가상 연계)',date:'2026-10-27',lot:'제조일자 2026-10-01 ~ 2026-10-05'},
 {pid:'p09',type:'회수',title:'[가상 사례] 기준 부적합 검사 결과에 따른 회수',agency:'식품안전나라 (가상 연계)',date:'2026-10-28',lot:'소비기한 2026-12-10'}
];
const productById = id => PRODUCTS.find(p => p.id === id);
const recallOf = pid => RECALLS.find(r => r.pid === pid);

function seedState() {
 return {
  consent:false, children:[], favorites:[], history:[], premium:false, joined:[], notices:[], reports:[], reviewLog:[],
  role:'guardian', makerSession:null,
  complaints:[
   {id:'c1',pid:'p03',type:'알레르기 유발 성분 혼입 의심',status:'delivered',count:23,createdAt:'2026-10-30',deliveredAt:'2026-10-31',summary:'혼입 가능성 표시 문구가 온라인 상세페이지와 포장지에서 서로 다르게 보입니다. 표시 기준을 확인해 주시기 바랍니다.',answer:null},
   {id:'c2',pid:'p09',type:'표시와 다른 성분',status:'answered',count:41,createdAt:'2026-10-12',deliveredAt:'2026-10-13',summary:'원재료명 표시 순서와 온라인 안내 문구가 다릅니다.',answer:{title:'원재료 표시 안내에 대한 공식 답변',body:'[가상 답변] 문의 주신 표시 차이는 온라인 상세페이지 갱신이 늦어져 발생했습니다. 포장지 표시가 최신 기준이며, 상세페이지는 수정을 완료했습니다. 구매하신 제품의 포장 표시를 함께 확인해 주시기 바랍니다.',maker:'가상 바다유업',at:'2026-10-20',adds:[]}},
   {id:'c3',pid:'p01',type:'이물 발견',status:'delivered',count:9,createdAt:'2026-11-03',deliveredAt:'2026-11-04',summary:'개봉 시 작은 검은 입자가 보였다는 의견이 모였습니다. 제조 공정 확인을 요청드립니다.',answer:null},
   {id:'c4',pid:'p07',type:'기타 표시 오류',status:'review',count:1,createdAt:'2026-11-12',summary:'소비기한 표시가 잘 보이지 않는 위치에 인쇄되어 있습니다.',answer:null},
   {id:'c5',pid:'p13',type:'표시와 다른 성분',status:'review',count:1,createdAt:'2026-11-08',summary:'단계 표기와 권장 월령 표시가 서로 다르게 적혀 있습니다.',answer:null}
  ],
  accounts:[
   {id:'a1',company:'가상 햇살식품',bizNo:'101-00-00001',manager:'김햇살',email:'cs@haetsal.example',status:'approved',at:'2026-09-02',reason:''},
   {id:'a2',company:'가상 바다유업',bizNo:'101-00-00005',manager:'박바다',email:'cs@badamilk.example',status:'approved',at:'2026-09-15',reason:''},
   {id:'a3',company:'가상 달빛식품',bizNo:'101-00-00003',manager:'이달빛',email:'cs@dalbit.example',status:'pending',at:'2026-11-06',reason:''},
   {id:'a4',company:'가상 초록식품',bizNo:'101-00-00002',manager:'최초록',email:'hello@freemail.example',status:'pending',at:'2026-11-10',reason:''},
   {id:'a5',company:'가상 아침식품',bizNo:'101-00-00004',manager:'정아침',email:'cs@achim.example',status:'rejected',at:'2026-10-21',reason:'사업자등록증과 신청 업체명이 일치하지 않음'}
  ]
 };
}
let S;
try { S = {...seedState(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}')}; } catch { S = seedState(); }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { /* 저장 불가 환경: 메모리로만 동작 */ } };

// ---------- helpers ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0,10);
const uid = p => p + Math.random().toString(36).slice(2,8);
const $ = s => document.querySelector(s);
const seal = (cls='seal') => `<svg class="${cls}" aria-hidden="true"><use href="#seal"/></svg>`;
function toast(msg) { const el=document.createElement('div'); el.textContent=msg; $('#toast').append(el); setTimeout(()=>el.remove(),3200); }
function notify(text, go) { S.notices.unshift({id:uid('n'),text,go,at:today(),read:false}); }
const go = h => { if (location.hash === '#'+h) route(); else location.hash = h; };

const STATUS = {
 match:{label:'일치 성분 있음',cls:'s-match',rank:5},
 may:{label:'혼입 가능성 표시 있음',cls:'s-may',rank:4},
 info:{label:'정보 부족',cls:'s-info',rank:3},
 na:{label:'대조 불가',cls:'s-na',rank:2},
 none:{label:'일치 성분 없음',cls:'s-none',rank:1},
 recall:{label:'회수·판매중지 해당',cls:'s-recall',rank:6},
 unreg:{label:'미등록',cls:'s-unreg',rank:0}
};
const CSTATUS = {review:['접수 · 검수 중','s-review'],delivered:['전달됨 · 답변 대기','s-delivered'],answered:['답변 완료','s-answered'],rejected:['반려','s-rejected']};
const badge = key => `<span class="badge ${STATUS[key].cls}">${STATUS[key].label}</span>`;
const cbadge = st => `<span class="badge ${CSTATUS[st][1]}">${CSTATUS[st][0]}</span>`;

function compareChild(product, child) {
 const custom = child.custom || [];
 if (product.label !== 'provided') return {key:'info',text:'제품의 알레르기 표시 정보가 충분히 확보되지 않았습니다. 포장지 표시를 직접 확인해 주세요.'};
 const hit = product.contains.filter(a => child.allergens.includes(a));
 if (hit.length) return {key:'match',hit,text:`${hit.join(', ')} — 등록한 알레르기 항목과 같은 성분이 표시되어 있어요.`};
 const may = product.may.filter(a => child.allergens.includes(a));
 if (may.length) return {key:'may',hit:may,text:`${may.join(', ')} — 혼입 가능성(같은 제조시설 등) 표시가 있어요.`};
 if (custom.length) return {key:'na',text:`${custom.join(', ')}은(는) 표시 의무 19개 항목 밖이라 대조할 수 없어요. 원재료명을 직접 확인해 주세요.`};
 return {key:'none',text:'등록한 알레르기 항목과 일치하는 표시를 찾지 못했어요. 안전을 뜻하지 않으니 포장지를 확인해 주세요.'};
}
function overall(pid) {
 const p = productById(pid);
 if (!p) return 'unreg';
 if (recallOf(pid)) return 'recall';
 if (!S.children.length) return p.label === 'provided' ? 'none' : 'info';
 return S.children.map(c => compareChild(p,c).key).sort((a,b)=>STATUS[b].rank-STATUS[a].rank)[0];
}
function alternatives(p) {
 return PRODUCTS.filter(q => q.id !== p.id && q.category === p.category && q.label === 'provided' && !recallOf(q.id) &&
  S.children.every(c => !q.contains.some(a=>c.allergens.includes(a)) && !q.may.some(a=>c.allergens.includes(a))))
  .sort((a,b) => Math.abs(a.stage-p.stage) - Math.abs(b.stage-p.stage) || a.stage-b.stage);
}
const isFav = pid => S.favorites.some(f => f.pid === pid);
const ageText = c => `만 ${c.age}세`;

// ---------- navigation ----------
const NAV = {
 guardian:[
  ['진입·프로필 등록',[['onboarding','온보딩·고지'],['profile-new','자녀 프로필 등록']]],
  ['상품 대조·결과 확인',[['home','홈'],['candidates/2002','후보 상품 선택'],['search','제품명 검색'],['unregistered','미등록 제품 안내'],['result/p02','대조 결과'],['alternatives/p02','대안 제품 추천']]],
  ['프로필·관심 제품',[['profiles','자녀 프로필 관리'],['favorites','관심 제품 목록']]],
  ['공동 항의·답변 (프리미엄)',[['premium','프리미엄 안내'],['complaints','공동 항의 목록'],['complain/p03','공동 항의 개설·참여'],['my-complaints','내 항의 목록'],['answer/c2','공식 답변 확인']]]
 ],
 operator:[['운영자 검수·계정 확인',[['op-review','검수 대기 목록'],['op-review/c5','항의 검수 상세'],['op-apps','제조업체 계정 신청 목록'],['op-apps/a3','계정 신청 검토']]]],
 maker:[['제조업체 답변 채널',[['mk-login','제조업체 로그인'],['mk-signup','가입 신청'],['mk-complaints','공동 항의 목록'],['mk-answer/c1','공식 답변 작성']]]]
};
const ROLE_HOME = {guardian:'home',operator:'op-review',maker:'mk-login'};
const ROLE_OF = r => r.startsWith('op-') ? 'operator' : r.startsWith('mk-') ? 'maker' : 'guardian';

function renderChrome(route) {
 const role = ROLE_OF(route);
 S.role = role;
 $('#roles').innerHTML = [['guardian','보호자'],['operator','운영자'],['maker','제조업체']].map(([k,l]) => `<button type="button" data-act="role" data-role="${k}" aria-pressed="${k===role}">${l}</button>`).join('');
 let n = 0;
 $('#side').innerHTML = NAV[role].map(([title,items]) => `<h4>${title}</h4>` + items.map(([r,l]) => { n++; const cur = route===r || route.split('/')[0]===r.split('/')[0]; return `<a href="#/${r}" ${cur?'aria-current="page"':''}><span class="n">${String(n).padStart(2,'0')}</span>${l}</a>`; }).join('')).join('')
  + `<div class="reset"><p>데모 상태는 이 브라우저에만 저장됩니다.</p><button type="button" data-act="reset">데모 초기화</button></div>`;
 const unread = S.notices.filter(x=>!x.read).length;
 $('#top-actions').innerHTML = role==='guardian'
  ? `<a class="icon-btn" href="#/notifications" aria-label="알림 ${unread}건">🔔<span class="wide-only"> 알림</span>${unread?`<span class="dot">${unread}</span>`:''}</a><span class="badge ${S.premium?'s-answered':'s-info'}">${S.premium?'프리미엄':'무료'}</span>`
  : role==='maker' && S.makerSession ? `<span class="small muted">${esc(accountById(S.makerSession)?.company)}</span><button class="icon-btn" data-act="mk-logout">로그아웃</button>` : '';
}

// ---------- screens: guardian ----------
const disclaimer = (extra='') => `<p class="disclaimer">이 결과는 안전을 보증하지 않습니다. 어푸는 보호자가 다시 확인할 항목을 보여줄 뿐, 섭취 가능 여부를 판단하지 않습니다. 구매 전·섭취 전 실제 포장지 표시를 직접 확인하세요. ${extra}</p>`;
const commission = '<p class="commission">이 링크로 구매하면 어푸가 쿠팡 파트너스 수수료를 받습니다. 대조 결과와 추천 순서는 수수료와 무관합니다.</p>';

const screens = {};
screens.onboarding = () => `<div class="onboard card">${seal()}<h1>사용 전 확인해 주세요</h1>
 <ul class="mt"><li><strong>어푸는 알레르기를 진단하지 않습니다.</strong></li><li>의사 진단을 받았거나 식이 제한 중인 0~6세 자녀의 보호자를 위한 앱입니다.</li><li>대조 결과는 안전을 보증하지 않으며, <strong>다시 확인할 항목</strong>을 보여줍니다.</li><li>구매 전·섭취 전 포장지 표시를 직접 확인하세요.</li><li>자녀 정보(별칭·알레르기 항목)는 이 기기에만 저장되며 쿠팡에 전송되지 않습니다. 회원가입은 없습니다.</li></ul>
 <form data-form="consent"><label class="check"><input type="checkbox" name="agree" required> 위 내용을 확인했습니다</label>
 <button class="btn block">동의하고 자녀 등록하기</button></form>
 <p class="hint">빠르게 둘러보려면 <button class="link" data-act="sample">예시 자녀 2명으로 시작</button>할 수 있어요.</p></div>`;

const allergenFields = (c={allergens:[],custom:[]}) => `<fieldset class="fieldset"><label>진단받은 알레르기 항목 (표시 의무 19개)</label><div class="allergen-grid">${ALLERGENS.map(a=>`<label><input type="checkbox" name="allergens" value="${a}" ${c.allergens.includes(a)?'checked':''}>${a}</label>`).join('')}</div></fieldset>
 <label for="custom">그 밖의 알레르기 (쉼표로 구분, 선택)</label><input type="text" id="custom" name="custom" maxlength="60" value="${esc((c.custom||[]).join(', '))}" placeholder="예: 키위, 바나나"><p class="hint">19개 밖 항목은 제품 표시와 자동 대조할 수 없어 ‘대조 불가’로 안내됩니다.</p>`;
const ageSelect = v => `<select name="age" id="age">${[0,1,2,3,4,5,6].map(a=>`<option value="${a}" ${+v===a?'selected':''}>만 ${a}세</option>`).join('')}</select>`;

screens['profile-new'] = () => {
 if (!S.consent) return screens.onboarding();
 return `<div class="page"><div class="crumb">진입·프로필 등록</div><h1>자녀 프로필 등록</h1><p class="lead">등록한 모든 자녀를 한 번에 대조합니다. 입력한 정보는 이 기기에만 저장됩니다.</p>
 <form class="card" data-form="profile-new"><label for="alias">자녀 별칭</label><input type="text" id="alias" name="alias" required maxlength="10" placeholder="예: 첫째, 콩이">
 <label for="age">나이</label>${ageSelect(1)}${allergenFields()}
 <p class="hint">이 앱은 진단을 대신하지 않습니다. 의사 진단 결과를 기준으로 선택하세요.</p><button class="btn block mt">프로필 저장</button></form></div>`;
};

screens.home = () => {
 if (!S.consent) return screens.onboarding();
 if (!S.children.length) return screens['profile-new']();
 const mine = S.complaints.filter(c=>S.joined.includes(c.id)).slice(0,3);
 return `<div class="page"><section class="hero"><div><div class="small muted">우리 아이 기준으로, 확인은 더 쉽게.</div><h1>오늘도 아이 기준으로<br>하나씩 확인해요.</h1>
 <form data-form="lookup"><label for="q" class="small">쿠팡 상품 링크 붙여넣기 또는 제품명 검색</label><div class="searchbox"><input type="search" id="q" name="q" required maxlength="200" placeholder="https://www.coupang.com/vp/products/… 또는 제품명"><button class="btn">대조 시작</button></div></form>
 <div class="examples">예시 링크: <button data-act="fill" data-v="https://www.coupang.com/vp/products/1001">…/1001 (바로 매칭)</button><button data-act="fill" data-v="https://www.coupang.com/vp/products/2002">…/2002 (묶음 상품)</button><button data-act="fill" data-v="https://www.coupang.com/vp/products/3003">…/3003 (회수 사례)</button><button data-act="fill" data-v="https://www.coupang.com/vp/products/9999">…/9999 (매칭 실패)</button></div></div>${seal('seal seal-big')}</section>
 <div class="grid2"><section class="card"><div class="between"><h2>자녀 프로필</h2><a href="#/profiles" class="small">관리</a></div><ul class="list">${S.children.map(c=>`<li><div class="item-main"><div class="thumb">${esc(c.alias[0])}</div><div><strong>${esc(c.alias)}</strong> <span class="meta">${ageText(c)}</span><div class="meta">${esc([...c.allergens,...(c.custom||[])].join(' · ')||'등록 항목 없음')}</div></div></div></li>`).join('')}</ul></section>
 <section class="card"><div class="between"><h2>최근 대조</h2><a href="#/favorites" class="small">관심 제품 ${S.favorites.length}개</a></div>${S.history.length?`<ul class="list">${S.history.slice(0,4).map(h=>{const p=productById(h.pid);return `<li><div class="item-main"><div><a href="#/result/${p.id}"><strong>${esc(p.name)}</strong></a><div class="meta">${h.at} 대조</div></div></div>${badge(overall(p.id))}</li>`;}).join('')}</ul>`:'<p class="muted small">아직 대조한 제품이 없어요. 위 예시 링크로 시작해 보세요.</p>'}</section></div>
 <section class="card"><div class="between"><h2>내 항의 현황</h2><a href="#/my-complaints" class="small">전체 보기</a></div>${mine.length?`<ul class="list">${mine.map(c=>`<li><div><strong>${esc(productById(c.pid).name)}</strong><div class="meta">${esc(c.type)} · 참여자 ${c.count}명</div></div>${cbadge(c.status)}</li>`).join('')}</ul>`:`<p class="muted small">참여한 공동 항의가 없어요. ${S.premium?'':'공동 항의는 프리미엄 기능입니다.'}</p>`}</section>
 ${disclaimer(`데이터 기준일 ${DATA_DATE}.`)}</div>`;
};

screens.candidates = id => {
 const ids = BUNDLES[id] || BUNDLES['2002'];
 return `<div class="page"><div class="crumb"><a href="#/home">홈</a> › 쿠팡 링크 매칭</div><h1>후보 상품 선택</h1><p class="lead">공유한 링크가 묶음·옵션 상품이에요. 제품명·제조사를 확인하고 대조할 제품을 골라 주세요.</p>
 <ul class="list card">${ids.map(pid=>{const p=productById(pid);return `<li><div class="item-main"><div class="thumb">${ICONS[p.category]}</div><div><strong>${esc(p.name)}</strong><div class="meta">제조사: ${esc(p.maker)} · ${p.category} · ${p.stage}개월 이상</div></div></div><a class="btn sm" href="#/result/${p.id}">이 제품으로 대조</a></li>`;}).join('')}</ul>
 <div class="card soft"><h3>찾는 제품이 목록에 없나요?</h3><p class="small muted">제품명으로 검색하거나, 미등록 제품을 알려 주세요.</p><div class="row"><a class="btn ghost sm" href="#/search">제품명으로 검색</a><a class="btn ghost sm" href="#/unregistered">미등록 제품 안내</a></div></div>
 <p class="small muted">쿠팡 파트너스 API 매칭은 데모에서 시뮬레이션됩니다.</p></div>`;
};

screens.search = (_, params) => {
 const q = params.get('q') || '', cat = params.get('cat') || '';
 const norm = s => s.replace(/\s/g,'').toLowerCase();
 const items = PRODUCTS.filter(p => (!cat || p.category===cat) && norm(p.name+p.maker).includes(norm(q)));
 const qs = (c) => `#/search?${new URLSearchParams({...(q?{q}:{}),...(c?{cat:c}:{})})}`;
 return `<div class="page"><div class="crumb"><a href="#/home">홈</a> › 제품 검색</div><h1>제품명 검색</h1><p class="lead">${params.get('fail')?'<strong>공유한 링크와 일치하는 제품을 찾지 못했어요.</strong> 제품명으로 검색해 보세요. ':''}제품명이나 제조사를 입력하세요.</p>
 <form data-form="search" class="searchbox"><input type="search" name="q" value="${esc(q)}" maxlength="100" placeholder="예: 쌀과자, 햇살" aria-label="제품명 검색"><input type="hidden" name="cat" value="${esc(cat)}"><button class="btn">검색</button></form>
 <div class="chips mt">${['',...CATEGORIES].map(c=>`<a class="chip ${c===cat?'on':''}" href="${qs(c)}">${c||'전체'}</a>`).join('')}</div>
 ${items.length?`<div class="card table-wrap"><table><thead><tr><th>제품명</th><th>제조사</th><th>표시 알레르기</th><th>우리 아이 기준</th><th></th></tr></thead><tbody>${items.map(p=>`<tr><td><strong>${esc(p.name)}</strong><div class="meta">${p.category} · ${p.stage}개월+</div></td><td>${esc(p.maker)}</td><td>${p.label==='provided'?esc(p.contains.join(', ')||'—'):'정보 부족'}</td><td>${badge(overall(p.id))}</td><td class="right"><a class="btn sm ghost nowrap" href="#/result/${p.id}">대조 결과</a></td></tr>`).join('')}</tbody></table></div>`
 :`<div class="card empty">${seal()}<h3>검색 결과가 없어요</h3><p>어푸 제품 데이터에 아직 없는 제품일 수 있어요.</p><a class="btn" href="#/unregistered?name=${encodeURIComponent(q)}">미등록 제품 안내</a></div>`}
 <p class="hint">미등록 제품은 대조할 수 없어요. 포장지의 알레르기 표시를 직접 확인하세요. 데이터 기준일 ${DATA_DATE}.</p></div>`;
};

screens.unregistered = (_, params) => `<div class="page"><div class="crumb"><a href="#/home">홈</a> › 미등록 제품</div>
 <div class="card"><span class="badge s-unreg">미등록</span><h1 class="mt">등록되지 않은 제품입니다</h1><p>${params.get('name')?`‘${esc(params.get('name'))}’은(는) `:''}어푸 제품 데이터에 아직 없어 자녀 기준 대조를 진행할 수 없습니다. <strong>대조 결과가 없다는 것은 안전하다는 뜻이 아닙니다.</strong></p>
 <h3 class="mt">이렇게 확인해 보세요</h3><ul><li>제품명·제조사가 정확한지 다시 확인해 주세요.</li><li>포장지의 원재료명과 알레르기 표시를 직접 확인하세요.</li><li>식품안전나라에서 회수·판매중지 원문을 조회할 수 있어요.</li></ul>
 <div class="row mt"><a class="btn ghost" href="#/search">다시 검색</a><button class="btn" data-act="report" data-name="${esc(params.get('name')||'')}">미등록 제품 알리기</button></div></div></div>`;

screens.result = pid => {
 const p = productById(pid);
 if (!p) return screens.unregistered(null,new URLSearchParams());
 if (!S.history.some(h=>h.pid===pid && h.at===today())) { S.history = [{pid,at:today()},...S.history.filter(h=>h.pid!==pid)].slice(0,20); save(); }
 const rc = recallOf(pid);
 const rows = S.children.map(c => ({c,r:compareChild(p,c)}));
 const anyHit = rows.some(x=>x.r.key==='match'||x.r.key==='may');
 const alts = anyHit ? alternatives(p) : [];
 const allLabeled = [...p.contains.map(a=>[a,'함유']),...p.may.map(a=>[a,'혼입 가능성 표시'])];
 return `<div class="page"><div class="crumb"><a href="#/home">홈</a> › 대조 결과</div>
 <div class="between"><div><h1>${esc(p.name)}</h1><p class="muted">${esc(p.maker)} · ${p.category} · ${p.stage}개월 이상</p></div>
 <div class="row"><button class="btn ghost sm" data-act="fav" data-pid="${p.id}">${isFav(p.id)?'★ 관심 제품 해제':'☆ 관심 제품 저장'}</button><button class="btn ghost sm" data-act="report" data-name="${esc(p.name)}">오류 신고</button></div></div>
 ${rc?`<div class="recall-banner" role="alert"><span class="badge s-recall">${STATUS.recall.label}</span><h3 class="mt">${esc(rc.type)} 정보가 있어요</h3><p class="mb0">${esc(rc.title)} · 대상: ${esc(rc.lot)} · ${rc.date}</p><p class="small mb0">제품명·제조일자·소비기한이 회수 대상과 같은지 확인해 주세요.</p></div>`:''}
 <section class="card"><h2>자녀별 대조 요약</h2><div class="status-list">${rows.length?rows.map(({c,r})=>`<div class="child-card st-${r.key}"><div class="avatar">${esc(c.alias[0])}</div><div><div class="row"><strong>${esc(c.alias)}</strong><span class="meta">${ageText(c)}</span>${badge(r.key)}</div><p class="small mb0">${esc(r.text)}</p></div></div>`).join(''):`<p class="muted">등록된 자녀가 없어 대조할 수 없어요. <a href="#/profile-new">자녀 등록</a></p>`}</div></section>
 <section class="card"><h2>식품 표시 성분 확인</h2>${p.label!=='provided'?'<p class="muted">이 제품은 알레르기 표시 정보가 부족해 성분 대조를 하지 않았어요. 추정하지 않습니다.</p>':allLabeled.length?`<div class="table-wrap"><table><thead><tr><th>성분</th><th>표시 형태</th><th>해당 자녀</th></tr></thead><tbody>${allLabeled.map(([a,f])=>{const who=S.children.filter(c=>c.allergens.includes(a)).map(c=>c.alias);return `<tr><td><strong>${a}</strong></td><td>${f}</td><td>${who.length?`<span class="badge ${f==='함유'?'s-match':'s-may'}">${esc(who.join(', '))}</span>`:'<span class="muted">—</span>'}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="muted">표시 의무 19개 항목 중 표시된 알레르기 유발 성분이 없어요.</p>'}
 <p class="hint">출처: 쿠팡 상세페이지 자동 수집 + 공공 데이터 이중 확인(가상) · 1차 확인 ${p.checked[0]} · 재확인 ${p.checked[1]} · 데이터 기준일 ${DATA_DATE}</p></section>
 <section class="card"><h2>공공 안전정보</h2>${rc?`<div class="table-wrap"><table><thead><tr><th>공고명</th><th>기관</th><th>고시일</th><th>구분</th></tr></thead><tbody><tr><td>${esc(rc.title)}</td><td>${esc(rc.agency)}</td><td>${rc.date}</td><td>${badge('recall')}</td></tr></tbody></table></div>`:'<p class="mb0">데이터 기준일 현재 이 제품과 연결된 회수·판매중지 정보가 없어요.</p><p class="hint">정보가 없다는 것이 안전을 뜻하지 않습니다.</p>'}<p class="hint">식품안전나라 회수·판매중지 Open API 연계 예정 · 데모는 가상 사례입니다.</p></section>
 <section class="card soft"><h2>다시 확인할 항목</h2><ul class="mb0"><li>받은 제품 포장지의 원재료명·알레르기 표시와 혼입 가능성 문구를 직접 확인하세요.</li><li>온라인 정보와 실제 포장이 다를 수 있어요. 제조일자·소비기한을 확인하세요.</li>${rows.some(x=>x.r.key==='na')?'<li>표시 의무 밖 알레르기 항목은 원재료명을 직접 읽어 확인하세요.</li>':''}<li>섭취 가능 여부는 자녀 주치의와 상의하세요.</li></ul></section>
 <div class="grid2"><section class="card"><h2>구매하기</h2><button class="btn block" data-act="buy">쿠팡에서 보기</button>${commission}${anyHit?`<a class="btn ghost block mt" href="#/alternatives/${p.id}">다시 확인해 볼 대안 제품 ${alts.length}개</a>`:''}</section>
 <section class="card"><h2>이 제품에 문제가 있었나요?</h2><p class="small muted">같은 문제를 겪은 보호자와 함께 제조업체에 의견을 전달할 수 있어요. <span class="badge s-info">프리미엄</span></p><a class="btn ghost block" href="#/complain/${p.id}">공동 항의하기</a></section></div>
 ${disclaimer()}</div>`;
};

screens.alternatives = pid => {
 const p = productById(pid); if (!p) return screens.unregistered(null,new URLSearchParams());
 const alts = alternatives(p);
 return `<div class="page"><div class="crumb"><a href="#/result/${p.id}">대조 결과</a> › 대안 제품</div><h1>다시 확인해 볼 대안 제품</h1>
 <p class="lead">‘${esc(p.name)}’과 같은 종류(${p.category}) 중, <strong>등록된 모든 자녀</strong> 기준으로 일치·혼입 가능성 표시가 확인되지 않고 회수·판매중지에 해당하지 않는 제품을 월령 단계가 가까운 순으로 보여줍니다.</p>
 <div class="card warn small">이 목록은 적합성이나 안전을 보증하지 않습니다. 구매 전·섭취 전 포장지 표시를 직접 확인하세요.</div>
 ${alts.length?`<ul class="list card">${alts.map(q=>`<li><div class="item-main"><div class="thumb">${ICONS[q.category]}</div><div><strong>${esc(q.name)}</strong><div class="meta">${esc(q.maker)} · ${q.stage}개월 이상 · 데이터 기준일 ${DATA_DATE}</div></div></div><div class="row">${badge('none')}<a class="btn sm ghost" href="#/result/${q.id}">대조 결과</a></div></li>`).join('')}</ul>${commission}`
 :`<div class="card empty">${seal()}<h3>조건에 맞는 대안 제품이 없어요</h3><p>모든 자녀 기준을 동시에 만족하는 같은 종류 제품을 찾지 못했어요.</p></div>`}</div>`;
};

screens.profiles = () => `<div class="page"><h1>자녀 프로필 관리</h1><p class="lead">별칭·나이·알레르기 항목을 수정하거나 삭제할 수 있어요. 이 기기에만 저장됩니다.</p>
 <ul class="list card">${S.children.map(c=>`<li><div class="item-main"><div class="thumb">${esc(c.alias[0])}</div><div><strong>${esc(c.alias)}</strong> <span class="meta">${ageText(c)} · 알레르기 ${c.allergens.length+(c.custom||[]).length}개</span><div class="meta">${esc([...c.allergens,...(c.custom||[])].join(' · ')||'—')}</div></div></div><div class="row"><button class="btn sm ghost" data-act="edit-child" data-id="${c.id}">수정</button><button class="btn sm ghost" data-act="del-child" data-id="${c.id}">삭제</button></div></li>`).join('')||'<li class="muted">등록된 자녀가 없어요.</li>'}</ul>
 <a class="btn" href="#/profile-new">+ 자녀 추가</a>${disclaimer()}</div>`;

screens.favorites = (_, params) => {
 const f = params.get('f') || '';
 const filters = [['','전체'],['match','일치 성분 있음'],['may','혼입 가능성'],['info','정보 부족'],['na','대조 불가'],['recall','회수·판매중지'],['none','일치 성분 없음']];
 const items = S.favorites.filter(x => !f || overall(x.pid)===f);
 return `<div class="page"><h1>관심 제품 목록</h1><p class="lead">자주 사는 제품을 저장해 두고 최신 기준으로 다시 확인하세요.</p>
 <div class="chips">${filters.map(([k,l])=>`<a class="chip ${k===f?'on':''}" href="#/favorites${k?'?f='+k:''}">${l}</a>`).join('')}</div>
 ${items.length?`<ul class="list card">${items.map(x=>{const p=productById(x.pid);return `<li><div class="item-main"><div class="thumb">${ICONS[p.category]}</div><div><strong>${esc(p.name)}</strong><div class="meta">${esc(p.maker)} · 저장일 ${x.at} · 데이터 기준일 ${DATA_DATE}</div></div></div><div class="row">${badge(overall(p.id))}<a class="btn sm ghost" href="#/result/${p.id}">대조 결과</a><button class="btn sm ghost" data-act="unfav" data-pid="${p.id}">삭제</button></div></li>`;}).join('')}</ul>`
 :`<div class="card empty">${seal()}<h3>${f?'해당 상태의 관심 제품이 없어요':'저장한 관심 제품이 없어요'}</h3><p>대조 결과 화면에서 ☆ 관심 제품 저장을 누르세요.</p></div>`}
 ${disclaimer()}</div>`;
};

screens.premium = () => `<div class="page"><div class="premium-hero"><div class="small">어푸 프리미엄 · 2027년 하반기 정식 출시 예정 기능</div><h1>같은 문제, 함께 전달해요.</h1><p>보호자 한 사람의 항의는 묻히기 쉬워요. 같은 제품·같은 문제를 겪은 보호자의 의견을 하나로 모아 제조업체에 전달하고, 공식 답변을 한 번에 받아요.</p>${seal()}</div>
 <div class="grid3"><div class="card feature"><h3>공동 항의 개설·참여</h3><p class="small muted">같은 제품·같은 문제 유형의 열린 항의가 있으면 새로 만들지 않고 참여해요.</p></div><div class="card feature"><h3>공식 답변 일괄 전달</h3><p class="small muted">확인된 제조업체 담당자의 공식 답변 한 건을 참여자 모두가 같은 내용으로 받아요.</p></div><div class="card feature"><h3>진행 상황 확인</h3><p class="small muted">‘내 항의’에서 접수·전달·답변 상태를 보고, 답변이 오면 알림을 받아요.</p></div></div>
 <div class="card"><h3>이용 안내</h3><ul class="small mb0"><li>새로 여는 공동 항의는 운영자 검수 후 제조업체에 전달돼요. 사실 여부를 판정하지는 않아요.</li><li>이미 참여한 항의에는 다시 참여할 수 없어요.</li><li>제조업체는 참여자 수와 문제 유형·항의 내용만 보며, 참여자 개인정보는 볼 수 없어요.</li><li>보상·환불 처리, 법적 분쟁 대리, 제조업체와의 1:1 대화는 포함하지 않아요.</li></ul></div>
 <div class="card ${S.premium?'notice':''}">${S.premium?`<h3>프리미엄 이용 중 (데모)</h3><div class="row"><a class="btn" href="#/complaints">공동 항의 보러 가기</a><button class="btn ghost" data-act="premium-off">무료로 되돌리기</button></div>`:`<h3>데모에서는 결제 없이 프리미엄을 켤 수 있어요</h3><button class="btn" data-act="premium-on">프리미엄 시작하기 (데모 · 결제 없음)</button>`}</div></div>`;

const premiumGate = () => `<div class="page"><div class="card warn"><h2>프리미엄 기능이에요</h2><p>공동 항의 개설·참여는 프리미엄 보호자만 이용할 수 있어요.</p><a class="btn" href="#/premium">프리미엄 안내 보기</a></div></div>`;

screens.complaints = (_, params) => {
 const st = params.get('st') || '';
 const pub = S.complaints.filter(c => ['delivered','answered'].includes(c.status) && (!st || c.status===st));
 return `<div class="page"><h1>공동 항의 목록</h1><p class="lead">운영자 검수를 거쳐 제조업체에 전달된 공동 항의예요. 같은 문제를 겪었다면 참여할 수 있어요.</p>
 <div class="chips">${[['','전체'],['delivered','전달됨'],['answered','답변 완료']].map(([k,l])=>`<a class="chip ${k===st?'on':''}" href="#/complaints${k?'?st='+k:''}">${l}</a>`).join('')}</div>
 <ul class="list card">${pub.map(c=>{const p=productById(c.pid);const j=S.joined.includes(c.id);return `<li><div><strong>${esc(p.name)}</strong><div class="meta">${esc(p.maker)} · ${esc(c.type)} · 참여자 ${c.count}명 · ${c.createdAt} 개설</div></div><div class="row">${cbadge(c.status)}${j?'<span class="badge s-info">참여함</span>':`<a class="btn sm ghost" href="#/complain/${c.pid}/${encodeURIComponent(c.type)}">참여하기</a>`}</div></li>`;}).join('')||'<li class="muted">표시할 항의가 없어요.</li>'}</ul>
 <p class="small muted">새 항의는 제품 대조 결과 화면의 ‘공동 항의하기’에서 열 수 있어요.</p></div>`;
};

screens.complain = (pid, params, type) => {
 const p = productById(pid); if (!p) return screens.unregistered(null,new URLSearchParams());
 if (!S.premium) return premiumGate();
 const head = `<div class="crumb"><a href="#/result/${p.id}">대조 결과</a> › 공동 항의</div>`;
 if (!type) return `<div class="page">${head}<h1>어떤 문제가 있었나요?</h1><p class="lead">‘${esc(p.name)}’ (${esc(p.maker)})</p><div class="steps"><span class="on">1 문제 유형</span><span>2 의견 작성</span><span>3 완료</span></div>
  <ul class="list card mt">${PROBLEM_TYPES.map(t=>{const open=S.complaints.find(c=>c.pid===pid&&c.type===t&&['review','delivered'].includes(c.status));return `<li><div><strong>${t}</strong><div class="meta">${open?(open.status==='review'?'같은 유형의 항의가 검수 중이에요':`열린 항의에 ${open.count}명 참여 중 → 참여하게 돼요`):'열린 항의 없음 → 새 항의를 열게 돼요'}</div></div><a class="btn sm ghost" href="#/complain/${pid}/${encodeURIComponent(t)}">선택</a></li>`;}).join('')}</ul></div>`;
 const open = S.complaints.find(c=>c.pid===pid&&c.type===type&&['review','delivered'].includes(c.status));
 const already = open && S.joined.includes(open.id);
 if (already) return `<div class="page">${head}<div class="card notice"><h2>이미 참여한 항의예요</h2><p>같은 항의에는 다시 참여할 수 없어요. 참여자 ${open.count}명 · ${CSTATUS[open.status][0]}</p><a class="btn" href="#/my-complaints">내 항의 목록</a></div></div>`;
 if (open && open.status==='review') return `<div class="page">${head}<div class="card soft"><h2>같은 유형의 항의가 검수 중이에요</h2><p>검수가 끝나 공개되면 참여할 수 있어요. 중복 항의를 막기 위해 새로 열 수 없어요.</p><a class="btn ghost" href="#/complain/${pid}">다른 유형 선택</a></div></div>`;
 const summary = open ? `<div class="card soft"><dl class="kv"><dt>제품명</dt><dd>${esc(p.name)}</dd><dt>문제 유형</dt><dd>${esc(type)}</dd><dt>현재 참여자</dt><dd>${open.count}명</dd><dt>진행 상태</dt><dd>${cbadge(open.status)}</dd><dt>항의 내용</dt><dd>${esc(open.summary)}</dd></dl></div>` : `<div class="card soft"><dl class="kv"><dt>제품명</dt><dd>${esc(p.name)}</dd><dt>제조사</dt><dd>${esc(p.maker)}</dd><dt>문제 유형</dt><dd>${esc(type)}</dd></dl></div>`;
 return `<div class="page">${head}<h1>${open?'공동 항의 참여':'공동 항의 개설'}</h1><div class="steps"><span>1 문제 유형</span><span class="on">2 의견 작성</span><span>3 완료</span></div>${summary}
 <form class="card" data-form="${open?'join':'open'}" data-pid="${pid}" data-type="${esc(type)}" ${open?`data-cid="${open.id}"`:''}>
 <label for="opinion">${open?'내 의견 (선택)':'문제 상황'}</label><textarea id="opinion" name="opinion" maxlength="500" ${open?'':'required'} placeholder="예: 포장지에 없는 성분이 원재료명에 표기되어 있어요"></textarea>
 <p class="hint">자녀 이름·진단 정보·연락처 등 개인정보는 쓰지 마세요. 자녀 프로필 정보는 항의에 포함되지 않아요.</p>
 <label>구매 인증 사진 (선택)</label><div class="photo-drop">데모에서는 사진을 업로드하지 않아요</div>
 <div class="card notice mt small mb0">${open?'참여 의견은 별도 검수 없이 반영되며, 제조업체에는 참여자 수와 문제 유형만 전달돼요.':'새 공동 항의는 운영자 검수(근거 없는 비방·개인정보 확인) 후 제조업체에 전달돼요. 어푸는 항의 내용의 사실 여부를 판정하지 않아요.'}</div>
 <div class="row mt"><a class="btn ghost" href="#/complain/${pid}">이전</a><button class="btn">${open?'참여 제출':'항의 개설 제출'}</button></div></form></div>`;
};

screens['my-complaints'] = (_, params) => {
 const st = params.get('st') || '';
 const mine = S.complaints.filter(c=>S.joined.includes(c.id) && (!st||c.status===st));
 return `<div class="page"><h1>내 항의 목록</h1><p class="lead">참여한 공동 항의의 진행 상태와 공식 답변을 확인하세요.</p>
 <div class="chips">${[['','전체'],['review','접수'],['delivered','전달됨'],['answered','답변 완료'],['rejected','반려']].map(([k,l])=>`<a class="chip ${k===st?'on':''}" href="#/my-complaints${k?'?st='+k:''}">${l}</a>`).join('')}</div>
 ${mine.length?`<ul class="list card">${mine.map(c=>{const p=productById(c.pid);return `<li><div><strong>${esc(p.name)}</strong><div class="meta">${esc(c.type)} · 참여자 ${c.count}명 · ${c.createdAt} 개설</div>${c.status==='rejected'?`<div class="meta">반려 사유: ${esc(c.rejectReason)}</div>`:''}</div><div class="row">${cbadge(c.status)}${c.status==='answered'?`<a class="btn sm" href="#/answer/${c.id}">공식 답변 보기</a>`:''}</div></li>`;}).join('')}</ul>`
 :`<div class="card empty">${seal()}<h3>참여한 항의가 없어요</h3><p>제품 대조 결과 화면에서 공동 항의에 참여할 수 있어요.</p><a class="btn" href="#/complaints">공동 항의 목록</a></div>`}</div>`;
};

const answerBlock = c => `<div class="answer"><div class="from">✔ 확인된 제조업체 · ${esc(c.answer.maker)} · ${c.answer.at}</div><h3>${esc(c.answer.title)}</h3><p>${esc(c.answer.body)}</p>${c.answer.adds.map(a=>`<div class="add"><div class="meta">추가 답변 · ${a.at}</div><p class="mb0">${esc(a.body)}</p></div>`).join('')}</div>`;
screens.answer = cid => {
 const c = S.complaints.find(x=>x.id===cid);
 if (!c) return `<div class="page"><p>항의를 찾을 수 없어요.</p></div>`;
 if (!S.joined.includes(cid)) return `<div class="page"><div class="card warn"><h2>항의에 참여한 보호자만 답변을 볼 수 있어요</h2><p>${S.premium?'공동 항의 목록에서 이 항의에 참여해 보세요.':'공동 항의는 프리미엄 기능이에요.'}</p><a class="btn" href="${S.premium?'#/complaints':'#/premium'}">${S.premium?'공동 항의 목록':'프리미엄 안내'}</a></div></div>`;
 const p = productById(c.pid);
 return `<div class="page"><div class="crumb"><a href="#/my-complaints">내 항의</a> › 공식 답변</div><h1>공식 답변 확인</h1>
 <div class="card soft"><dl class="kv"><dt>제품명</dt><dd>${esc(p.name)}</dd><dt>문제 유형</dt><dd>${esc(c.type)}</dd><dt>참여자 수</dt><dd>${c.count}명</dd><dt>전달일</dt><dd>${c.deliveredAt||'—'}</dd><dt>상태</dt><dd>${cbadge(c.status)}</dd></dl></div>
 ${c.answer?answerBlock(c)+'<p class="hint">등록된 답변은 수정되지 않으며 추가 답변만 덧붙을 수 있어요. 이 항의의 모든 참여자가 같은 답변을 받아요.</p>':'<div class="card"><p class="mb0">아직 공식 답변이 도착하지 않았어요. 답변이 오면 알림으로 알려드려요.</p></div>'}
 ${disclaimer('이 답변은 제조업체의 공식 입장이며, 어푸는 내용을 보증하지 않습니다.')}</div>`;
};

screens.notifications = () => {
 const html = `<div class="page"><h1>알림</h1>${S.notices.length?`<ul class="list card notice-list">${S.notices.map(n=>`<li><a href="#/${n.go}" class="${n.read?'':'unread'}">${esc(n.text)}</a><div class="meta">${n.at}</div></li>`).join('')}</ul>`:`<div class="card empty">${seal()}<h3>새 알림이 없어요</h3><p>공동 항의 검수 결과와 공식 답변 도착 알림이 여기에 표시돼요.</p></div>`}</div>`;
 S.notices.forEach(n=>n.read=true); save();
 return html;
};

// ---------- screens: operator ----------
screens['op-review'] = (cid) => {
 if (cid) return reviewDetail(cid);
 const q = S.complaints.filter(c=>c.status==='review').sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const old = q.filter(c => (Date.parse(today())-Date.parse(c.createdAt))/864e5 >= 7).length;
 return `<div class="page"><div class="crumb">운영자</div><h1>검수 대기 목록</h1><p class="lead">새로 열린 공동 항의만 검수해요(참여 의견은 검수하지 않음). 오래된 순으로 정렬됩니다.</p>
 <div class="grid3"><div class="stat"><span class="small muted">전체 대기</span><b>${q.length}건</b></div><div class="stat"><span class="small muted">7일 이상 대기</span><b>${old}건</b></div><div class="stat"><span class="small muted">처리 기록</span><b>${S.reviewLog.length}건</b></div></div>
 ${q.length?`<div class="card table-wrap mt"><table><thead><tr><th>제품명</th><th>문제 유형</th><th>개설일</th><th>상태</th><th></th></tr></thead><tbody>${q.map(c=>`<tr><td>${esc(productById(c.pid).name)}</td><td>${esc(c.type)}</td><td>${c.createdAt}</td><td>${cbadge('review')}</td><td class="right"><a class="btn sm ghost" href="#/op-review/${c.id}">상세 보기</a></td></tr>`).join('')}</tbody></table></div>`
 :`<div class="card empty mt">${seal()}<h3>대기 중인 검수 항목이 없어요</h3><p>보호자 화면에서 새 공동 항의를 열면 이 목록에 나타나요.</p></div>`}
 ${S.reviewLog.length?`<section class="card"><h2>검수 기록</h2><div class="table-wrap"><table><thead><tr><th>대상</th><th>결과</th><th>반려 사유</th><th>처리자</th><th>처리일</th></tr></thead><tbody>${S.reviewLog.map(l=>`<tr><td>${l.target}</td><td>${l.result}</td><td>${esc(l.reason||'—')}</td><td>${l.by}</td><td>${l.at}</td></tr>`).join('')}</tbody></table></div></section>`:''}</div>`;
};
function reviewDetail(cid) {
 const c = S.complaints.find(x=>x.id===cid);
 if (!c) return `<div class="page"><p>항목을 찾을 수 없어요.</p></div>`;
 const p = productById(c.pid);
 return `<div class="page"><div class="crumb"><a href="#/op-review">검수 대기 목록</a> › 상세</div><h1>항의 검수 상세</h1>
 <div class="card"><h2>항의 기본 정보</h2><dl class="kv"><dt>제품명</dt><dd>${esc(p.name)} (${esc(p.maker)})</dd><dt>문제 유형</dt><dd>${esc(c.type)}</dd><dt>참여자 수</dt><dd>${c.count}명</dd><dt>개설일</dt><dd>${c.createdAt}</dd><dt>현재 상태</dt><dd>${cbadge(c.status)}</dd></dl><h3 class="mt">항의 내용</h3><p>${esc(c.summary)}</p></div>
 <div class="card soft small"><strong>검수 기준</strong> — 아래에 해당하면 반려합니다. 사실 여부 조사·판정은 하지 않습니다.<ul class="mb0">${REJECT_REASONS.map(r=>`<li>${r}</li>`).join('')}</ul></div>
 ${c.status==='review'?`<form class="card" data-form="review" data-cid="${c.id}"><h2>처리</h2><label for="reason">반려 사유 (반려 시 필수)</label><select id="reason" name="reason"><option value="">선택하세요</option>${REJECT_REASONS.map(r=>`<option>${r}</option>`).join('')}</select>
 <div class="row mt"><button class="btn" name="decision" value="approve">승인 · 제조업체에 전달</button><button class="btn danger" name="decision" value="reject">반려</button></div></form>`:`<div class="card notice">이미 처리된 항목이에요.</div>`}</div>`;
}

const accountById = id => S.accounts.find(a=>a.id===id);
const ASTATUS = {pending:['확인 대기','s-review'],approved:['승인','s-answered'],rejected:['거절','s-rejected']};
screens['op-apps'] = (aid) => {
 if (aid) return appDetail(aid);
 return `<div class="page"><div class="crumb">운영자</div><h1>제조업체 계정 신청 목록</h1><p class="lead">실제 해당 업체 소속인지 확인한 뒤 공식 답변 권한을 부여해요. 확인되지 않은 계정은 답변을 등록할 수 없어요.</p>
 <div class="card table-wrap"><table><thead><tr><th>업체명</th><th>사업자등록번호</th><th>담당자 이메일</th><th>상태</th><th>신청일</th><th></th></tr></thead><tbody>${S.accounts.map(a=>`<tr><td>${esc(a.company)}</td><td>${esc(a.bizNo)}</td><td>${esc(a.email)}</td><td><span class="badge ${ASTATUS[a.status][1]}">${ASTATUS[a.status][0]}</span></td><td>${a.at}</td><td class="right"><a class="btn sm ghost" href="#/op-apps/${a.id}">${a.status==='pending'?'검토':'보기'}</a></td></tr>`).join('')}</tbody></table></div></div>`;
};
function appDetail(aid) {
 const a = accountById(aid); if (!a) return `<div class="page"><p>신청을 찾을 수 없어요.</p></div>`;
 const domain = a.email.split('@')[1]||'';
 const freeMail = /freemail|gmail|naver|daum/.test(domain);
 return `<div class="page"><div class="crumb"><a href="#/op-apps">계정 신청 목록</a> › 검토</div><h1>계정 신청 검토</h1>
 <div class="card"><h2>신청자 정보</h2><dl class="kv"><dt>담당자</dt><dd>${esc(a.manager)}</dd><dt>회사 이메일</dt><dd>${esc(a.email)}</dd><dt>업체명</dt><dd>${esc(a.company)}</dd><dt>사업자등록번호</dt><dd>${esc(a.bizNo)}</dd><dt>신청일</dt><dd>${a.at}</dd><dt>상태</dt><dd><span class="badge ${ASTATUS[a.status][1]}">${ASTATUS[a.status][0]}</span>${a.reason?` · ${esc(a.reason)}`:''}</dd></dl></div>
 <div class="card soft"><h3>소속 확인</h3><p class="small mb0">사업자등록증 사본: 첨부됨 (데모 파일)<br>도메인 이메일: ${freeMail?`<strong>⚠ 개인 메일 도메인(${esc(domain)})</strong> — 회사 도메인 확인 필요`:`${esc(domain)} 도메인 인증 완료 (데모)`}</p></div>
 ${a.status==='pending'?`<form class="card" data-form="app" data-aid="${a.id}"><label for="reason">거절 사유 (거절 시 필수)</label><input type="text" id="reason" name="reason" maxlength="100"><div class="row mt"><button class="btn" name="decision" value="approve">승인 · 답변 권한 부여</button><button class="btn danger" name="decision" value="reject">거절</button></div></form>`:''}</div>`;
}

// ---------- screens: maker ----------
screens['mk-login'] = () => S.makerSession ? screens['mk-complaints'](null, new URLSearchParams()) : `<div class="page"><div class="onboard card">${seal()}<h1>제조업체 로그인</h1><p class="lead">공동 항의를 확인하고 공식 답변을 등록하는 제조업체 담당자 전용 채널이에요.</p>
 <form data-form="mk-login"><label for="email">담당자 이메일</label><input type="email" id="email" name="email" required value="cs@haetsal.example"><label for="pw">비밀번호</label><input type="password" id="pw" name="pw" required value="demo"><button class="btn block mt">로그인</button></form>
 <p class="hint">데모 계정(비밀번호 모두 <code>demo</code>): cs@haetsal.example (승인), cs@badamilk.example (승인), cs@dalbit.example (확인 대기)</p>
 <p class="small">계정이 없나요? <a href="#/mk-signup">가입 신청</a></p></div></div>`;

screens['mk-signup'] = () => `<div class="page"><h1>제조업체 계정 신청</h1><p class="lead">사업자등록증과 회사 도메인 이메일로 소속을 확인해요. 운영자가 승인한 담당자에게만 자사 제품의 공식 답변 권한이 부여됩니다.</p>
 <form class="card" data-form="mk-signup"><label for="company">업체명</label><select id="company" name="company">${MAKERS.map(m=>`<option>${m}</option>`).join('')}</select>
 <label for="bizNo">사업자등록번호</label><input type="text" id="bizNo" name="bizNo" required maxlength="12" placeholder="000-00-00000">
 <label for="manager">담당자 이름</label><input type="text" id="manager" name="manager" required maxlength="20">
 <label for="email2">담당자 이메일 (회사 도메인)</label><input type="email" id="email2" name="email" required>
 <label for="file">사업자등록증 첨부</label><input type="file" id="file" name="file" accept=".pdf,.jpg,.png"><p class="hint">데모에서는 파일이 전송되지 않아요. 신청 후 영업일 2~3일 내 검토(데모에서는 운영자 화면에서 바로 처리).</p>
 <button class="btn block mt">가입 신청 제출</button></form><a href="#/mk-login">로그인 화면으로</a></div>`;

const makerAuth = () => { const a = S.makerSession && accountById(S.makerSession); return a || null; };
screens['mk-complaints'] = (_, params) => {
 const a = makerAuth(); if (!a) return screens['mk-login']();
 const st = params.get('st') || '';
 const list = S.complaints.filter(c=>productById(c.pid).maker===a.company && ['delivered','answered'].includes(c.status) && (!st||c.status===st));
 return `<div class="page"><div class="crumb">제조업체 · ${esc(a.company)}</div><h1>공동 항의 목록</h1>
 ${a.status!=='approved'?`<div class="card warn"><strong>계정이 ${ASTATUS[a.status][0]} 상태예요.</strong> 운영자 확인이 끝나기 전에는 공식 답변을 등록할 수 없어요. (운영자 화면 › 계정 신청 목록에서 승인해 보세요)</div>`:''}
 <p class="lead">운영자 검수를 거쳐 전달된 자사 제품 항의예요. 참여자 개인정보는 제공되지 않아요.</p>
 <div class="chips">${[['','전체'],['delivered','미답변'],['answered','답변 완료']].map(([k,l])=>`<a class="chip ${k===st?'on':''}" href="#/mk-complaints${k?'?st='+k:''}">${l}</a>`).join('')}</div>
 ${list.length?`<div class="card table-wrap"><table><thead><tr><th>제품명</th><th>문제 유형</th><th>참여자 수</th><th>전달일</th><th>답변</th><th></th></tr></thead><tbody>${list.map(c=>`<tr><td>${esc(productById(c.pid).name)}</td><td>${esc(c.type)}</td><td>${c.count}명</td><td>${c.deliveredAt}</td><td>${c.answer?'<span class="badge s-answered">답변 완료</span>':'<span class="badge s-review">미답변</span>'}</td><td class="right"><a class="btn sm ${c.answer?'ghost':''}" href="#/mk-answer/${c.id}">${c.answer?'답변 보기':'답변 작성'}</a></td></tr>`).join('')}</tbody></table></div>`
 :`<div class="card empty">${seal()}<h3>전달된 항의가 없어요</h3></div>`}</div>`;
};

screens['mk-answer'] = cid => {
 const a = makerAuth(); if (!a) return screens['mk-login']();
 const c = S.complaints.find(x=>x.id===cid);
 if (!c || productById(c.pid).maker!==a.company || !['delivered','answered'].includes(c.status)) return `<div class="page"><div class="card warn"><h2>자사 제품에 전달된 항의만 볼 수 있어요</h2><a class="btn" href="#/mk-complaints">항의 목록</a></div></div>`;
 const p = productById(c.pid);
 const can = a.status==='approved';
 return `<div class="page"><div class="crumb"><a href="#/mk-complaints">항의 목록</a> › 공식 답변</div><h1>공식 답변 ${c.answer?'확인':'작성'}</h1>
 <div class="card soft"><dl class="kv"><dt>제품명</dt><dd>${esc(p.name)}</dd><dt>문제 유형</dt><dd>${esc(c.type)}</dd><dt>참여자 수</dt><dd>${c.count}명</dd><dt>개설일</dt><dd>${c.createdAt}</dd><dt>항의 내용</dt><dd>${esc(c.summary)}</dd></dl></div>
 ${c.answer?answerBlock(c)+(can?`<form class="card mt" data-form="mk-add" data-cid="${c.id}"><label for="add">추가 답변 (등록된 답변은 수정할 수 없어요)</label><textarea id="add" name="body" required maxlength="1000"></textarea><button class="btn mt">추가 답변 등록</button></form>`:'')
 :`<form class="card" data-form="mk-answer" data-cid="${c.id}"><fieldset class="fieldset" ${can?'':'disabled'}><label for="title">답변 제목</label><input type="text" id="title" name="title" required maxlength="80"><label for="body">공식 답변 내용</label><textarea id="body" name="body" required maxlength="2000" placeholder="모든 참여자에게 동일하게 전달됩니다."></textarea>
 <ul class="small muted"><li>등록된 답변은 수정할 수 없으며 추가 답변만 덧붙일 수 있어요.</li><li>참여자 ${c.count}명 전원에게 같은 내용으로 즉시 전달돼요.</li></ul><button class="btn">답변 등록</button></fieldset>${can?'':'<p class="hint">확인되지 않은 계정은 공식 답변을 등록할 수 없어요.</p>'}</form>`}</div>`;
};

// ---------- modal ----------
function modal(html) {
 $('#modal-root').innerHTML = `<div class="modal-backdrop" data-act="close-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
 $('.modal').querySelector('input,select,textarea,button')?.focus();
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
const confirmModal = (title, text, act, attrs, label='확인') => modal(`<h2>${title}</h2><p>${text}</p><div class="actions"><button class="btn ghost" data-act="close">취소</button><button class="btn danger" data-act="${act}" ${attrs}>${label}</button></div>`);

// ---------- actions ----------
const actions = {
 role: el => go('/'+ROLE_HOME[el.dataset.role]),
 reset: () => confirmModal('데모를 초기화할까요?','자녀 프로필, 관심 제품, 항의·답변 등 이 브라우저의 데모 상태가 처음으로 돌아갑니다.','do-reset','','초기화'),
 'do-reset': () => { S = seedState(); save(); closeModal(); toast('데모를 초기화했어요'); go('/onboarding'); route(); },
 sample: () => { S.consent = true; S.children = [{id:uid('k'),alias:'첫째',age:4,allergens:['난류','우유','땅콩'],custom:[]},{id:uid('k'),alias:'둘째',age:1,allergens:['대두'],custom:['키위']}]; save(); go('/home'); },
 fill: el => { const i = $('#q'); i.value = el.dataset.v; i.focus(); },
 fav: el => { const pid = el.dataset.pid; if (isFav(pid)) S.favorites = S.favorites.filter(f=>f.pid!==pid); else S.favorites.unshift({pid,at:today()}); save(); toast(isFav(pid)?'관심 제품에 저장했어요':'관심 제품에서 뺐어요'); route(); },
 unfav: el => confirmModal('관심 제품 삭제',`${esc(productById(el.dataset.pid).name)}을(를) 관심 제품에서 삭제할까요?`,'do-unfav',`data-pid="${el.dataset.pid}"`,'삭제'),
 'do-unfav': el => { S.favorites = S.favorites.filter(f=>f.pid!==el.dataset.pid); save(); closeModal(); route(); },
 buy: () => toast('데모에서는 쿠팡으로 이동하지 않아요'),
 report: el => modal(`<h2>오류 신고</h2><p class="small muted">제품 정보가 누락되었거나 잘못되었다면 알려주세요. 운영자가 즉시 확인해요.</p><form data-form="report"><label for="rname">제품명</label><input type="text" id="rname" name="name" required maxlength="80" value="${esc(el.dataset.name||'')}"><label for="rtype">신고 유형</label><select id="rtype" name="type"><option>제품 정보 누락(미등록)</option><option>성분 정보 오류</option><option>매칭 오류(다른 제품)</option><option>회수 정보 오류</option></select><label for="rbody">상세 내용</label><textarea id="rbody" name="body" maxlength="500"></textarea><div class="actions"><button type="button" class="btn ghost" data-act="close">취소</button><button class="btn">신고 제출</button></div></form>`),
 'edit-child': el => { const c = S.children.find(x=>x.id===el.dataset.id); modal(`<h2>자녀 프로필 수정</h2><form data-form="profile-edit" data-id="${c.id}"><label for="alias">별칭</label><input type="text" id="alias" name="alias" required maxlength="10" value="${esc(c.alias)}"><label for="age">나이</label>${ageSelect(c.age)}${allergenFields(c)}<div class="actions"><button type="button" class="btn ghost" data-act="close">취소</button><button class="btn">저장</button></div></form>`); },
 'del-child': el => { const c = S.children.find(x=>x.id===el.dataset.id); confirmModal('프로필 삭제',`${esc(c.alias)} 프로필을 삭제하면 이 자녀 기준의 대조가 더 이상 표시되지 않아요. 삭제 후에는 복구할 수 없어요.`,'do-del-child',`data-id="${c.id}"`,'삭제'); },
 'do-del-child': el => { S.children = S.children.filter(c=>c.id!==el.dataset.id); save(); closeModal(); toast('프로필을 삭제했어요'); route(); },
 'premium-on': () => { S.premium = true; save(); toast('프리미엄이 켜졌어요 (데모)'); route(); },
 'premium-off': () => { S.premium = false; save(); route(); },
 'mk-logout': () => { S.makerSession = null; save(); go('/mk-login'); },
 close: closeModal,
 'close-bg': (el, e) => { if (e.target === el) closeModal(); }
};

const forms = {
 consent: () => { S.consent = true; save(); go('/profile-new'); },
 'profile-new': (fd) => { S.children.push(childFrom(fd,uid('k'))); save(); toast('프로필을 저장했어요'); go('/home'); },
 'profile-edit': (fd, f) => { const i = S.children.findIndex(c=>c.id===f.dataset.id); S.children[i] = childFrom(fd,f.dataset.id); save(); closeModal(); toast('수정했어요'); route(); },
 lookup: (fd) => {
  const v = String(fd.get('q')).trim();
  if (/^https?:\/\//i.test(v)) {
   let u; try { u = new URL(v); } catch { return toast('링크 형식을 확인해 주세요'); }
   if (!/(^|\.)coupang\.com$/.test(u.hostname)) return toast('쿠팡 상품 링크만 지원해요. 제품명으로 검색해 보세요.');
   const id = (u.pathname.match(/products\/(\d+)/)||[])[1];
   const p = PRODUCTS.find(x=>x.coupangId===id);
   if (p) return go('/result/'+p.id);
   if (BUNDLES[id]) return go('/candidates/'+id);
   return go('/search?fail=1');
  }
  go('/search?q='+encodeURIComponent(v));
 },
 search: (fd) => go('/search?'+new URLSearchParams([...fd].filter(([,v])=>v))),
 report: (fd) => { S.reports.push({name:fd.get('name'),type:fd.get('type'),at:today()}); save(); closeModal(); toast('신고가 접수됐어요. 확인 후 반영할게요.'); },
 open: (fd, f) => {
  const c = {id:uid('c'),pid:f.dataset.pid,type:f.dataset.type,status:'review',count:1,createdAt:today(),summary:String(fd.get('opinion')).trim(),answer:null};
  S.complaints.push(c); S.joined.push(c.id); save();
  toast('공동 항의를 열었어요 · 참여자 1명 · 운영자 검수 후 전달돼요'); go('/my-complaints');
 },
 join: (fd, f) => {
  const c = S.complaints.find(x=>x.id===f.dataset.cid);
  if (S.joined.includes(c.id)) return toast('이미 참여한 항의예요');
  c.count += 1; S.joined.push(c.id); save();
  toast(`참여했어요 · 참여자 ${c.count}명`); go('/my-complaints');
 },
 review: (fd, f, submitter) => {
  const c = S.complaints.find(x=>x.id===f.dataset.cid); const reason = fd.get('reason');
  const decision = submitter?.value;
  if (decision === 'reject' && !reason) return toast('반려 사유를 선택해 주세요');
  const finish = () => {
   const name = productById(c.pid).name;
   if (decision === 'approve') { c.status='delivered'; c.deliveredAt=today(); if (S.joined.includes(c.id)) notify(`‘${name}’ 공동 항의가 검수를 통과해 제조업체에 전달됐어요.`,'my-complaints'); }
   else { c.status='rejected'; c.rejectReason=reason; if (S.joined.includes(c.id)) notify(`‘${name}’ 공동 항의가 반려됐어요. 사유: ${reason}`,'my-complaints?st=rejected'); }
   S.reviewLog.unshift({target:c.id,result:decision==='approve'?'승인':'반려',reason:decision==='reject'?reason:'',by:'운영자(데모)',at:today()});
   save(); closeModal(); toast(decision==='approve'?'승인했어요 · 제조업체에 전달됨':'반려했어요 · 보호자에게 사유를 알렸어요'); go('/op-review');
  };
  if (decision === 'reject') { pending = finish; confirmModal('반려 처리 확인',`‘${esc(reason)}’ 사유로 반려할까요? 보호자에게 사유가 전달되며 되돌릴 수 없어요.`,'do-pending','','반려 처리'); }
  else finish();
 },
 app: (fd, f, submitter) => {
  const a = accountById(f.dataset.aid); const reason = String(fd.get('reason')||'').trim();
  if (submitter?.value === 'reject' && !reason) return toast('거절 사유를 입력해 주세요');
  if (submitter?.value === 'approve') { a.status='approved'; a.reason=''; toast(`${a.company} 담당자에게 답변 권한을 부여했어요`); }
  else { a.status='rejected'; a.reason=reason; toast('거절했어요'); }
  save(); go('/op-apps');
 },
 'mk-login': (fd) => {
  const a = S.accounts.find(x=>x.email.toLowerCase()===String(fd.get('email')).toLowerCase());
  if (!a || fd.get('pw')!=='demo') return toast('이메일 또는 비밀번호를 확인해 주세요 (데모 비밀번호: demo)');
  if (a.status==='rejected') return toast(`거절된 신청이에요: ${a.reason}`);
  S.makerSession = a.id; save(); go('/mk-complaints');
 },
 'mk-signup': (fd) => {
  const email = String(fd.get('email')).trim();
  if (S.accounts.some(a=>a.email.toLowerCase()===email.toLowerCase())) return toast('이미 신청된 이메일이에요');
  S.accounts.push({id:uid('a'),company:fd.get('company'),bizNo:fd.get('bizNo'),manager:fd.get('manager'),email,status:'pending',at:today(),reason:''}); save();
  toast('신청했어요 · 운영자 확인 후 이메일로 안내돼요 (데모)'); go('/mk-login');
 },
 'mk-answer': (fd, f) => {
  const c = S.complaints.find(x=>x.id===f.dataset.cid);
  pending = () => {
   const a = makerAuth();
   if (!a || a.status!=='approved' || c.answer) return closeModal();
   c.answer = {title:String(fd.get('title')).trim(),body:String(fd.get('body')).trim(),maker:a.company,at:today(),adds:[]}; c.status='answered';
   if (S.joined.includes(c.id)) notify(`‘${productById(c.pid).name}’ 공동 항의에 제조업체 공식 답변이 도착했어요.`,'answer/'+c.id);
   save(); closeModal(); toast(`참여자 ${c.count}명 전원에게 답변을 전달했어요`); route();
  };
  confirmModal('답변을 등록할까요?',`등록 후에는 수정할 수 없으며, 참여자 ${c.count}명 전원에게 같은 내용으로 즉시 전달돼요.`,'do-pending','','등록');
 },
 'mk-add': (fd, f) => {
  const c = S.complaints.find(x=>x.id===f.dataset.cid);
  c.answer.adds.push({body:String(fd.get('body')).trim(),at:today()});
  if (S.joined.includes(c.id)) notify(`‘${productById(c.pid).name}’ 공식 답변에 추가 답변이 붙었어요.`,'answer/'+c.id);
  save(); toast('추가 답변을 전달했어요'); route();
 }
};
let pending = null;
actions['do-pending'] = () => { const fn = pending; pending = null; fn?.(); };

function childFrom(fd, id) {
 return {id, alias:String(fd.get('alias')).trim().slice(0,10), age:Number(fd.get('age')), allergens:fd.getAll('allergens').filter(a=>ALLERGENS.includes(a)),
  custom:String(fd.get('custom')||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,5)};
}

document.addEventListener('click', e => {
 const el = e.target.closest('[data-act]');
 if (el && actions[el.dataset.act]) { if (el.tagName==='BUTTON' || el.tagName==='A') e.preventDefault(); actions[el.dataset.act](el, e); }
});
document.addEventListener('submit', e => {
 const f = e.target.closest('form[data-form]'); if (!f) return;
 e.preventDefault();
 forms[f.dataset.form]?.(new FormData(f), f, e.submitter);
});
document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });

// ---------- router ----------
function route() {
 const raw = location.hash.replace(/^#\/?/,'') || (S.consent ? 'home' : 'onboarding');
 const [path, qs=''] = raw.split('?');
 const params = new URLSearchParams(qs);
 const [name, a, b] = path.split('/').map(decodeURIComponent);
 const screen = screens[name] || screens.home;
 const html = screen(a, params, b);
 renderChrome(screens[name] ? path : 'home');
 $('#main').innerHTML = html;
 document.title = `어푸 데모 · ${$('#main h1')?.textContent || '홈'}`;
}
let lastPath = '';
window.addEventListener('hashchange', () => { closeModal(); route(); const p = location.hash.split('?')[0]; if (p!==lastPath) { window.scrollTo(0,0); $('#main').focus({preventScroll:true}); } lastPath = p; });
route();
