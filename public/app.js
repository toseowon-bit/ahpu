// 어푸 보호자 앱 — 자녀 알레르기 기준 식품 표시 대조 + 회수·판매중지 확인.
// 현재는 가상 카탈로그(catalog.js)로 동작한다. 서버 전송 없음, 자녀 정보는 이 기기의 localStorage에만 저장(실패해도 동작).

import {DATA_DATE, ALLERGENS, CATEGORIES, ICONS, BUNDLES, RECALLS, productById, recallOf, STATUS,
 compareChild, overallStatus, alternativesFor, parseLookup, searchProducts} from './catalog.js';
import {own, parseHash} from './route.js';

const STORE_KEY = 'ahpu-app-v1';
const MAX_CHILDREN = 6;

// ---------- 상태 (저장값은 신뢰하지 않고 형식을 다시 확인한다) ----------
const blank = () => ({consent:false, children:[], favorites:[], history:[]});
const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
function sanitize(raw) {
 const s = blank();
 if (!raw || typeof raw !== 'object') return s;
 s.consent = raw.consent === true;
 if (Array.isArray(raw.children)) s.children = raw.children
  .filter(c => c && typeof c.id === 'string' && typeof c.alias === 'string' && c.alias.trim())
  .slice(0, MAX_CHILDREN)
  .map(c => ({id:str(c.id,24), alias:str(c.alias.trim(),10), age:Math.min(6,Math.max(0,Math.trunc(Number(c.age))||0)),
   allergens:(Array.isArray(c.allergens)?c.allergens:[]).filter(a => ALLERGENS.includes(a)),
   custom:(Array.isArray(c.custom)?c.custom:[]).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0,20)).slice(0,5)}));
 const items = list => (Array.isArray(list)?list:[]).filter(x => x && productById(x.pid) && typeof x.at === 'string').map(x => ({pid:x.pid, at:x.at.slice(0,10)}));
 s.favorites = items(raw.favorites);
 s.history = items(raw.history).slice(0, 20);
 return s;
}
let storageOk = true;
let S = blank();
try { S = sanitize(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch { storageOk = false; }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOk = true; } catch { storageOk = false; } };

// ---------- 도우미 ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0,10);
const uid = p => p + Math.random().toString(36).slice(2,10);
const $ = s => document.querySelector(s);
const seal = (cls='seal') => `<svg class="${cls}" aria-hidden="true"><use href="#seal"/></svg>`;
const badge = key => `<span class="badge ${STATUS[key].cls}">${STATUS[key].label}</span>`;
const ageText = c => `만 ${c.age}세`;
const allergyText = c => [...c.allergens, ...c.custom].join(' · ') || '등록 항목 없음';
const isFav = pid => S.favorites.some(f => f.pid === pid);
const overall = pid => overallStatus(pid, S.children);
const go = h => { if (location.hash === '#' + h) route(); else location.hash = h; };
function toast(msg) { const el = document.createElement('div'); el.textContent = msg; $('#toast').append(el); setTimeout(() => el.remove(), 3000); }
const disclaimer = (extra = '') => `<p class="disclaimer">어푸는 알레르기를 진단하거나 섭취 가능 여부를 판단하지 않습니다. 다시 확인할 항목을 보여줄 뿐이며 안전을 보증하지 않습니다. 구매·섭취 전 실제 포장지 표시를 직접 확인하세요. ${extra}</p>`;
const storageWarn = () => storageOk ? '' : '<div class="card warn small">이 브라우저에서 저장이 차단되어, 창을 닫으면 입력한 내용이 사라집니다.</div>';

function productItem(p, extra = '') {
 return `<li><a class="pitem" href="#/product/${p.id}"><div class="thumb" aria-hidden="true">${ICONS[p.category]}</div>
  <div class="body"><strong>${esc(p.name)}</strong><div class="meta">${esc(p.maker)} · ${p.category} · ${p.stage}개월+${extra}</div><div class="mt-xs">${badge(overall(p.id))}</div></div>
  <span class="chev" aria-hidden="true">›</span></a></li>`;
}

// ---------- 화면 ----------
const screens = {};
const TAB_OF = {home:'home', search:'search', product:'search', candidates:'search', unregistered:'search', alternatives:'search',
 favorites:'favorites', recalls:'recalls', kids:'kids', 'kid-new':'kids', 'kid-edit':'kids'};

