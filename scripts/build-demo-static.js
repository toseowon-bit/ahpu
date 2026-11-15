// /demo 화면을 S3 같은 정적 호스팅용 폴더(dist/demo-static)로 만든다.
// demo.html → index.html, 자산 경로는 상대 경로로 바꾸고 CSP는 meta 태그로 넣는다(S3는 응답 헤더를 붙이지 않음).
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
const src = new URL('../public/', import.meta.url);
const out = new URL('../dist/demo-static/', import.meta.url);
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://*.coupangcdn.com; base-uri 'none'; form-action 'self'";
await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
let html = await readFile(new URL('demo.html', src), 'utf8');
for (const f of ['demo.css', 'demo.js']) {
 if (!html.includes(`"/${f}"`)) throw new Error(`demo.html에서 /${f} 참조를 찾지 못했습니다.`);
 html = html.replace(`"/${f}"`, `"./${f}"`);
}
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="no-referrer">`);
await writeFile(new URL('index.html', out), html);
for (const f of ['demo.css', 'demo.js', 'allergen-keywords.js']) await writeFile(new URL(f, out), await readFile(new URL(f, src)));
console.log('dist/demo-static 생성: index.html, demo.css, demo.js, allergen-keywords.js');
