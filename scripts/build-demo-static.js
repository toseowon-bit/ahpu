// /demo 화면을 S3 같은 정적 호스팅용 폴더(dist/demo-static)로 만든다.
// demo.html → index.html, 자산 경로는 상대 경로로 바꾸고 CSP는 meta 태그로 넣는다(S3는 응답 헤더를 붙이지 않음).
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const src = new URL('../public/', import.meta.url);
const out = new URL('../dist/demo-static/', import.meta.url);
// index.html 외에 함께 올릴 파일. demo.js가 import하는 모듈도 여기에 있어야 한다(test/demo.test.js가 확인).
export const STATIC_FILES = ['demo.css', 'demo.js', 'allergen-keywords.js', 'route.js', 'catalog.js'];
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: https://*.coupangcdn.com; base-uri 'none'; form-action 'self'";

export async function build() {
 await rm(out, {recursive: true, force: true});
 await mkdir(out, {recursive: true});
 let html = await readFile(new URL('demo.html', src), 'utf8');
 for (const f of ['demo.css', 'demo.js']) {
  if (!html.includes(`"/${f}"`)) throw new Error(`demo.html에서 /${f} 참조를 찾지 못했습니다.`);
  html = html.replace(`"/${f}"`, `"./${f}"`);
 }
 html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="no-referrer">`);
 await writeFile(new URL('index.html', out), html);
 for (const f of STATIC_FILES) await writeFile(new URL(f, out), await readFile(new URL(f, src)));
 console.log(`dist/demo-static 생성: index.html, ${STATIC_FILES.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await build();