screens.welcome = () => `<div class="welcome card">${seal()}<h1>우리 아이 기준으로<br>식품을 확인해요</h1>
 <ul><li><strong>어푸는 알레르기를 진단하지 않아요.</strong> 의사 진단을 받았거나 식이 제한 중인 0~6세 자녀의 보호자를 위한 앱이에요.</li>
 <li>결과는 안전을 보증하지 않고, <strong>다시 확인할 항목</strong>을 알려 드려요.</li>
 <li>구매 전·섭취 전 포장지 표시를 직접 확인해 주세요.</li>
 <li>자녀 정보(별칭·나이·알레르기 항목)는 <strong>이 기기에만</strong> 저장되고 어디에도 전송되지 않아요. 회원가입이 없어요.</li></ul>
 <form data-form="consent"><label class="check"><input type="checkbox" name="agree" required> 위 내용을 확인했어요</label>
 <button class="btn block">시작하기</button></form></div>`;

screens.home = () => {
 const recent = S.history.slice(0, 5).map(h => productById(h.pid));
 const kids = S.children.length
  ? `<div class="kids-strip">${S.children.map(c => `<a class="kid-chip" href="#/kids"><div class="thumb" aria-hidden="true">${esc(c.alias[0])}</div><div><strong>${esc(c.alias)}</strong><div class="meta">${esc(allergyText(c))}</div></div></a>`).join('')}</div>`
  : `<div class="card notice mb0"><h3>자녀를 먼저 등록해 주세요</h3><p class="small">알레르기 항목을 등록하면 제품 표시를 아이 기준으로 대조해 드려요.</p><a class="btn block" href="#/kid-new">자녀 등록하기</a></div>`;
 return `<div class="page">
 <section class="hero">${seal('seal seal-hero')}<h1>먹기 전에,<br>한 번 더 확인해요</h1>
  <form data-form="lookup" role="search"><label for="q" class="small">제품명 검색 또는 쿠팡 상품 링크 붙여넣기</label>
  <div class="searchbox"><input type="search" id="q" name="q" required maxlength="200" enterkeyhint="search" autocomplete="off" placeholder="예: 쌀과자, 진밥"><button class="btn">확인</button></div></form>
  <div class="examples" aria-label="예시 입력"><button type="button" data-act="fill" data-v="쌀과자">쌀과자</button><button type="button" data-act="fill" data-v="https://www.coupang.com/vp/products/1001">쿠팡 링크 예시</button><button type="button" data-act="fill" data-v="https://www.coupang.com/vp/products/2002">묶음 상품 예시</button></div>
 </section>
 <section class="card"><div class="between"><h2 class="mb0">우리 아이</h2><a class="small" href="#/kids">관리</a></div><div class="mt">${kids}</div></section>
 <section class="card"><div class="between"><h2 class="mb0">최근 확인한 제품</h2>${S.favorites.length ? `<a class="small" href="#/favorites">관심 제품 ${S.favorites.length}개</a>` : ''}</div>
  ${recent.length ? `<ul class="plist mt">${recent.map(p => productItem(p)).join('')}</ul>` : '<p class="muted small mt mb0">아직 확인한 제품이 없어요. 위에서 제품명을 검색해 보세요.</p>'}</section>
 <section class="card soft"><div class="between"><h2 class="mb0">최근 회수·판매중지</h2><a class="small" href="#/recalls">전체 보기</a></div>
  <ul class="plist mt">${RECALLS.slice(0,2).map(r => productItem(productById(r.pid), ` · ${r.type} ${r.date}`)).join('')}</ul></section>
 ${storageWarn()}${disclaimer(`데이터 기준일 ${DATA_DATE}.`)}</div>`;
};

