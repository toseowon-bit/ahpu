const provenance = (id) => ({kind:'demo',sourceRecordId:id,fetchedAt:null,sourceUrl:null});
const product = (id,name,manufacturer,reportNumber,licenseNumber,label) => ({id,name,manufacturer,category:'가상 식품',identifiers:{reportNumber,licenseNumber,foodQr:null},label,provenance:provenance(id)});
export const products = [
 product('demo-001','우리쌀 바삭 과자','가상 햇살식품','DEMO-R001','DEMO-L001',{status:'provided',contains:['우유','대두'],mayContain:['땅콩'],text:'[가상 표시] 우유, 대두 함유. 땅콩 사용 제품과 같은 제조시설에서 제조.'}),
 product('demo-002','사과 한입 퓨레','가상 초록식품','DEMO-R002','DEMO-L002',{status:'unknown',contains:[],mayContain:[],text:null}),
 product('demo-003','우리쌀 바삭 과자','가상 달빛식품','DEMO-R003','DEMO-L003',{status:'provided',contains:['밀'],mayContain:[],text:'[가상 표시] 밀 함유.'}),
 product('demo-004','고소한 두유','가상 아침식품',null,null,{status:'provided',contains:['대두'],mayContain:[],text:'[가상 표시] 대두 함유.'})
];
export const events = [
 {id:'demo-event-001',type:'recall',name:products[0].name,manufacturer:products[0].manufacturer,identifiers:products[0].identifiers,reason:'[가상 사례] 기준에 부적합한 검사 결과',publishedAt:'2026-10-28',lot:'DEMO-LOT-A',expiry:'2027-01-31',action:'[가상 안내] 구매처에 반품 문의',provenance:provenance('demo-event-001')},
 {id:'demo-event-002',type:'sales-suspension',name:products[3].name,manufacturer:products[3].manufacturer,identifiers:{reportNumber:null,licenseNumber:null},reason:'[가상 사례] 표시사항 확인 필요',publishedAt:'2026-10-27',lot:null,expiry:null,action:'[가상 안내] 업체 확인 필요',provenance:provenance('demo-event-002')}
];
export function createDemoProvider() {
 return {kind:'demo',async search({q='',manufacturer=''}) {
   const {normalize} = await import('../matching.js');
   return products.filter(p => normalize(p.name+' '+p.manufacturer).includes(normalize(q)) && normalize(p.manufacturer).includes(normalize(manufacturer)));
 },async getProduct(id){return products.find(p=>p.id===id) ?? null;},async listEvents(){return events;}};
}
