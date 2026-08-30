'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CAPTURE_VERSION = 'drx-phase8-exact-registry-v1';
const PARSER_VERSION = 'drx-phase8-mk-registry-parser-v1';

const SOURCES = [
  {
    drugId:'c8cd0467-da73-479c-b8e8-b785af833f59',
    registryId:'52577',
    sourceUrl:'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/52577',
    expected:{
      tradeName:'CO-ALMACIN',
      atcCode:'J01CR02',
      strength:'(400 mg/57 mg)/5 ml',
      form:'прашок за перорална суспензија',
      genericTokens:['amoxicillin','clavulanic acid'],
      packagingTokens:['17,5 g','70 ml'],
      companyToken:'алкалоид'
    }
  },
  {
    drugId:'84a1cf4a-6568-41d7-8d13-0f2b7715acae',
    registryId:'51848',
    sourceUrl:'https://lekovi.zdravstvo.gov.mk/drugsregister/detailview/51848',
    expected:{
      tradeName:'PARACETAMOL ALKALOID',
      atcCode:'N02BE01',
      strength:'500 mg',
      form:'таблета',
      genericTokens:['paracetamol'],
      packagingTokens:['500 таблети','50 х 10'],
      companyToken:'алкалоид'
    }
  }
];

function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16)))
    .replace(/&#([0-9]+);/g,(_,dec)=>String.fromCodePoint(parseInt(dec,10)));
}

function htmlToLines(html) {
  const text = decodeEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g,' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
      .replace(/<br\s*\/?>/gi,'\n')
      .replace(/<\/(?:div|p|li|tr|td|th|h[1-6]|section|article|label)>/gi,'\n')
      .replace(/<[^>]+>/g,' ')
  );
  return text
    .replace(/\r/g,'\n')
    .split(/\n+/)
    .map(line=>line.replace(/\s+/g,' ').trim())
    .filter(Boolean);
}

function findLabelIndex(lines,label) {
  const needle=String(label).toLocaleLowerCase('mk');
  return lines.findIndex(line=>line.toLocaleLowerCase('mk')===needle);
}

function valueAfter(lines,label) {
  const index=findLabelIndex(lines,label);
  if(index<0 || !lines[index+1]) throw new Error('Missing value after label: '+label);
  return lines[index+1];
}

function between(lines,startLabel,endLabel) {
  const start=findLabelIndex(lines,startLabel);
  const end=findLabelIndex(lines,endLabel);
  if(start<0 || end<0 || end<=start+1) {
    throw new Error('Missing section between '+startLabel+' and '+endLabel);
  }
  return lines.slice(start+1,end).join(' ').replace(/\s+/g,' ').trim();
}

function parseDateMk(value) {
  const match=String(value).trim().match(/^(\d{2})[.](\d{2})[.](\d{4})$/);
  if(!match) throw new Error('Unsupported registry date: '+value);
  return match[3]+'-'+match[2]+'-'+match[1];
}

function compact(value) {
  return String(value).toLocaleLowerCase('mk').replace(/\s+/g,'').replace(/[–—]/g,'-');
}

function parseRegistryHtml(html) {
  const lines=htmlToLines(html);
  const manufacturer=valueAfter(lines,'Производители:');
  return {
    tradeName:valueAfter(lines,'Име на лекот (латиница):'),
    genericName:valueAfter(lines,'Генеричко име'),
    atcCode:valueAfter(lines,'АТЦ'),
    pharmaceuticalForm:valueAfter(lines,'Фармацевтска форма'),
    strength:valueAfter(lines,'Јачина'),
    packaging:valueAfter(lines,'Пакување'),
    compositionText:between(lines,'Состав','Начин на издавање'),
    dosageText:between(lines,'Дозирање','Браилово писмо'),
    manufacturerText:manufacturer,
    maHolderText:valueAfter(lines,'Носител на одобрение'),
    authorizationNumber:valueAfter(lines,'Број на решение'),
    authorizationDate:parseDateMk(valueAfter(lines,'Датум на решение'))
  };
}

function validateParsed(source,parsed) {
  const failures=[];
  const expected=source.expected;
  if(compact(parsed.tradeName)!==compact(expected.tradeName)) failures.push('trade_name');
  if(compact(parsed.atcCode)!==compact(expected.atcCode)) failures.push('atc');
  if(compact(parsed.strength)!==compact(expected.strength)) failures.push('strength');
  if(compact(parsed.pharmaceuticalForm)!==compact(expected.form)) failures.push('form');
  for(const token of expected.genericTokens) {
    if(!compact(parsed.genericName).includes(compact(token))) failures.push('generic:'+token);
  }
  for(const token of expected.packagingTokens) {
    if(!compact(parsed.packaging).includes(compact(token))) failures.push('packaging:'+token);
  }
  if(!compact(parsed.manufacturerText).includes(compact(expected.companyToken))) failures.push('manufacturer');
  if(!compact(parsed.maHolderText).includes(compact(expected.companyToken))) failures.push('ma_holder');
  if(parsed.compositionText.length<20) failures.push('composition');
  if(parsed.dosageText.length<20) failures.push('dosage');
  if(failures.length) throw new Error(source.registryId+' exact-product validation failed: '+failures.join(','));
  return true;
}