screens.search = (_, params) => {
 const q = params.get('q') || '', cat = params.get('cat') || '';
 const items = searchProducts(q, CATEGORIES.includes(cat) ? cat : '');
 const qs = c => '#/search' + (q || c ? '?' + new URLSearchParams({...(q?{q}:{}), ...(c?{cat:c}:{})}) : '');
 return `<div class="page"><h1>제품 검색</h1>
 ${params.get('fail') ? '<div class="card warn small">붙여넣은 링크와 일치하는 제품을 찾지 못했어요. 제품명으로 검색해 보세요.</div>' : ''}
 <form data-form="search" class="searchbox" role="search"><input type="search" name="q" value="${esc(q)}" maxlength="100" enterkeyhint="search" autocomplete="off" placeholder="제품명 또는 제조사" aria-label="제품명 또는 제조사"><input type="hidden" name="cat" value="${esc(cat)}"><button class="btn">검색</button></form>
 <nav class="chips mt" aria-label="종류">${['', ...CATEGORIES].map(c => `<a class="chip ${c===cat?'on':''}" href="${qs(c)}" ${c===cat?'aria-current="true"':''}>${c||'전체'}</a>`).join('')}</nav>
 <p class="meta" role="status">${items.length}개 제품${S.children.length ? ' · 우리 아이 기준 상태 표시' : ''}</p>
 ${items.length ? `<ul class="plist">${items.map(p => productItem(p)).join('')}</ul>`
  : `<div class="card empty">${seal()}<h3>검색 결과가 없어요</h3><p>어푸 데이터에 아직 없는 제품일 수 있어요.</p><a class="btn" href="#/unregistered?name=${encodeURIComponent(q)}">이럴 땐 이렇게 확인해요</a></div>`}
 <p class="hint">데이터 기준일 ${DATA_DATE}. 목록에 없는 제품은 대조할 수 없어요.</p></div>`;
};

screens.candidates = id => {
 const ids = own(BUNDLES, id);
 if (!ids) return screens.search(null, new URLSearchParams('fail=1'));
 return `<div class="page"><div class="crumb"><a href="#/home">‹ 홈</a></div><h1>어떤 제품인가요?</h1>
 <p class="lead">붙여넣은 링크가 묶음·옵션 상품이에요. 제품명과 제조사를 확인하고 대조할 제품을 골라 주세요.</p>
 <ul class="plist">${ids.map(pid => productItem(productById(pid))).join('')}</ul>
 <p class="hint">찾는 제품이 없으면 <a href="#/search">제품명으로 검색</a>해 주세요.</p></div>`;
};

screens.unregistered = (_, params) => `<div class="page"><div class="crumb"><a href="#/search">‹ 검색</a></div>
 <div class="card"><span class="badge s-unreg">미등록</span><h1 class="mt">아직 대조할 수 없는 제품이에요</h1>
 <p>${params.get('name') ? `‘${esc(params.get('name'))}’은(는) ` : ''}어푸 데이터에 없어 자녀 기준 대조를 할 수 없어요. <strong>결과가 없다는 것은 안전하다는 뜻이 아니에요.</strong></p>
 <h3 class="mt">이렇게 확인해 보세요</h3><ul><li>제품명·제조사를 다시 확인해 검색해 보세요.</li><li>포장지의 원재료명과 알레르기 표시, 혼입 가능성 문구를 직접 읽어 주세요.</li><li>식품안전나라에서 회수·판매중지 공지를 확인할 수 있어요.</li></ul>
 <div class="stack mt"><a class="btn" href="#/search">다시 검색</a><a class="btn ghost" href="https://www.foodsafetykorea.go.kr" target="_blank" rel="noopener noreferrer">식품안전나라 열기 ↗</a></div></div></div>`;

