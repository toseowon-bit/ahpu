import test from 'node:test';
import assert from 'node:assert/strict';
import {matchProduct,productSafety} from '../src/matching.js';
import {products,events} from '../src/providers/demo.js';
test('품목번호와 업체번호가 모두 일치해야 확정 연결',()=>{assert.equal(matchProduct(products[0],events[0]),'identifier-match');assert.equal(matchProduct(products[2],events[0]),'none');});
test('식별정보 없는 동일 이름/업체는 후보에만 노출',()=>{assert.equal(matchProduct(products[3],events[1]),'candidate');const s=productSafety(products[3],events);assert.equal(s.events.length,0);assert.equal(s.candidates.length,1);assert.equal(s.status,'not-confirmed');});
test('명칭이 같아도 식별번호가 충돌하면 연결하지 않는다',()=>{const e={...events[0],identifiers:{...events[0].identifiers,reportNumber:'OTHER'}};assert.equal(matchProduct(products[0],e),'none');});
test('기록 없음은 안전 판정이 아니다',()=>{assert.equal(productSafety(products[1],events).status,'not-confirmed');});
test('식별번호 하나만 일치하면 확정하지 않는다',()=>{const e={...events[0],identifiers:{reportNumber:products[0].identifiers.reportNumber,licenseNumber:null}};assert.equal(matchProduct(products[0],e),'candidate');});