async function fetchWithTimeout(url) {
  const response=await fetch(url,{
    redirect:'follow',
    signal:AbortSignal.timeout(30000),
    headers:{
      'User-Agent':'MedIndex-DRx-Phase8-SourceArchiver/1.0',
      'Accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
    }
  });
  if(!response.ok) throw new Error('Official registry fetch failed '+response.status+' for '+url);
  if(!String(response.url).startsWith('https://lekovi.zdravstvo.gov.mk/')) {
    throw new Error('Unexpected final URL: '+response.url);
  }
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1000) throw new Error('Official registry body unexpectedly small for '+url);
  return {response,bytes};
}

function decodeHtml(bytes,contentType='') {
  const charset=(String(contentType).match(/charset=([^;]+)/i)||[])[1]?.trim().toLowerCase();
  const candidates=[charset,'utf-8','windows-1251'].filter(Boolean);
  for(const encoding of [...new Set(candidates)]) {
    try {
      const text=new TextDecoder(encoding,{fatal:false}).decode(bytes);
      if(text.includes('Име на лекот') && text.includes('Дозирање')) return text;
    } catch {}
  }
  throw new Error('Could not decode official registry HTML with required labels');
}

async function rpcCapture(payload) {
  const base=String(process.env.MEDINDEX_SUPABASE_URL||'').replace(/\/+$/,'');
  const key=process.env.SUPABASE_SECRET_KEY||'';
  if(!base) throw new Error('MEDINDEX_SUPABASE_URL is required');
  if(!key) throw new Error('SUPABASE_SECRET_KEY is required');
  const response=await fetch(base+'/rest/v1/rpc/drx_phase8_ingest_exact_source_v1',{
    method:'POST',
    headers:{
      apikey:key,
      Authorization:'Bearer '+key,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({p_capture:payload}),
    signal:AbortSignal.timeout(15000)
  });
  const body=await response.text();
  if(!response.ok) throw new Error('Supabase exact-source ingest failed '+response.status+': '+body);
  return body ? JSON.parse(body) : null;
}

async function captureOne(source,archiveDir) {
  const fetchedAt=new Date().toISOString();
  const {response,bytes}=await fetchWithTimeout(source.sourceUrl);
  const contentType=response.headers.get('content-type')||'text/html';
  const html=decodeHtml(bytes,contentType);
  const parsed=parseRegistryHtml(html);
  validateParsed(source,parsed);

  const rawSha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const archiveLocator=(process.env.GITHUB_SERVER_URL||'https://github.com')+'/'
    +(process.env.GITHUB_REPOSITORY||'diellzarabushaj-source/barnat-')
    +'/actions/runs/'+(process.env.GITHUB_RUN_ID||'local');

  fs.mkdirSync(archiveDir,{recursive:true});
  const stem=source.registryId+'-'+rawSha256;
  fs.writeFileSync(path.join(archiveDir,stem+'.html'),bytes);

  const payload={
    captureVersion:CAPTURE_VERSION,
    drugId:source.drugId,
    sourceUrl:source.sourceUrl,
    finalUrl:response.url,
    rawSha256,
    contentLength:bytes.length,
    contentType,
    etag:response.headers.get('etag'),
    lastModified:response.headers.get('last-modified'),
    archiveLocator,
    fetchedAt,
    ...parsed,
    parserVersion:PARSER_VERSION
  };

  const ingest=await rpcCapture(payload);
  const metadata={
    registryId:source.registryId,
    payload,
    ingest
  };
  fs.writeFileSync(path.join(archiveDir,stem+'.json'),JSON.stringify(metadata,null,2)+'\n');
  return metadata;
}

async function main() {
  const archiveDir=process.env.DRX_CAPTURE_ARCHIVE_DIR||'drx-phase8-exact-source-archive';
  const results=[];
  for(const source of SOURCES) results.push(await captureOne(source,archiveDir));
  const evidence={
    evidenceVersion:'drx-phase8-exact-source-capture-evidence-v1',
    generatedAt:new Date().toISOString(),
    captureVersion:CAPTURE_VERSION,
    parserVersion:PARSER_VERSION,
    count:results.length,
    sources:results.map(item=>({
      registryId:item.registryId,
      drugId:item.payload.drugId,
      sourceUrl:item.payload.sourceUrl,
      finalUrl:item.payload.finalUrl,
      rawSha256:item.payload.rawSha256,
      contentLength:item.payload.contentLength,
      tradeName:item.payload.tradeName,
      authorizationNumber:item.payload.authorizationNumber,
      authorizationDate:item.payload.authorizationDate,
      snapshotId:item.ingest?.snapshotId||null,
      bindingStatus:item.ingest?.bindingStatus||null,
      publicationAllowed:item.ingest?.publicationAllowed??null
    }))
  };
  fs.writeFileSync('drx-phase8-exact-source-capture-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}

if(require.main===module){
  main().catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={
  CAPTURE_VERSION,PARSER_VERSION,SOURCES,
  decodeEntities,htmlToLines,valueAfter,between,parseDateMk,compact,
  parseRegistryHtml,validateParsed,decodeHtml
};
