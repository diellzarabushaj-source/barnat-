'use strict';
async function fetchRows(request){
 const rows=[];let total;
 for(let offset=0;offset<10000;offset+=500){
  const {data,response}=await request('user_prescriptions?select=user_id,client_id,payload&order=id.asc&limit=500&offset='+offset,{privileged:true,prefer:'count=exact',timeoutMs:15000});
  const range=response.headers.get('content-range')||'';
  if(!/^\d+-\d+\/\d+$/.test(range)&&range!=='*/0')throw Error('Incomplete private source');
  const count=Number(range.split('/').pop());
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count>10000||(total!==undefined&&count!==total)||data.length>500)throw Error('Incomplete private source');
  total=count;rows.push(...data);if(rows.length===total)break;if(!data.length||rows.length>total)throw Error('Incomplete private source');
 }
 if(total===undefined||rows.length!==total)throw Error('Incomplete private source');return rows;
}
module.exports={fetchRows};
