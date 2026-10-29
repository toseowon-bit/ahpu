import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createProvider} from './providers/index.js';
import {productSafety} from './matching.js';
const assets = {'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8']};
export function createApp({provider = createProvider(process.env.DATA_PROVIDER || 'demo')} = {}) {
 return http.createServer(async (req,res)=> {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
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
 });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
 const server=createApp();
 const port=Number(process.env.PORT || 3000),host=process.env.HOST || '127.0.0.1';
 server.listen(port,host,()=>console.log(`어푸 MVP: http://${host}:${server.address().port} (예시 데이터)`));
}