screens.product = pid => {
 const p = productById(pid);
 if (!p) return screens.unregistered(null, new URLSearchParams());
 if (S.history[0]?.pid !== pid) { S.history = [{pid, at:today()}, ...S.history.filter(h => h.pid !== pid)].slice(0, 20); save(); }
 const rc = recallOf(pid);
 const rows = S.children.map(c => ({c, r:compareChild(p, c)}));
 const anyHit = rows.some(x => x.r.key === 'match' || x.r.key === 'may');
 const alts = anyHit ? alternativesFor(p, S.children) : [];
 const st = overall(pid);
 const labeled = [...p.contains.map(a => [a,'함유']), ...p.may.map(a => [a,'혼입 가능성'])];
 return `<div class="page"><div class="crumb"><a href="#/search">‹ 검색</a></div>
 <div class="product-head"><div class="thumb" aria-hidden="true">${ICONS[p.category]}</div><div><h1>${esc(p.name)}</h1><p class="meta mb0">${esc(p.maker)} · ${p.category} · ${p.stage}개월 이상</p></div></div>
 <div class="summary ${STATUS[st].cls}" role="status"><strong>${STATUS[st].label}</strong><span class="small">${S.children.length ? `등록한 자녀 ${S.children.length}명 기준` : '자녀를 등록하면 아이 기준으로 대조해요'}</span></div>
 <div class="row"><button type="button" class="btn ghost sm fav-btn" data-act="fav" data-pid="${p.id}" aria-pressed="${isFav(p.id)}">${isFav(p.id) ? '♥ 관심 제품' : '♡ 관심 제품 저장'}</button>${anyHit ? `<a class="btn ghost sm" href="#/alternatives/${p.id}">대안 제품 ${alts.length}개</a>` : ''}</div>
 ${rc ? `<div class="recall-banner" role="alert"><span class="badge s-recall">${esc(rc.type)}</span><h3 class="mt">${esc(rc.type)} 정보가 있어요</h3><p class="small mb0">${esc(rc.title)}</p>
  <dl class="kv"><dt>대상</dt><dd>${esc(rc.lot)}</dd><dt>공고일</dt><dd>${rc.date}</dd><dt>기관</dt><dd>${esc(rc.agency)}</dd></dl><p class="small mt mb0">갖고 있는 제품의 제조일자·소비기한이 대상과 같은지 확인하세요.</p></div>` : ''}
 <section class="card mt"><h2>자녀별 대조</h2><div class="stack">${rows.length ? rows.map(({c, r}) => `<div class="child-card st-${r.key}"><div class="avatar" aria-hidden="true">${esc(c.alias[0])}</div><div><div class="row"><strong>${esc(c.alias)}</strong><span class="meta">${ageText(c)}</span>${badge(r.key)}</div><p class="small mb0">${esc(r.text)}</p></div></div>`).join('')
  : `<p class="muted mb0">등록된 자녀가 없어 대조하지 않았어요.</p><a class="btn block mt" href="#/kid-new">자녀 등록하기</a>`}</div></section>
 <section class="card"><h2>포장지 알레르기 표시</h2>${p.label !== 'provided' ? '<p class="muted mb0">이 제품은 알레르기 표시 정보가 부족해 대조하지 않았어요. 추정하지 않습니다.</p>'
  : labeled.length ? `<ul class="labels">${labeled.map(([a, f]) => { const who = S.children.filter(c => c.allergens.includes(a)).map(c => c.alias); return `<li><span><strong>${a}</strong> <span class="meta">${f}</span></span>${who.length ? `<span class="badge ${f==='함유'?'s-match':'s-may'}">${esc(who.join(', '))}</span>` : ''}</li>`; }).join('')}</ul>`
  : '<p class="muted mb0">표시 의무 19개 항목 중 표시된 성분이 없어요.</p>'}
  <p class="hint">출처: 가상 데이터 · 확인일 ${p.checked[1]} · 데이터 기준일 ${DATA_DATE}</p></section>
 <section class="card"><h2>회수·판매중지</h2>${rc ? `<p class="mb0">${badge('recall')} 위 안내를 확인해 주세요.</p>` : '<p class="mb0">이 제품과 연결된 회수·판매중지 정보가 없어요.</p><p class="hint mb0">정보가 없다는 것이 안전을 뜻하지는 않아요.</p>'}</section>
 <section class="card soft"><h2>다시 확인할 항목</h2><ul class="mb0 small"><li>받은 제품 포장지의 원재료명·알레르기 표시와 혼입 가능성 문구를 직접 확인하세요.</li><li>온라인 정보와 실제 포장이 다를 수 있어요. 제조일자·소비기한도 확인하세요.</li>${rows.some(x => x.r.key === 'na') ? '<li>표시 의무 밖 알레르기 항목은 원재료명을 직접 읽어 확인하세요.</li>' : ''}<li>섭취 가능 여부는 자녀 주치의와 상의하세요.</li></ul></section>
 ${disclaimer()}</div>`;
};

