import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApp, assets} from '../src/server.js';

let server, base;
before(async () => {
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

test('마케팅 랜딩(/landing)은 브랜드 히어로와 외부 자산 없는 구조를 쓴다', async () => {
  for (const [path, type] of [
    ['/landing', 'text/html'],
    ['/landing.html', 'text/html'],
    ['/landing.js', 'text/javascript'],
    ['/landing.css', 'text/css'],
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type') || '', new RegExp(type));
  }
  const html = await (await fetch(base + '/landing')).text();
  assert.match(html, /어푸/);
  assert.match(html, /우리 아이 기준으로/);
  assert.match(html, /landing\.css/);
  assert.match(html, /landing\.js/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /<style|\sstyle=/);
  assert.ok(assets['/landing']);
  assert.ok(assets['/fonts/noto-sans-kr-900.woff2']);
  assert.ok(assets['/fonts/outfit-800.woff2']);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
  assert.doesNotMatch(html, /toss/i);
  const hrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
  assert.doesNotMatch(hrefs.join('\n'), /^\/(demo)?$/m, '앱·데모 링크는 상대 경로가 아니라 ahpu.kr 절대 URL이어야 한다');
  assert.equal(hrefs.filter((h) => h === 'https://ahpu.kr/').length, 4);
  assert.equal(hrefs.filter((h) => h === 'https://ahpu.kr/demo').length, 3);
  assert.ok(!/<a\b[^>]*target=/.test(html), 'CTA는 같은 탭에서 열린다');
  for (const path of ['/favicon.svg', '/ahpu-mark.svg']) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type') || '', /image\/svg\+xml/);
    const svg = await r.text();
    assert.match(svg, /<svg[^>]+viewBox="0 0 100 100"/);
    assert.match(svg, /<circle cx="62" cy="44" r="17"/);
  }
  const imgSrcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imgSrcs.length > 0);
  for (const src of imgSrcs) assert.equal((await fetch(base + src)).status, 200, src);
  const font = await fetch(base + '/fonts/noto-sans-kr-900.woff2');
  assert.equal(font.status, 200);
  assert.match(font.headers.get('content-type') || '', /font\/woff2/);
  assert.doesNotMatch(
    readFileSync(new URL('../public/landing.js', import.meta.url), 'utf8'),
    /\sstyle=/
  );
});

test('vercel.json은 landing.ahpu.kr 루트를 정적 index.html보다 먼저 /landing으로 보낸다', () => {
  const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const redirect = cfg.redirects?.find(
    (r) => r.source === '/' && r.has?.[0]?.type === 'host' && r.has[0].value === 'landing.ahpu.kr'
  );
  assert.ok(redirect, 'redirects는 정적 파일보다 먼저 평가된다');
  assert.equal(redirect.destination, '/landing');
  assert.equal(redirect.permanent, false);
  assert.ok(
    !cfg.rewrites.some((r) => r.source === '/'),
    '정적 public/index.html이 있어 "/" 리라이트는 적용되지 않는다'
  );
  assert.ok(cfg.rewrites.some((r) => r.source === '/landing' && r.destination === '/landing.html'));
});
