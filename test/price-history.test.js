import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/demo.js',import.meta.url),'utf8');
const functions=source.split('// ---------- illustrative price history (never real market data) ----------')[1].split('// ---------- end illustrative price history ----------')[0];
const ctx=vm.createContext({esc:s=>String(s),won:n=>n.toLocaleString('ko-KR')+'원'});
vm.runInContext(functions,ctx);
test('price histories have fixed dates, stable overlapping periods and valid prices',()=>{
 const a=vm.runInContext('demoPriceHistory("p02",30)',ctx),b=vm.runInContext('demoPriceHistory("p02",180)',ctx);
 assert.equal(a.length,30);assert.equal(b.length,180);assert.equal(a.at(-1).date,'2026-11-15');
 assert.equal(JSON.stringify(a),JSON.stringify(b.slice(-30)));
 assert.ok(a.every(x=>Number.isFinite(x.price)&&x.price>0));
 assert.equal(vm.runInContext('demoPriceHistory("p02",7).length',ctx),30);
});
test('panel identifies fictional data, period and disabled alert; no external link',()=>{
 const html=vm.runInContext('pricePanel("p02",90)',ctx);
 assert.match(html,/가상 데이터/);assert.match(html,/실제 쿠팡 가격 미연동/);
 assert.match(html,/data-days="90" aria-pressed="true"/);
 assert.match(html,/aria-label="가상 가격 변동 그래프/);
 assert.match(html,/<button[^>]+disabled>/);assert.doesNotMatch(html,/href=|style=/);
});
test('price panel follows allergen analysis in fictional and beta details',()=>{
 const result=source.split('screens.result = pid => {')[1].split('screens.alternatives')[0];
 assert.ok(result.indexOf('${pricePanel(p.id)}')>result.indexOf('다시 확인할 항목'));
 const live=source.split('function liveItem(pid)')[1].split('const loaders')[0];
 assert.ok(live.indexOf('${pricePanel("live-preview")}')>live.indexOf('id="live-analysis"'));
});
