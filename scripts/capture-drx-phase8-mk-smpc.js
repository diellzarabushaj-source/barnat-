'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'artifacts','drx-phase8-mk-smpc');
const MAX_BYTES=12*1024*1024;
const HOST='lekovi.zdravstvo.gov.mk';

const SOURCES=[
  {
    drugId:'c8cd0467-da73-479c-b8e8-b785af833f59',
    registryId:'52577',
    tradeName:'CO-ALMACIN',
    sourceKey:'mk-moh-smpc-52577-phase8',
    url:'https://lekovi.zdravstvo.gov.mk/drugsregister.detaileddrugsregistercomponent:downloadguide/52577?t:ac=detailview/52577',
    exactMarketSnapshotId:'3b87fa53635898f326aa1feeb65196c125a3e3a250062bfd43fec4e89e93f54e'
  },
  {
    drugId:'84a1cf4a-6568-41d7-8d13-0f2b7715acae',
    registryId:'51848',
    tradeName:'PARACETAMOL ALKALOID',
    sourceKey:'mk-moh-smpc-51848-phase8',
    url:'https://lekovi.zdravstvo.gov.mk/drugsregister.detaileddrugsregistercomponent:downloadguide/51848?t:ac=detailview/51848',
    exactMarketSnapshotId:'c3ead98126480c75deee7c70f84a3f67252a08223d833b34782b783b3c58eabd'
  }
];

function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}

async function fetchPdf(source){
  const response=await fetch(source.url,{
    method:'GET',
    redirect:'follow',
    headers:{
      'Accept':'application/pdf,*/*;q=0.1',
      'User-Agent':'DRx-Dosierung-Phase8-Clinical-Review-Archiver/1.0'
    },
    signal:AbortSignal.timeout(30000)
  });
  if(!response.ok) throw new Error(source.registryId+': HTTP '+response.status);
  const finalUrl=new URL(response.url||source.url);
  if(finalUrl.protocol!=='https:' || finalUrl.hostname.toLowerCase()!==HOST){
    throw new Error(source.registryId+': redirect left official MK registry host');
  }
  const raw=Buffer.from(await response.arrayBuffer());
  if(raw.length<256 || raw.length>MAX_BYTES) throw new Error(source.registryId+': invalid PDF size '+raw.length);
  if(raw.subarray(0,5).toString('ascii')!=='%PDF-') throw new Error(source.registryId+': payload is not PDF');
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(contentType && !contentType.includes('pdf')) throw new Error(source.registryId+': unexpected content-type '+contentType);
  const digest=sha256(raw);
  const pdfPath=path.join(OUT,source.registryId+'-'+digest+'.pdf');
  fs.writeFileSync(pdfPath,raw);
  return {
    ...source,
    requestedUrl:source.url,
    finalUrl:finalUrl.toString(),
    sourceTier:'NON_EU_REGULATOR',
    authority:'Ministry of Health / Medicines Register of North Macedonia',
    jurisdiction:'MK',
    documentType:'SmPC',
    referenceRole:'CLINICAL_REVIEW_ONLY',
    publicationAllowed:false,
    automaticVerificationAllowed:false,
    automaticPublicationAllowed:false,
    fetchedAt:new Date().toISOString(),
    contentType:contentType||'application/pdf',
    contentLength:raw.length,
    rawSha256:digest,
    snapshotId:digest,
    pdfPath:path.relative(OUT,pdfPath)
  };
}

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  const rows=[];
  for(const source of SOURCES) rows.push(await fetchPdf(source));
  if(rows.length!==2) throw new Error('expected two MK SmPC captures');
  const index={
    schemaVersion:'drx-phase8-mk-smpc-capture-v1',
    generatedAt:new Date().toISOString(),
    sourceCount:rows.length,
    immutable:true,
    humanClinicalReviewRequired:true,
    publicationAllowed:false,
    automaticVerificationAllowed:false,
    automaticPublicationAllowed:false,
    rows
  };
  fs.writeFileSync(path.join(OUT,'index.json'),JSON.stringify(index,null,2)+'\n');
  console.log(JSON.stringify(index,null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
