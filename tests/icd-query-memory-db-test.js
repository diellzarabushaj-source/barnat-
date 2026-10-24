'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),migration=fs.readFileSync(path.join(root,'sql/icd-query-memory.sql'),'utf8');
const latinGuard=fs.readFileSync(path.join(root,'sql/icd-verified-latin-uniqueness.sql'),'utf8');
assert.equal(latinGuard.replace(/\r/g,''),fs.readFileSync(path.join(root,'supabase/migrations/20261024130338_icd_verified_latin_uniqueness.sql'),'utf8').replace(/\r/g,''));
assert.equal(migration.replace(/\r/g,''),fs.readFileSync(path.join(root,'supabase/migrations/20261024124950_icd_query_memory.sql'),'utf8').replace(/\r/g,''),'The CLI-created migration, renamed to its actual live version, matches the tested SQL');
const ADMIN='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',USER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function main(){
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table public.profiles(id uuid primary key,role text,status text);
   insert into public.profiles values('${ADMIN}','admin','active'),('${USER}','doctor','active');
   create table public.icd_hierarchy_active(code text,level_name text,title_la text);
   insert into public.icd_hierarchy_active values('R07.4','subcategory','Dolor thoracis'),('I10','category','Hypertensio essentialis'),('A01','category',null);
   grant select on public.profiles,public.icd_hierarchy_active to service_role;`);
  await db.exec(migration);
  await db.exec(latinGuard);
  assert.equal((await db.query("select public.icd_normalize_query_v1('  DHËMBJE GJOKSI  ') as term")).rows[0].term,'dhembje gjoksi');
  for(const role of ['anon','authenticated']){
   const permissions=(await db.query(`select has_table_privilege('${role}','public.icd_query_memory_v1','select') as read,has_table_privilege('${role}','public.icd_query_memory_v1','insert') as write,has_table_privilege('${role}','public.icd_query_memory_v1','truncate') as wipe,has_function_privilege('${role}','public.icd_review_query_memory_v1(uuid,text,uuid,text)','execute') as approve`)).rows[0];
   assert.deepEqual(permissions,{read:false,write:false,wipe:false,approve:false});
  }
  const audited=(await db.query("select has_table_privilege('service_role','public.icd_query_memory_audit_v1','update') as update,has_table_privilege('service_role','public.icd_query_memory_audit_v1','delete') as delete,has_table_privilege('service_role','public.icd_query_memory_audit_v1','truncate') as truncate")).rows[0];assert.deepEqual(audited,{update:false,delete:false,truncate:false});
  await db.exec('set role service_role');
  const submit=async(expression='pom dhemb gjoksi',code='R07.4',kind='alias',scope='global')=>(await db.query('select public.icd_submit_query_memory_v1($1,$2,$3,$4,$5,$6) as value',[expression,code,kind,scope,USER,'user'])).rows[0].value;
  const a=await submit(),b=await submit('POM DHEMB GJOKSI');assert.equal(a.id,b.id);assert.equal(b.duplicate,true);
  await submit('pom dhemb gjoksi','R07.4','alias','personal');
  await assert.rejects(()=>submit('dhimbje gjoksi','R07.89'),/Unknown canonical/);
  await assert.rejects(()=>submit('email@example.com','R07.4'),/Medical expression only/);
  await assert.rejects(()=>submit('dolor thoracis','R07.4','latin'),/Latin title is immutable/);
  await assert.rejects(()=>db.query('select public.icd_review_query_memory_v1($1,$2,$3,$4)',[a.id,'verified',USER,'https://example.test/source']),/administrator/);
  await assert.rejects(()=>db.query('select public.icd_review_query_memory_v1($1,$2,$3,$4)',[a.id,'verified',ADMIN,'']),/check constraint/);
  await db.query('select public.icd_review_query_memory_v1($1,$2,$3,$4)',[a.id,'verified',ADMIN,'https://example.test/source']);
  assert.equal((await submit()).status,'verified','Duplicates report the actual reviewed state without overwriting it');
  assert.equal((await db.query("select evidence_url from public.icd_query_memory_audit_v1 where new_status='verified'")).rows[0].evidence_url,'https://example.test/source');
  const rows=(await db.query('select status,scope,reviewer_id from public.icd_query_memory_v1 order by scope')).rows;
  assert.equal(rows[0].status,'verified');assert.equal(rows[0].reviewer_id,ADMIN);assert.equal(rows[1].status,'personal');
  assert.equal((await db.query('select count(*)::int as count from public.icd_query_memory_audit_v1')).rows[0].count,3,'Duplicate submissions do not create duplicate audits');
  const latinA=await submit('dolor abdominalis','A01','latin');
  const latinB=await submit('dolor abdominis','A01','latin');
  await db.query('select public.icd_review_query_memory_v1($1,$2,$3,$4)',[latinA.id,'verified',ADMIN,'https://example.test/source']);
  await assert.rejects(()=>db.query('select public.icd_review_query_memory_v1($1,$2,$3,$4)',[latinB.id,'verified',ADMIN,'https://example.test/source']),/unique constraint/,'A second reviewed Latin proposal cannot displace the first');
  await db.exec('reset role');
  assert.equal((await db.query("select title_la from public.icd_hierarchy_active where code='R07.4'")).rows[0].title_la,'Dolor thoracis');
  const rls=(await db.query("select relrowsecurity from pg_class where oid='public.icd_query_memory_v1'::regclass")).rows[0].relrowsecurity;assert.equal(rls,true);
  console.log('ICD memory PostgreSQL: RLS/grants, safe duplicate inserts, active-profile review, audit immutability and canonical/Latin preservation passed.');
 }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
