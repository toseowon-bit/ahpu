import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.js';
let server,base;
before(async()=>{server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;});
after(()=>new Promise(r=>server.close(r)));
test('데모 화면과 자산을 제공하고 가상 데이터임을 알린다',async()=>{
 for (const [path,type] of [['/demo','text/html'],['/demo.html','text/html'],['/demo.js','text/javascript'],['/demo.css','text/css']]) {
  const r=await fetch(base+path);assert.equal(r.status,200,path);assert.match(r.headers.get('content-type'),new RegExp(type));
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
 }
 assert.match(await (await fetch(base+'/demo')).text(),/가상 예시/);
});
test('데모 화면은 CSP에 막히는 인라인 스크립트·스타일을 쓰지 않는다',async()=>{
 const html=await (await fetch(base+'/demo')).text();
 assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/);assert.doesNotMatch(html,/<style|\sstyle=/);
 assert.doesNotMatch(await (await fetch(base+'/demo.js')).text(),/\sstyle=/);
});

test('demo.js가 import하는 모듈은 서버 허용 목록과 정적 빌드에 모두 포함된다', async () => {
 const {readFileSync} = await import('node:fs');
 const {assets} = await import('../src/server.js');
 const {STATIC_FILES} = await import('../scripts/build-demo-static.js');
 const imports = [...readFileSync(new URL('../public/demo.js', import.meta.url), 'utf8').matchAll(/from '\.\/([\w.-]+\.js)'/g)].map(m => m[1]);
 assert.ok(imports.length >= 2);
 for (const f of ['demo.js', 'demo.css', ...imports]) {
  assert.ok(assets['/' + f], `server allow-list missing ${f}`);
  assert.ok(STATIC_FILES.includes(f), `static build missing ${f}`);
 }
});
