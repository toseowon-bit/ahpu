import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createProvider} from './providers/index.js';
import {productSafety} from './matching.js';
import {createLookupProviders} from './providers/lookup.js';
import {createRateLimiter, clientKey} from './rate-limit.js';
import {PARTNERS_DISCLOSURE} from './providers/coupang-partners.js';
import {productSearchTerm} from '../public/allergen-keywords.js';
export const assets = {
 '/':['index.html','text/html; charset=utf-8'],
 '/app.js':['app.js','text/javascript; charset=utf-8'],
 '/styles.css':['styles.css','text/css; charset=utf-8'],
 '/landing':['landing.html','text/html; charset=utf-8'],
 '/landing.html':['landing.html','text/html; charset=utf-8'],
 '/landing.js':['landing.js','text/javascript; charset=utf-8'],
 '/landing.css':['landing.css','text/css; charset=utf-8'],
 '/favicon.svg':['favicon.svg','image/svg+xml'],
 '/ahpu-mark.svg':['ahpu-mark.svg','image/svg+xml'],
 '/demo':['demo.html','text/html; charset=utf-8'],
 '/demo.html':['demo.html','text/html; charset=utf-8'],
 '/demo.js':['demo.js','text/javascript; charset=utf-8'],
 '/demo.css':['demo.css','text/css; charset=utf-8'],
 '/allergen-keywords.js':['allergen-keywords.js','text/javascript; charset=utf-8'],
 '/route.js':['route.js','text/javascript; charset=utf-8'],
 '/catalog.js':['catalog.js','text/javascript; charset=utf-8'],
 '/fonts/outfit-400.woff2':['fonts/outfit-400.woff2','font/woff2'],
 '/fonts/outfit-700.woff2':['fonts/outfit-700.woff2','font/woff2'],
 '/fonts/outfit-800.woff2':['fonts/outfit-800.woff2','font/woff2'],
 '/fonts/noto-sans-kr-400.woff2':['fonts/noto-sans-kr-400.woff2','font/woff2'],
 '/fonts/noto-sans-kr-900.woff2':['fonts/noto-sans-kr-900.woff2','font/woff2']
};
export function createHandler({provider = createProvider(process.env.DATA_PROVIDER || 'demo'), lookup = createLookupProviders(), limiter = createRateLimiter()} = {}) {
 return async (req,res)=> {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data: https://*.coupangcdn.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json = (code,data) => {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
   if (req.method !== 'GET') return json(405,{error:'GET 요청만 지원합니다.'});
   const url = new URL(req.url,'http://localhost');
   const meta = {provider:provider.kind,liveVerified:false,snapshotAt:null};
   if (url.pathname === '/api/status') return json(200,{...meta,notifications:'not-implemented',message:'가상 제품 및 가상 회수 사례입니다. 실제 식품 구매·섭취 판단에 사용할 수 없습니다.'});
   if (url.pathname === '/api/products') {
    const q=url.searchParams.get('q')||'',manufacturer=url.searchParams.get('manufacturer')||'';
    if (q.length>100 || manufacturer.length>100) return json(400,{error:'검색어는 100자 이하로 입력해 주세요.'});
    return json(200,{meta,items:await provider.search({q,manufacturer})});
   }
   if (url.pathname === '/api/lookup/status') return json(200,{coupang:lookup.coupang.kind,materials:lookup.materials.kind,validated:false,disclosure:PARTNERS_DISCLOSURE});
   if (url.pathname === '/api/coupang/search' || url.pathname === '/api/materials/search') {
    const r=limiter(clientKey(req));
    if (!r.ok) {res.setHeader('Retry-After',String(r.retryAfter));return json(429,{error:`요청이 많아요. ${r.retryAfter}초 뒤에 다시 시도해 주세요.`});}
   }
   if (url.pathname === '/api/coupang/search') {
    const q=(url.searchParams.get('q')||'').trim();
    if (!q || q.length>50) return json(400,{error:'검색어는 1~50자로 입력해 주세요.'});
    try {return json(200,{meta:{source:lookup.coupang.kind,validated:false,disclosure:PARTNERS_DISCLOSURE},items:await lookup.coupang.search(q,10)});}
    catch (e) {return json(502,{error:e.message});}
   }
   if (url.pathname === '/api/materials/search') {
    const q=(url.searchParams.get('q')||'').trim();
    if (!q || q.length>200) return json(400,{error:'제품명은 1~200자로 입력해 주세요.'});
    const term=productSearchTerm(q);
    if (!term) return json(422,{error:'상품명에서 검색어를 만들지 못해 식품안전나라를 조회하지 않았어요. 포장지의 원재료명과 알레르기 표시를 직접 확인해 주세요.'});
    try {return json(200,{meta:{source:lookup.materials.kind,validated:false,searchTerm:term},items:await lookup.materials.searchByName(term,10)});}
    catch (e) {return json(502,{error:e.message});}
   }
   if (url.pathname === '/api/recalls') return json(200,{meta,items:await provider.listEvents()});
   if (url.pathname.startsWith('/api/products/')) {
    const id=decodeURIComponent(url.pathname.slice('/api/products/'.length));
    const product=await provider.getProduct(id);
    if (!product) return json(404,{error:'제품을 찾지 못했습니다.'});
    return json(200,{meta,product,safety:productSafety(product,await provider.listEvents())});
   }
   if (assets[url.pathname]) {
    const [file,type]=assets[url.pathname];
    const content=await readFile(new URL('../public/'+file,import.meta.url));
    res.writeHead(200,{'Content-Type':type});return res.end(content);
   }
   return json(404,{error:'경로를 찾지 못했습니다.'});
  } catch {return json(500,{error:'정보를 불러오지 못했습니다. 다시 시도해 주세요.'});}
 };
}
export function createApp(options) {
 return http.createServer(createHandler(options));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
 const server=createApp();
 const port=Number(process.env.PORT || 3000),host=process.env.HOST || '127.0.0.1';
 server.listen(port,host,()=>console.log(`어푸 MVP: http://${host}:${server.address().port} (예시 데이터)`));
}
