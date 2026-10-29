import {createDemoProvider} from './demo.js';
// 절대로 live 실패 후 demo로 대체하지 않는다.
export function createProvider(mode = 'demo') {
 if (mode !== 'demo') throw new Error('실제 API 및 제품 카탈로그 검증 전에는 DATA_PROVIDER=demo만 사용할 수 있습니다.');
 return createDemoProvider();
}
