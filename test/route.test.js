import {test} from 'node:test';
import assert from 'node:assert/strict';
import {own, parseHash} from '../public/route.js';

test('own(): 객체 자신의 키만 돌려주고 프로토타입 이름은 막는다', () => {
 const screens = {home: () => 'home'};
 assert.equal(own(screens, 'home'), screens.home);
 for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) assert.equal(own(screens, k), undefined, k);
 assert.equal(own(screens, undefined), undefined);
});

test('parseHash(): 이름·인자·쿼리 분리, 잘못된 % 인코딩은 기본 화면으로', () => {
 const r = parseHash('#/complain/p03/' + encodeURIComponent('이물 발견') + '?q=1', 'home');
 assert.deepEqual([r.name, r.args, r.params.get('q'), r.valid], ['complain', ['p03', '이물 발견'], '1', true]);
 assert.equal(parseHash('', 'onboarding').name, 'onboarding');
 const bad = parseHash('#/result/%E0%A4%A', 'home');
 assert.deepEqual([bad.name, bad.valid], ['home', false]);
});

test('주소로 HTML을 넣는 경로(#/constructor/<html>)가 화면 함수로 해석되지 않는다', () => {
 const screens = {home: () => 'home'};
 const r = parseHash('#/constructor/' + encodeURIComponent('<meta http-equiv=refresh content="0;url=https://evil.example">'), 'home');
 assert.equal(own(screens, r.name), undefined);
});
