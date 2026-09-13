'use strict';
const engine=require('./dozologjia-master');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');
  const auth=await import('./auth.mjs');
  if(!(await auth.verifySessionToken(auth.sessionFromRequest(req))))return res.status(401).json({error:'Sesioni nuk është aktiv.'});
  const view=new URL(req.url,'http://localhost').searchParams.get('view');
  if(view==='master-catalog'&&req.method==='GET')return res.status(200).json(engine.catalog());
  if(view!=='master-calculate'||req.method!=='POST'){res.setHeader('Allow',view==='master-catalog'?'GET':'POST');return res.status(405).json({error:'Metodë e palejuar.'});}
  try {
    let body=req.body;
    if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw Error();}body=raw;}
    if(Buffer.byteLength(typeof body==='string'?body:JSON.stringify(body))>16384)throw Error();
    if(typeof body==='string')body=JSON.parse(body);
    const result=engine.calculate(body);return res.status(result.outcome==='BLOCKED'?422:200).json(result);
  }catch{return res.status(400).json({error:'Kërkesë e pavlefshme.'});}
};
