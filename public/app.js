const $ = s => document.querySelector(s);
const el = (tag,text,cls) => {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
let tab='products',items=[],allProducts=[],selected=null,sequence=0,detailSequence=0;
let favorites=[];
try {const stored=JSON.parse(localStorage.getItem('ahpu:favorites:v1')||'[]');if(Array.isArray(stored))favorites=[...new Set(stored.filter(v=>typeof v==='string' && /^demo-\d{3}$/.test(v)))];} catch {$('#storage-notice').textContent='저장된 관심 제품을 읽지 못했습니다. 이 화면에서 다시 등록할 수 있습니다.';}
const count=()=>$('#favorite-count').textContent=favorites.length;
function save(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];try{localStorage.setItem('ahpu:favorites:v1',JSON.stringify(favorites));}catch{$('#storage-notice').textContent='브라우저 저장이 차단되어 관심 제품이 이 화면에서만 유지됩니다.';}count();if(selected)showDetail(selected);if(tab==='favorites')renderProducts(allProducts.filter(p=>favorites.includes(p.id)));}
async function get(path){const r=await fetch(path);const d=await r.json();if(!r.ok)throw new Error(d.error||'정보를 불러오지 못했습니다.');return d;}
function tag(text,cls=''){return el('span',text,'badge '+cls);}
function renderProducts(products){const root=$('#results');root.replaceChildren();if(!products.length){root.append(el('p',tab==='favorites'?'아직 관심 제품이 없어요. 제품 상세에서 등록해 보세요.':'검색 결과가 없어요. 제품명이나 업체명을 바꿔 보세요.','notice'));return;}
 for(const p of products){const b=el('button',undefined,'product-card');b.type='button';b.append(tag('가상 제품'),el('h2',p.name),el('p',p.manufacturer),el('span','안전정보 보기 →','card-link'));b.addEventListener('click',()=>showDetail(p.id));root.append(b);}}
function eventCard(e,candidate=false){const box=el('article',undefined,'event');box.append(tag(candidate?'매칭 후보 · 동일 제품 미확정':e.type==='recall'?'회수 사례 · 예시':'판매중지 사례 · 예시',candidate?'amber':'red'),el('h3',e.name),el('p',e.manufacturer),el('p',e.reason));
 const dl=el('dl');for(const [k,v] of [['등록일',e.publishedAt],['대상 LOT',e.lot||'정보 없음'],['유통·소비기한',e.expiry||'정보 없음'],['안내',e.action],['출처','어푸 가상 시나리오 · 실제 공지 아님']]){dl.append(el('dt',k),el('dd',v));}box.append(dl);return box;}
async function showDetail(id){const n=++detailSequence;selected=id;const root=$('#detail');root.setAttribute('aria-busy','true');root.replaceChildren(el('p','제품 정보를 불러오는 중…'));
 try{const {product:p,safety:s}=await get('/api/products/'+encodeURIComponent(id));if(n!==detailSequence)return;root.replaceChildren(tag('예시 데이터'),el('h2',p.name),el('p',p.manufacturer,'muted'));
 const fav=el('button',favorites.includes(id)?'♥ 관심 제품 해제':'♡ 관심 제품 등록','favorite');fav.setAttribute('aria-pressed',String(favorites.includes(id)));fav.onclick=()=>save(id);root.append(fav);
 root.append(el('h3','제품 식별정보'),el('p','품목번호: '+(p.identifiers.reportNumber||'미확인')),el('p','업체 인허가번호: '+(p.identifiers.licenseNumber||'미확인')),
 el('h3','회수·판매중지 정보'),el('p',s.events.length?'식별번호가 일치하는 예시 기록이 있습니다. 대상 LOT·기한을 별도로 확인해야 합니다.':'연결된 회수 기록이 확인되지 않았습니다. 안전을 의미하지 않습니다.','notice'));
 s.events.forEach(e=>root.append(eventCard(e)));if(s.candidates.length){root.append(el('h3','동일 제품인지 확인이 필요한 기록'));s.candidates.forEach(e=>root.append(eventCard(e,true)));}
 root.append(el('h3','알레르기 표시 · 예시'));
 if(p.label.status==='unknown'){root.append(el('p','표시정보 미확인. 알레르기 성분이 없다는 의미가 아닙니다.','notice'));}else{root.append(el('p',p.label.text),el('p','함유 표시: '+p.label.contains.join(', ')),el('p','동일 제조시설 등 주의 표시: '+(p.label.mayContain.join(', ')||'예시 데이터에 기재 없음')));}
 root.append(el('p','실제 포장지의 원재료와 주의 표시를 확인하세요. 자녀별 알레르기 판정은 아직 제공하지 않습니다.','hint'),el('p',s.coverage,'hint'));
 }catch(e){if(n===detailSequence)root.replaceChildren(el('p',e.message,'notice'));}finally{if(n===detailSequence)root.setAttribute('aria-busy','false');}}
async function load(){const n=++sequence;$('#message').textContent='불러오는 중…';$('#results').setAttribute('aria-busy','true');
 try{if(tab==='recalls'){const d=await get('/api/recalls');if(n!==sequence)return;items=d.items;$('#results').replaceChildren(...items.map(e=>eventCard(e)));}
 else {const params=tab==='favorites'?new URLSearchParams():new URLSearchParams(new FormData($('#search')));const d=await get('/api/products?'+params);if(n!==sequence)return;items=d.items;if(tab==='favorites'){allProducts=items;items=items.filter(p=>favorites.includes(p.id));}renderProducts(items);}
 $('#message').textContent=`${items.length}개 ${tab==='recalls'?'예시 기록':'예시 제품'}`;
 }catch(e){if(n===sequence){$('#results').replaceChildren();$('#message').textContent=e.message;}}finally{if(n===sequence)$('#results').setAttribute('aria-busy','false');}}
function setTab(value){tab=value;document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});load();}
$('#search').onsubmit=e=>{e.preventDefault();setTab('products');};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));count();load();