screens.alternatives = pid => {
 const p = productById(pid);
 if (!p) return screens.unregistered(null, new URLSearchParams());
 const alts = alternativesFor(p, S.children);
 const customs = [...new Set(S.children.flatMap(c => c.custom))];
 return `<div class="page"><div class="crumb"><a href="#/product/${p.id}">‹ ${esc(p.name)}</a></div><h1>대안 제품</h1>
 <p class="lead">같은 종류(${p.category}) 중 <strong>등록한 모든 자녀</strong> 기준으로 함유·혼입 가능성 표시가 없고 회수되지 않은 제품이에요. 월령이 가까운 순서예요.</p>
 <div class="card warn small">이 목록은 안전을 보증하지 않아요. 구매·섭취 전 포장지를 직접 확인하세요.${customs.length ? ` ${esc(customs.join(', '))}은(는) 표시 의무 밖이라 대조하지 못했어요.` : ''}</div>
 ${alts.length ? `<ul class="plist">${alts.map(q => productItem(q)).join('')}</ul>` : `<div class="card empty">${seal()}<h3>조건에 맞는 제품이 없어요</h3><p>모든 자녀 기준을 동시에 만족하는 같은 종류 제품을 찾지 못했어요.</p></div>`}</div>`;
};

screens.favorites = (_, params) => {
 const f = params.get('f') || '';
 const filters = [['','전체'],['match','일치 성분'],['may','혼입 가능성'],['recall','회수·판매중지'],['info','정보 부족'],['na','대조 불가'],['none','일치 없음']];
 const items = S.favorites.filter(x => !f || overall(x.pid) === f);
 return `<div class="page"><h1>관심 제품</h1><p class="lead">자주 사는 제품을 저장해 두고 최신 기준으로 다시 확인하세요.</p>
 ${S.favorites.length ? `<nav class="chips" aria-label="상태">${filters.map(([k, l]) => `<a class="chip ${k===f?'on':''}" href="#/favorites${k?'?f='+k:''}" ${k===f?'aria-current="true"':''}>${l}</a>`).join('')}</nav>` : ''}
 ${items.length ? `<ul class="plist">${items.map(x => productItem(productById(x.pid), ` · 저장 ${x.at}`)).join('')}</ul>`
  : `<div class="card empty">${seal()}<h3>${f ? '해당 상태의 제품이 없어요' : '저장한 제품이 없어요'}</h3><p>제품 화면에서 ♡ 관심 제품 저장을 눌러 주세요.</p><a class="btn" href="#/search">제품 검색</a></div>`}
 ${storageWarn()}${disclaimer()}</div>`;
};

screens.recalls = () => `<div class="page"><h1>회수·판매중지</h1><p class="lead">식품안전나라 공고를 바탕으로 한 목록이에요. 지금은 <strong>가상 사례</strong>만 보여요.</p>
 <ul class="plist">${RECALLS.map(r => { const p = productById(r.pid); return `<li><a class="pitem" href="#/product/${p.id}"><div class="thumb" aria-hidden="true">${ICONS[p.category]}</div><div class="body"><span class="badge s-recall">${esc(r.type)}</span><strong class="mt-xs">${esc(p.name)}</strong><div class="meta">${esc(p.maker)} · ${r.date}</div><div class="meta">대상: ${esc(r.lot)}</div></div><span class="chev" aria-hidden="true">›</span></a></li>`; }).join('')}</ul>
 <p class="hint">목록에 없다는 것이 안전을 뜻하지 않아요. 원문은 <a href="https://www.foodsafetykorea.go.kr" target="_blank" rel="noopener noreferrer">식품안전나라 ↗</a>에서 확인하세요.</p></div>`;

