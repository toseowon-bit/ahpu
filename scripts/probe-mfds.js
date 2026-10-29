import {MfdsClient} from '../src/providers/mfds-client.js';
try {
 const result=await new MfdsClient({apiKey:process.env.MFDS_API_KEY}).readRecallPage(1,5);
 // 원문/개인정보/키를 출력하지 않고 응답 형태만 확인.
 console.log(JSON.stringify({serviceId:result.serviceId,rowCount:result.rows.length,totalCount:result.totalCount,fields:Object.keys(result.rows[0]||{}),fetchedAt:result.fetchedAt,validated:false},null,2));
} catch (error) {console.error(error.message);process.exitCode=1;}
