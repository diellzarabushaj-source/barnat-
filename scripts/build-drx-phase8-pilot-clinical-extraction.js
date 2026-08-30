'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Archive = require('../lib/dose-source-archive.js');
const SmPC = require('../lib/smpc-parser.js');

const ROOT = path.resolve(__dirname,'..');
const CONFIG_PATH = path.join(ROOT,'data','drx-phase8-pilot-clinical-sources-v1.json');
const DEFAULT_OUTPUT_ROOT = path.join(ROOT,'artifacts','drx-phase8-pilot-clinical');

function arg(name) {
  const hit=process.argv.find(value=>value.startsWith('--'+name+'='));
  return hit ? hit.slice(name.length+3) : null;
}

function normal(value) {
  return SmPC.normalizeClinicalText(value)
    .toLowerCase()
    .replace(/[–—−]/g,'-')
    .replace(/\s+/g,' ')
    .trim();
}

function hasTokens(text,tokens) {
  const haystack=normal(text);
  return (tokens||[]).every(token=>haystack.includes(normal(token)));
}

function validateSnapshot(source,snapshot) {
  const failures=[];
  if(snapshot.sourceTier!==source.expectedTier) failures.push('source_tier');
  if(!snapshot.sourceDocument?.documentDate) failures.push('document_date');
  if(snapshot.snapshotId!==snapshot.rawSha256 || !/^[0-9a-f]{64}$/.test(String(snapshot.rawSha256||''))) {
    failures.push('raw_hash_identity');
  }

  const extractionGate=SmPC.publicationExtractionGate(snapshot.parsed);
  if(!extractionGate.allowed) failures.push(extractionGate.reason||'required_sections');
  if(!snapshot.composition?.text) failures.push('section_2');
  if(!snapshot.parsed?.sections?.['4.1']?.text) failures.push('section_4_1');
  if(!snapshot.parsed?.sections?.['4.2']?.text) failures.push('section_4_2');

  if(!hasTokens(snapshot.sourceDocument?.productName,source.productNameTokens)) failures.push('product_name_tokens');
  if(!hasTokens(snapshot.composition?.text,source.compositionTokens)) failures.push('composition_tokens');
  if(!hasTokens(snapshot.parsed?.sections?.['4.2']?.text,source.clinicalTokens)) failures.push('clinical_tokens');

  if(failures.length) {
    const error=new Error(source.clinicalSourceKey+' clinical-reference validation failed: '+failures.join(','));
    error.code='DRX_PHASE8_CLINICAL_REFERENCE_MISMATCH';
    error.failures=failures;
    throw error;
  }

  return {
    presentationMatchStatus:'MATCHED',
    referenceRole:'CLINICAL_REFERENCE_ONLY',
    productIdentityVerifiedByThisSource:false,
    rulePublicationAllowed:false,
    automaticVerificationAllowed:false
  };
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function fetchWithRetry(source,options={}) {
  const attempts=Math.max(1,Number(options.attempts)||3);
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{
      const snapshot=await Archive.fetchSourceSnapshot(source.url,{authoritativeOnly:true});
      return {snapshot,attempt};
    }catch(error){
      lastError=error;
      if(attempt<attempts) await sleep(800*attempt);
    }
  }
  throw lastError;
}

async function build(options={}) {
  const config=JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8'));
  if(config.schemaVersion!=='drx-phase8-pilot-clinical-sources-v1') {
    throw new Error('Unexpected Phase 8 pilot clinical source config version');
  }
  if(config.publicationAllowed!==false || config.automaticVerificationAllowed!==false) {
    throw new Error('Phase 8 pilot clinical source config must be fail-closed');
  }
  if(!Array.isArray(config.sources) || config.sources.length!==2) {
    throw new Error('Phase 8 pilot clinical source config must contain exactly 2 sources');
  }

  const outputRoot=path.resolve(options.outputRoot||arg('output')||DEFAULT_OUTPUT_ROOT);
  const rawDir=path.join(outputRoot,'raw');
  fs.mkdirSync(rawDir,{recursive:true});

  const rows=[];
  const errors=[];
  for(let index=0;index<config.sources.length;index+=1){
    const source=config.sources[index];
    if(index>0) await sleep(400);
    try{
      const {snapshot,attempt}=await fetchWithRetry(source);
      const validation=validateSnapshot(source,snapshot);
      const files=Archive.writeSnapshot(snapshot,rawDir);
      rows.push({
        drugId:source.drugId,
        v2ProductKey:source.v2ProductKey,
        exactMarketSnapshotId:source.exactMarketSnapshotId,
        clinicalSourceKey:source.clinicalSourceKey,
        requestedUrl:source.url,
        finalUrl:snapshot.finalUrl,
        expectedTier:source.expectedTier,
        sourceTier:snapshot.sourceTier,
        authority:snapshot.authority,
        jurisdiction:snapshot.jurisdiction,
        documentDate:snapshot.sourceDocument?.documentDate||null,
        productName:snapshot.sourceDocument?.productName||null,
        fetchedAt:snapshot.fetchedAt,
        contentType:snapshot.contentType,
        contentLength:snapshot.contentLength,
        etag:snapshot.etag||null,
        lastModified:snapshot.lastModified||null,
        rawSha256:snapshot.rawSha256,
        snapshotId:snapshot.snapshotId,
        parserSchemaVersion:snapshot.parser?.schemaVersion||null,
        sectionSha256:snapshot.sectionSha256||{},
        presentSections:snapshot.parser?.present||[],
        validation,
        fetchAttempt:attempt,
        archiveFiles:{
          rawPath:path.relative(outputRoot,files.rawPath),
          metaPath:path.relative(outputRoot,files.metaPath),
          sectionsPath:path.relative(outputRoot,files.sectionsPath)
        }
      });
    }catch(error){
      errors.push({
        drugId:source.drugId,
        clinicalSourceKey:source.clinicalSourceKey,
        error:error?.code||error?.message||'unknown_error',
        message:String(error?.message||error)
      });
    }
  }

  const complete=rows.length===2 && errors.length===0
    && rows.every(row=>row.validation?.presentationMatchStatus==='MATCHED'
      && row.sectionSha256?.['2']
      && row.sectionSha256?.['4.1']
      && row.sectionSha256?.['4.2']);

  const output={
    schemaVersion:'drx-phase8-pilot-clinical-extraction-v1',
    generatedAt:new Date().toISOString(),
    targetCount:2,
    extractedCount:rows.length,
    failedCount:errors.length,
    complete,
    publicationAllowed:false,
    automaticVerificationAllowed:false,
    rows,
    errors
  };

  fs.writeFileSync(path.join(outputRoot,'index.json'),JSON.stringify(output,null,2)+'\n');
  return output;
}

if(require.main===module){
  build().then(output=>{
    console.log(JSON.stringify({
      schemaVersion:output.schemaVersion,
      targetCount:output.targetCount,
      extractedCount:output.extractedCount,
      failedCount:output.failedCount,
      complete:output.complete,
      publicationAllowed:output.publicationAllowed
    },null,2));
    if(!output.complete) process.exitCode=1;
  }).catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={CONFIG_PATH,DEFAULT_OUTPUT_ROOT,normal,hasTokens,validateSnapshot,fetchWithRetry,build};