const kidForm = (c, form) => `<form class="card" data-form="${form}" ${c ? `data-id="${esc(c.id)}"` : ''}>
 <label for="alias">별칭</label><input type="text" id="alias" name="alias" required maxlength="10" autocomplete="off" value="${esc(c?.alias || '')}" placeholder="예: 첫째, 콩이">
 <fieldset><legend>나이</legend><div class="age-grid">${[0,1,2,3,4,5,6].map(a => `<label><input type="radio" name="age" value="${a}" ${(c ? c.age : 1) === a ? 'checked' : ''}>${a}세</label>`).join('')}</div></fieldset>
 <fieldset><legend>진단받은 알레르기 항목 (표시 의무 19개)</legend><div class="allergen-grid">${ALLERGENS.map(a => `<label><input type="checkbox" name="allergens" value="${a}" ${c?.allergens.includes(a) ? 'checked' : ''}>${a}</label>`).join('')}</div></fieldset>
 <label for="custom">그 밖의 알레르기 (선택, 쉼표로 구분)</label><input type="text" id="custom" name="custom" maxlength="60" autocomplete="off" value="${esc((c?.custom || []).join(', '))}" placeholder="예: 키위, 바나나">
 <p class="hint">19개 밖 항목은 제품 표시와 자동 대조할 수 없어 ‘대조 불가’로 안내돼요. 의사 진단 결과를 기준으로 선택하세요.</p>
 <div class="form-actions"><a class="btn ghost" href="#/kids">취소</a><button class="btn">저장</button></div></form>`;

screens.kids = () => `<div class="page"><h1>우리 아이</h1><p class="lead">등록한 모든 자녀를 한 번에 대조해요. 이 기기에만 저장돼요.</p>
 ${S.children.length ? `<ul class="plist">${S.children.map(c => `<li class="pitem"><div class="thumb" aria-hidden="true">${esc(c.alias[0])}</div><div class="body"><strong>${esc(c.alias)} <span class="meta">${ageText(c)}</span></strong><div class="meta">${esc(allergyText(c))}</div></div>
  <div class="row"><a class="btn ghost sm" href="#/kid-edit/${esc(c.id)}" aria-label="${esc(c.alias)} 수정">수정</a><button type="button" class="btn ghost sm" data-act="del-kid" data-id="${esc(c.id)}" aria-label="${esc(c.alias)} 삭제">삭제</button></div></li>`).join('')}</ul>`
  : `<div class="card empty">${seal()}<h3>등록된 자녀가 없어요</h3><p>알레르기 항목을 등록하면 아이 기준으로 대조해요.</p></div>`}
 ${S.children.length < MAX_CHILDREN ? '<a class="btn block mt" href="#/kid-new">+ 자녀 추가</a>' : ''}
 <section class="card mt"><h2>이 기기의 데이터</h2><p class="small muted">자녀 정보·관심 제품·최근 확인 기록은 이 브라우저에만 있어요. 공용 기기라면 사용 후 지워 주세요.</p><button type="button" class="btn ghost block" data-act="wipe">모든 데이터 지우기</button></section>
 ${storageWarn()}</div>`;

screens['kid-new'] = () => S.children.length >= MAX_CHILDREN ? screens.kids()
 : `<div class="page"><div class="crumb"><a href="#/kids">‹ 우리 아이</a></div><h1>자녀 등록</h1>${kidForm(null, 'kid-new')}</div>`;
screens['kid-edit'] = id => {
 const c = S.children.find(x => x.id === id);
 return c ? `<div class="page"><div class="crumb"><a href="#/kids">‹ 우리 아이</a></div><h1>${esc(c.alias)} 정보 수정</h1>${kidForm(c, 'kid-edit')}</div>` : screens.kids();
};

// ---------- 대화상자 ----------
let pending = null;
function confirmDialog(title, text, label, fn) {
 pending = fn;
 const d = $('#dialog');
 d.innerHTML = `<h2 id="dialog-title">${title}</h2><p>${text}</p><form method="dialog" class="form-actions"><button class="btn ghost" value="cancel">취소</button><button class="btn danger" value="ok">${label}</button></form>`;
 d.onclose = () => { const f = pending; pending = null; if (d.returnValue === 'ok') f?.(); };
 d.returnValue = '';
 d.showModal();
}

