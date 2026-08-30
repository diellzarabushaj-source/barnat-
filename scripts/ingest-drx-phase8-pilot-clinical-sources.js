'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const CONFIG_PATH=path.join(ROOT,'data','drx-phase8-pilot-clinical-sources-v1.json');
const SHA=/^[0-9a-f]{64}$/;
const ALLOWED_SECTIONS=new Set(['2','4.1','4.2','4.3','4.4','4.5','4.6','4.7','4.8','4.9']);

function arg(name){
  const hit=process.argv.find(value=>value.startsWith('--'+name+'='));
  return hit ? hit.slice(name.length+3) : null;
}
function fail(message){throw new Error(message);}
function sha256(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
function normalizeUrl(raw){
  return String(raw||'').trim().replace(/\/+$/,'').replace(/\/rest(?:\/v1)?$/i,'').replace(/\/+$/,'');
}

const artifactRoot=path.resolve(arg('artifact')||path.join(ROOT,'artifacts','drx-phase8-pilot-clinical'));
const indexPath=path.resolve(arg('index')||path.join(artifactRoot,'index.json'));
const url=normalizeUrl(process.env.MEDINDEX_SUPABASE_URL||process.env.SUPABASE_URL||'https://ftuchtmolddhhsdcwnqe.supabase.co');
const key=String(
  process.env.MEDINDEX_SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SECRET_KEY
  || process.env.MEDINDEX_SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || ''
).trim();

if(!key) fail('Phase 8 clinical-reference ingest requires a Supabase service/secret key.');
if(!url.startsWith('https://')) fail('Phase 8 clinical-reference ingest requires an HTTPS Supabase project URL.');
if(!fs.existsSync(indexPath)) fail('Phase 8 clinical-reference index not found: '+indexPath);

const config=JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8'));
const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
if(config.schemaVersion!=='drx-phase8-pilot-clinical-sources-v1') fail('Unexpected config schemaVersion');
if(index.schemaVersion!=='drx-phase8-pilot-clinical-extraction-v1') fail('Unexpected extraction schemaVersion');
if(index.complete!==true || index.extractedCount!==2 || index.failedCount!==0) fail('Refusing incomplete Phase 8 clinical-reference extraction.');
if(index.publicationAllowed!==false || index.automaticVerificationAllowed!==false) fail('Extraction index is not fail-closed.');

const configByKey=new Map(config.sources.map(source=>[source.clinicalSourceKey,source]));

function readAndVerifyRow(row){
  const source=configByKey.get(row.clinicalSourceKey);
  if(!source) fail(row.clinicalSourceKey+': source missing from config');
  if(source.drugId!==row.drugId || source.url!==row.requestedUrl || source.expectedTier!==row.sourceTier) {
    fail(row.clinicalSourceKey+': index/config identity mismatch');
  }
  if(row.validation?.presentationMatchStatus!=='MATCHED'
     || row.validation?.productIdentityVerifiedByThisSource!==false
     || row.validation?.rulePublicationAllowed!==false) {
    fail(row.clinicalSourceKey+': extraction validation is not clinical-reference-only');
  }

  const rawPath=path.join(artifactRoot,row.archiveFiles.rawPath);
  const sectionsPath=path.join(artifactRoot,row.archiveFiles.sectionsPath);
  if(!fs.existsSync(rawPath) || !fs.existsSync(sectionsPath)) fail(row.clinicalSourceKey+': archive files missing');

  const raw=fs.readFileSync(rawPath);
  const rawHash=sha256(raw);
  if(rawHash!==row.rawSha256 || rawHash!==row.snapshotId || !SHA.test(rawHash)) {
    fail(row.clinicalSourceKey+': raw archive hash mismatch');
  }
  if(raw.length!==Number(row.contentLength)) fail(row.clinicalSourceKey+': raw archive length mismatch');

  const payload=JSON.parse(fs.readFileSync(sectionsPath,'utf8'));
  if(payload.schemaVersion!=='drx-dose-section-payload-v1') fail(row.clinicalSourceKey+': unexpected section payload version');
  if(payload.snapshotId!==row.snapshotId || payload.rawSha256!==row.rawSha256) {
    fail(row.clinicalSourceKey+': section payload snapshot mismatch');
  }

  const sections=[];
  for(const [code,section] of Object.entries(payload.sections||{})){
    if(!ALLOWED_SECTIONS.has(code)) continue;
    const text=String(section?.text||'');
    if(!text.trim()) continue;
    const digest=sha256(Buffer.from(text,'utf8'));
    if(digest!==section.sha256 || digest!==row.sectionSha256?.[code]) {
      fail(row.clinicalSourceKey+' section '+code+': hash mismatch');
    }
    sections.push({
      snapshot_id:row.snapshotId,
      section_code:code,
      section_key:section.key||code,
      heading:section.heading||null,
      section_text:text,
      section_sha256:digest,
      parser_version:row.parserSchemaVersion,
      extraction_status:'extracted'
    });
  }

  for(const required of ['2','4.1','4.2']){
    if(!sections.some(section=>section.section_code===required)) {
      fail(row.clinicalSourceKey+': required section '+required+' missing');
    }
  }

  return {
    source,
    snapshot:{
      snapshot_id:row.snapshotId,
      source_key:row.clinicalSourceKey,
      source_url:row.requestedUrl,
      final_url:row.finalUrl,
      source_tier:row.sourceTier,
      authority:row.authority,
      jurisdiction:row.jurisdiction||null,
      document_type:'smpc',
      document_date:row.documentDate,
      fetched_at:row.fetchedAt,
      content_type:row.contentType,
      content_length:row.contentLength,
      raw_sha256:row.rawSha256,
      etag:row.etag||null,
      last_modified:row.lastModified||null,
      parser_version:row.parserSchemaVersion,
      archive_locator:process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
        ? 'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID
        : null
    },
    sections
  };
}

async function request(pathname,options={}){
  const response=await fetch(url+'/rest/v1/'+pathname,{
    method:options.method||'POST',
    headers:{
      apikey:key,
      Authorization:'Bearer '+key,
      'Content-Type':'application/json',
      ...(options.prefer?{Prefer:options.prefer}:{})
    },
    body:options.body===undefined?undefined:JSON.stringify(options.body),
    signal:AbortSignal.timeout(15000)
  });
  const text=await response.text();
  if(!response.ok) fail(pathname+' failed '+response.status+': '+text.slice(0,600));
  return text ? JSON.parse(text) : null;
}

async function main(){
  const verified=index.rows.map(readAndVerifyRow);

  await request('dose_source_snapshots_v3?on_conflict=snapshot_id',{
    body:verified.map(item=>item.snapshot),
    prefer:'resolution=ignore-duplicates,return=minimal'
  });

  await request('dose_source_sections_v3?on_conflict=snapshot_id,section_code',{
    body:verified.flatMap(item=>item.sections),
    prefer:'resolution=ignore-duplicates,return=minimal'
  });

  const registrations=[];
  for(const item of verified){
    const result=await request('rpc/drx_phase8_register_clinical_reference_v1',{
      body:{p_reference:{
        registrationVersion:'drx-phase8-clinical-reference-v1',
        drugId:item.source.drugId,
        sourceUrl:item.source.url,
        snapshotId:item.snapshot.snapshot_id,
        presentationMatchStatus:'MATCHED'
      }}
    });
    if(result?.sourceStatus!=='INGESTED'
       || result?.presentationMatchStatus!=='MATCHED'
       || result?.evidenceReviewStatus!=='READY_FOR_REVIEW'
       || result?.automaticProductIdentityAllowed!==false
       || result?.automaticRulePublicationAllowed!==false){
      fail(item.source.clinicalSourceKey+': registration returned an unsafe or incomplete state');
    }
    registrations.push(result);
  }

  const evidence={
    evidenceVersion:'drx-phase8-pilot-clinical-ingest-evidence-v1',
    generatedAt:new Date().toISOString(),
    sourceCount:verified.length,
    snapshots:verified.map(item=>({
      drugId:item.source.drugId,
      sourceKey:item.snapshot.source_key,
      snapshotId:item.snapshot.snapshot_id,
      sourceTier:item.snapshot.source_tier,
      documentDate:item.snapshot.document_date,
      section2Sha256:item.sections.find(s=>s.section_code==='2')?.section_sha256||null,
      section41Sha256:item.sections.find(s=>s.section_code==='4.1')?.section_sha256||null,
      section42Sha256:item.sections.find(s=>s.section_code==='4.2')?.section_sha256||null
    })),
    registrations,
    productIdentityVerifiedByClinicalReference:false,
    automaticRulePublicationAllowed:false,
    publicationAllowed:false
  };
  fs.writeFileSync(path.join(artifactRoot,'ingest-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
