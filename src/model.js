/**
 * @typedef {{kind:'demo'|'mfds', sourceRecordId:string, fetchedAt:string|null,
 * sourceUrl:string|null}} Provenance
 * @typedef {{id:string,name:string,manufacturer:string,category:string,
 * identifiers:{reportNumber:string|null,licenseNumber:string|null,foodQr:string|null},
 * label:{status:'provided'|'unknown',contains:string[],mayContain:string[],text:string|null},
 * provenance:Provenance}} Product
 * @typedef {{id:string,type:'recall'|'sales-suspension',name:string,manufacturer:string,
 * identifiers:{reportNumber:string|null,licenseNumber:string|null},reason:string,
 * publishedAt:string,lot:string|null,expiry:string|null,action:string,
 * provenance:Provenance}} SafetyEvent
 * Favorites are local product IDs; alert delivery is a separate future service.
 */
export const MODEL_VERSION = 1;