// ---------- 동작 ----------
const actions = {
 fill: el => { const i = $('#q'); i.value = el.dataset.v; i.focus(); },
 fav: el => {
  const pid = el.dataset.pid;
  if (!productById(pid)) return;
  const on = !isFav(pid);
  S.favorites = on ? [{pid, at:today()}, ...S.favorites] : S.favorites.filter(f => f.pid !== pid);
  save(); toast(on ? '관심 제품에 저장했어요' : '관심 제품에서 뺐어요'); route();
 },
 'del-kid': el => {
  const c = S.children.find(x => x.id === el.dataset.id); if (!c) return;
  confirmDialog('프로필 삭제', `${esc(c.alias)}의 정보를 삭제할까요? 삭제하면 이 자녀 기준 대조가 사라지고 되돌릴 수 없어요.`, '삭제', () => {
   S.children = S.children.filter(x => x.id !== c.id); save(); toast('삭제했어요'); route();
  });
 },
 wipe: () => confirmDialog('모든 데이터 지우기', '자녀 정보, 관심 제품, 최근 확인 기록과 동의 내역을 이 기기에서 모두 지워요. 되돌릴 수 없어요.', '모두 지우기', () => {
  S = blank(); try { localStorage.removeItem(STORE_KEY); } catch { /* 저장 불가 환경 */ }
  toast('모두 지웠어요'); go('/welcome');
 })
};

function childFrom(fd, id) {
 return {id, alias:String(fd.get('alias') || '').trim().slice(0,10), age:Math.min(6, Math.max(0, Number(fd.get('age')) || 0)),
  allergens:fd.getAll('allergens').filter(a => ALLERGENS.includes(a)),
  custom:String(fd.get('custom') || '').split(/[,，]/).map(s => s.trim().slice(0,20)).filter(Boolean).slice(0,5)};
}
const forms = {
 consent: () => { S.consent = true; save(); go(S.children.length ? '/home' : '/kid-new'); },
 'kid-new': fd => {
  const c = childFrom(fd, uid('k'));
  if (!c.alias) return toast('별칭을 입력해 주세요');
  if (S.children.length >= MAX_CHILDREN) return toast(`자녀는 ${MAX_CHILDREN}명까지 등록할 수 있어요`);
  S.children.push(c); save(); toast('저장했어요'); go(S.history.length ? '/kids' : '/home');
 },
 'kid-edit': (fd, f) => {
  const i = S.children.findIndex(c => c.id === f.dataset.id); if (i < 0) return go('/kids');
  const c = childFrom(fd, f.dataset.id); if (!c.alias) return toast('별칭을 입력해 주세요');
  S.children[i] = c; save(); toast('수정했어요'); go('/kids');
 },
 lookup: fd => {
  const r = parseLookup(fd.get('q'));
  if (r.kind === 'query') return go('/search?' + new URLSearchParams({q:r.q}));
  if (r.kind === 'product') return go('/product/' + r.pid);
  if (r.kind === 'bundle') return go('/candidates/' + r.id);
  if (r.kind === 'invalid') return toast('링크 형식을 확인해 주세요');
  if (r.kind === 'not-coupang') return toast('쿠팡 상품 링크만 지원해요. 제품명으로 검색해 보세요.');
  go('/search?fail=1');
 },
 search: fd => go('/search?' + new URLSearchParams([...fd].filter(([, v]) => v)))
};

document.addEventListener('click', e => {
 const el = e.target.closest('[data-act]');
 const act = el && own(actions, el.dataset.act);
 if (act) { e.preventDefault(); act(el, e); }
});
document.addEventListener('submit', e => {
 const f = e.target.closest('form[data-form]'); if (!f) return;
 e.preventDefault();
 own(forms, f.dataset.form)?.(new FormData(f), f);
});

// ---------- 라우터 ----------
function route() {
 const {name, args:[a], params} = parseHash(location.hash, 'home');
 let key = own(screens, name) ? name : 'home';
 if (!S.consent) key = 'welcome';
 else if (key === 'welcome') key = 'home';
 $('#main').innerHTML = screens[key](a, params);
 const tab = own(TAB_OF, key);
 for (const n of document.querySelectorAll('[data-tab]')) {
  if (n.dataset.tab === tab) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
 }
 document.body.dataset.screen = key;
 document.title = `${$('#main h1')?.textContent || '홈'} · 어푸`;
}
let lastPath = location.hash.split('?')[0];
window.addEventListener('hashchange', () => {
 if ($('#dialog').open) $('#dialog').close();
 route();
 const p = location.hash.split('?')[0];
 if (p !== lastPath) { window.scrollTo(0, 0); $('#main').focus({preventScroll:true}); }
 lastPath = p;
});
route();
