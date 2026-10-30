import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../api/index.js';
let server,base;
before(async()=>{server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
after(()=>new Promise(r=>server.close(r)));
test('Vercel rewrite 어댑터는 경로와 검색어를 보존한다',async()=>{
 const r=await fetch(base+'/api/index?__ahpu_route=products&q='+encodeURIComponent('우리쌀'));
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.items.length,2);assert.equal(data.meta.provider,'demo');
});
test('Vercel rewrite 제품 상세, 상태, 회수 목록 및 404',async()=>{
 for(const [path,status] of [['products/demo-001',200],['status',200],['recalls',200],['products/none',404]]){
  const r=await fetch(base+'/api/index?__ahpu_route='+encodeURIComponent(path));assert.equal(r.status,status,path);
 }
});
test('원본 URL을 받는 경우도 처리하고 서버를 별도로 listen하지 않는다',async()=>{
 const r=await fetch(base+'/api/status');assert.equal(r.status,200);assert.equal((await r.json()).liveVerified,false);
});
