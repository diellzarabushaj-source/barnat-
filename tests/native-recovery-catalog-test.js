'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync,spawnSync}=require('node:child_process');
const {PGlite}=require('@electric-sql/pglite');
async function main(){
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'drx-native-catalog-')),db=new PGlite();assert.equal(path.dirname(folder),path.resolve(os.tmpdir()));
 const python=process.platform==='win32'?'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':'python3';
 try{
  const generated=path.join(folder,'catalog.sql'),before=path.join(folder,'source.ndjson'),after=path.join(folder,'target.ndjson'),proof=path.join(folder,'proof.json');
  execFileSync(python,['scripts/native-recovery-catalog.py','build','scripts/backup-native-catalog.sql',generated]);
  const sql=await fs.readFile(generated,'utf8');
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_auth_admin; CREATE ROLE supabase_storage_admin; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE TYPE auth.kind AS ENUM ('A'); CREATE TABLE auth.users(id uuid primary key,payload text default 'DRX_SYNTHETIC_SECRET'); CREATE TABLE storage.objects(id int primary key,body text); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT null::uuid $$;");
  // Managed Storage functions have signatures longer than 256 characters.
  const argumentsList=Array.from({length:24},(_,i)=>`argument_${i} text`).join(',');
  await db.exec(`CREATE FUNCTION storage.long_native_signature(${argumentsList}) RETURNS text LANGUAGE sql AS $$ SELECT null::text $$;`);
  await db.exec("CREATE SEQUENCE auth.refresh_counter; SELECT set_config('drx.backup_fingerprint_salt',repeat('a',64),false);");
  const rowSql=await fs.readFile('scripts/backup-native-rows.sql','utf8');
  const capture=async file=>{
   const rows=(await db.exec(sql)).flatMap(result=>result.rows.map(row=>Object.values(row)[0]));
   for(const query of rowSql.split('\\gexec').filter(part=>part.trim())){
    for(const result of await db.exec(query))for(const row of result.rows){
     for(const captured of await db.exec(Object.values(row)[0]))for(const value of captured.rows)rows.push(Object.values(value)[0]);
    }
   }
   await fs.writeFile(file,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');return rows;
  };
  const baseline=await capture(before);assert.ok(!JSON.stringify(baseline).includes('DRX_SYNTHETIC_SECRET'));
  assert.ok(baseline.some(row=>row.kind==='function'&&row.identity.length>256));
  async function compare(){await capture(after);const r=spawnSync(python,['scripts/native-recovery-catalog.py','compare',before,after,proof],{encoding:'utf8'});return{r,proof:JSON.parse(await fs.readFile(proof,'utf8'))};}
  const identical=await compare();assert.equal(identical.r.status,0);assert.equal(identical.proof.nativeCatalogParityVerified,true);
  assert.equal(identical.proof.completeNativeRowParityVerified,true);assert.equal(identical.proof.nativeSequenceStateVerified,true);
  const scenarios=[
   ['ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY','relation','rls'],
   ['GRANT SELECT ON auth.users TO anon','relation','acl'],
   ['CREATE INDEX native_payload ON auth.users(payload)','relation','indexes'],
   ['ALTER TABLE auth.users ADD COLUMN changed text','relation','columns'],
   ["CREATE POLICY owner_only ON auth.users USING (id=auth.uid())",'relation','policies'],
   ["CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$",'function','definition'],
   ["ALTER TYPE auth.kind ADD VALUE 'B'",'type','enum'],
   ['ALTER ROLE service_role NOBYPASSRLS','role','bypassRls'],
   ['GRANT USAGE ON SCHEMA auth TO anon','schema','acl'],
   ["INSERT INTO auth.users VALUES ('22222222-2222-4222-8222-222222222222','DRX_SYNTHETIC_SECRET')",'rows','fingerprint'],
   ['ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT ON TABLES TO anon','defaultAcl','missingSource']
  ];
  for(const [change,kind,field] of scenarios){await db.exec('BEGIN;'+change);const result=await compare();assert.equal(result.r.status,1);assert.ok(result.proof.differences.some(item=>item.kind===kind&&item.fields.includes(field)),change);await db.exec('ROLLBACK');}
  assert.deepEqual(await capture(after),baseline,'Read-only catalog capture preserves the isolated fixture');
  await db.exec("SELECT nextval('auth.refresh_counter')");const sequenceChanged=await compare();assert.equal(sequenceChanged.r.status,1);assert.ok(sequenceChanged.proof.differences.some(item=>item.kind==='sequenceState'));await db.exec("SELECT setval('auth.refresh_counter',1,false)");
  await fs.writeFile(after,JSON.stringify({...baseline[0],components:{definition:'DRX_SYNTHETIC_SECRET'}})+'\n');
  const rejected=spawnSync(python,['scripts/native-recovery-catalog.py','compare',before,after,proof],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.ok(!rejected.stderr.includes('DRX_SYNTHETIC_SECRET'));
  console.log('Native catalog: real PostgreSQL equality and drift detection for RLS, grants, indexes, columns, policies, function definitions, enum values, role bypass and schema privileges; private output rejection passed.');
 }finally{await db.close();await fs.rm(folder,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
