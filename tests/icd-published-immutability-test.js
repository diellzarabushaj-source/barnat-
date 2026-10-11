'use strict';
// Actual PostgreSQL execution over synthetic complete ICD snapshots. PGlite
// exercises SQL semantics; production PostgreSQL version is verified separately.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const schema=fs.readFileSync(path.join(root,'sql/icd-hierarchy-neon.sql'),'utf8');
const directory=path.join(root,'supabase/migrations');
const candidates=fs.readdirSync(directory).filter(name=>name.endsWith('_protect_published_icd_hierarchy.sql'));
assert.equal(candidates.length,1,'One canonical applied ICD immutability migration is required.');
const candidate=fs.readFileSync(path.join(directory,candidates[0]),'utf8');
const boundedCandidates=fs.readdirSync(directory).filter(name=>name.endsWith('_bound_icd_snapshot_validation.sql'));
assert.equal(boundedCandidates.length,1,'One bounded snapshot validation migration is required.');
const bounded=fs.readFileSync(path.join(directory,boundedCandidates[0]),'utf8');
const inspectionCandidates=fs.readdirSync(directory).filter(name=>name.endsWith('_inspect_icd_snapshot_validation.sql'));
assert.equal(inspectionCandidates.length,1,'One service-only plan inspection migration is required.');
const inspection=fs.readFileSync(path.join(directory,inspectionCandidates[0]),'utf8');
const replanCandidates=fs.readdirSync(directory).filter(name=>name.endsWith('_replan_icd_snapshot_validation.sql'));
assert.equal(replanCandidates.length,1,'One publication-specific planning migration is required.');
const replan=fs.readFileSync(path.join(directory,replanCandidates[0]),'utf8');
const joinCandidates=fs.readdirSync(directory).filter(name=>name.endsWith('_stabilize_icd_validation_join.sql'));
assert.equal(joinCandidates.length,1,'One bounded parent-join planning migration is required.');
const stableJoin=fs.readFileSync(path.join(directory,joinCandidates[0]),'utf8');
const planContains=(plan,type)=>plan?.['Node Type']===type||(plan?.Plans||[]).some(child=>planContains(child,type));
async function main(){
const counts=`'{"total":12542,"chapter":22,"block":274,"category":2050,"subcategory":10196}'::jsonb`;
const revision=(name,status='staging')=>`INSERT INTO public.icd_hierarchy_revisions(revision,spreadsheet_id,sheet_name,sheet_gid,source_hash,source_bytes,counts,status,activated_at)
VALUES ('${name}','synthetic','synthetic',1,'${name}',1,${counts},'${status}',${status==='active'?"'2026-01-01Z'::timestamptz":'NULL'});`;
const nodes=name=>`INSERT INTO public.icd_hierarchy_nodes(revision,code,level_name,chapter_code,block_code,parent_code,title_en,display_title,translation_status,source_row,search_text,source_hash)
SELECT '${name}',code,level_name,'C1',block_code,parent_code,'Synthetic','Synthetic','missing',row_number() OVER ()::integer,'synthetic','synthetic'
FROM (
 SELECT 'C'||i AS code,'chapter' AS level_name,NULL::text block_code,NULL::text parent_code FROM generate_series(1,22)i
 UNION ALL SELECT 'B'||i,'block','B'||i,'C1' FROM generate_series(1,274)i
 UNION ALL SELECT 'K'||i,'category','B1','B1' FROM generate_series(1,2050)i
 UNION ALL SELECT 'S'||i,'subcategory','B1','K1' FROM generate_series(1,10196)i
) x; UPDATE public.icd_hierarchy_nodes SET chapter_code=code WHERE revision='${name}' AND level_name='chapter';`;
const db=new PGlite();const cases=[];
async function rejected(name,sql,code='42501'){
 const before=(await db.query(`SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY revision,code)) AS hash FROM public.icd_hierarchy_nodes n;`)).rows[0].hash;
 let actual;try{await db.exec('BEGIN; SET LOCAL ROLE service_role; '+sql+'; COMMIT;');}catch(error){actual=error.code;}
 assert.equal(actual,code,name);await db.exec('ROLLBACK; RESET ROLE;');
 const after=(await db.query(`SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY revision,code)) AS hash FROM public.icd_hierarchy_nodes n;`)).rows[0].hash;
 assert.equal(before,after,name+': rejected mutation must preserve all nodes');
 cases.push({name,status:'PASS',sqlstate:actual,rollbackVerified:true});
}
try{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; '+schema.slice(0,schema.indexOf('CREATE OR REPLACE FUNCTION public.activate_icd_hierarchy_revision')));
 await db.exec("ALTER TABLE public.icd_hierarchy_nodes ADD COLUMN title_la text; GRANT ALL ON public.icd_hierarchy_nodes,public.icd_hierarchy_revisions TO service_role; GRANT SELECT ON public.icd_hierarchy_nodes,public.icd_hierarchy_revisions TO anon,authenticated;");
 await db.exec(revision('first','active')+nodes('first'));
 await db.exec('BEGIN;'+candidate+bounded+inspection+replan+'COMMIT;');
 const version=(await db.query('SELECT version() AS version')).rows[0].version;
 const snapshot=(await db.query("SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY code)) AS hash FROM public.icd_hierarchy_nodes n WHERE revision='first'")).rows[0].hash;
 // Analyze only the old snapshot, then import an unknown complete revision.
 // This deterministically reproduces the stale one-row estimate after a
 // fresh API import, without waiting for autovacuum or changing timeouts.
 await db.exec('ANALYZE public.icd_hierarchy_nodes; SET ROLE service_role;'+revision('second')+nodes('second'));
 const beforeJoinFix=(await db.query("SELECT public.inspect_icd_snapshot_validation('second') AS diagnostic")).rows[0].diagnostic;
 assert.ok(planContains(beforeJoinFix.plan[0].Plan,'Nested Loop'),'Old plan must reproduce the unindexed parent nested loop with stale statistics.');
 await db.exec('RESET ROLE; BEGIN;'+stableJoin+'COMMIT; SET ROLE service_role; SET plan_cache_mode=force_generic_plan; SET enable_hashjoin=off;');
 const afterJoinFix=(await db.query("SELECT public.inspect_icd_snapshot_validation('second') AS diagnostic")).rows[0].diagnostic;
 assert.ok(planContains(afterJoinFix.plan[0].Plan,'Hash Join'),'New validation plan must hash the parent lookup even before fresh statistics.');
 assert.equal((await db.query("SELECT current_setting('enable_hashjoin') AS setting")).rows[0].setting,'off','Function-local preferences must restore caller settings.');
 await db.exec("SELECT public.activate_icd_hierarchy_revision('second'); RESET enable_hashjoin; RESET plan_cache_mode; RESET ROLE;");
 cases.push({name:'fresh-complete-import-with-stale-statistics-replaces-quadratic-parent-plan-and-restores-caller-settings',status:'PASS'});
 cases.push({name:'complete-staging-activation',status:'PASS'});
 const firstDate=String((await db.query("SELECT activated_at FROM public.icd_hierarchy_revisions WHERE revision='first'")).rows[0].activated_at);
 await db.exec("SET ROLE service_role; SELECT public.activate_icd_hierarchy_revision('first'); SELECT public.activate_icd_hierarchy_revision('first'); RESET ROLE;");
 assert.equal(String((await db.query("SELECT activated_at FROM public.icd_hierarchy_revisions WHERE revision='first'")).rows[0].activated_at),firstDate);
 assert.equal((await db.query("SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY code)) AS hash FROM public.icd_hierarchy_nodes n WHERE revision='first'")).rows[0].hash,snapshot);
 cases.push({name:'published-reactivation-and-idempotent-activation-preserve-source-and-first-timestamp',status:'PASS'});
 for(const name of ['first','second']){
  await rejected(name+'-node-update',`UPDATE public.icd_hierarchy_nodes SET title_en='changed' WHERE revision='${name}' AND code='C1'`);
  await rejected(name+'-node-noop',`UPDATE public.icd_hierarchy_nodes SET title_en=title_en WHERE revision='${name}' AND code='C1'`);
  await rejected(name+'-node-delete',`DELETE FROM public.icd_hierarchy_nodes WHERE revision='${name}' AND code='C1'`);
  await rejected(name+'-node-insert',`INSERT INTO public.icd_hierarchy_nodes SELECT revision,'EXTRA',level_name,chapter_code,block_code,parent_code,title_en,title_sq,display_title,translation_status,path_text,source_url,source_row,search_text,source_hash,is_published,created_at,updated_at,title_la FROM public.icd_hierarchy_nodes WHERE revision='${name}' AND code='C1'`);
  await rejected(name+'-node-move',`UPDATE public.icd_hierarchy_nodes SET revision='second' WHERE revision='${name}' AND code='C1'`);
  await rejected(name+'-metadata-rewrite',`UPDATE public.icd_hierarchy_revisions SET source_hash='changed' WHERE revision='${name}'`);
  await rejected(name+'-marker-reset',`UPDATE public.icd_hierarchy_revisions SET activated_at=NULL,status='staging' WHERE revision='${name}'`);
  await rejected(name+'-failed-demotion',`UPDATE public.icd_hierarchy_revisions SET status='failed' WHERE revision='${name}'`);
  await rejected(name+'-delete-cascade',`DELETE FROM public.icd_hierarchy_revisions WHERE revision='${name}'`);
 }
 await rejected('no-empty-active-view',"UPDATE public.icd_hierarchy_revisions SET status='superseded' WHERE revision='first'",'23514');
 for(const table of ['nodes','revisions']){
  await rejected(table+'-service-truncate',`TRUNCATE public.icd_hierarchy_${table} CASCADE`);
  let code;try{await db.exec(`BEGIN; TRUNCATE public.icd_hierarchy_${table} CASCADE; COMMIT;`);}catch(error){code=error.code;}
  assert.equal(code,'42501');await db.exec('ROLLBACK;');cases.push({name:table+'-owner-truncate-trigger',status:'PASS'});
 }
 await db.exec('SET ROLE service_role;'+revision('third')+nodes('third')+'RESET ROLE;');
 for(const [name,change] of [
  ['missing-node',"DELETE FROM public.icd_hierarchy_nodes WHERE revision='third' AND code='S1'"],
  ['blank-title',"UPDATE public.icd_hierarchy_nodes SET title_en='' WHERE revision='third' AND code='C1'"],
  ['bad-parent',"UPDATE public.icd_hierarchy_nodes SET parent_code='B1' WHERE revision='third' AND code='S1'"],
  ['cross-revision-parent',"UPDATE public.icd_hierarchy_nodes SET code='OTHER_K1' WHERE revision='third' AND code='K1'"],
  ['unpublished',"UPDATE public.icd_hierarchy_nodes SET is_published=false WHERE revision='third' AND code='C1'"],
  ['wrong-declared-counts',"UPDATE public.icd_hierarchy_revisions SET counts='{}' WHERE revision='third'"]
 ]){
  await rejected('invalid-'+name,change+"; SELECT public.activate_icd_hierarchy_revision('third')",'22023');
 }
 await rejected('direct-invalid-activation',"DELETE FROM public.icd_hierarchy_nodes WHERE revision='third' AND code='S1'; UPDATE public.icd_hierarchy_revisions SET status='superseded' WHERE status='active'; UPDATE public.icd_hierarchy_revisions SET status='active',activated_at=now() WHERE revision='third'",'22023');
 await rejected('direct-published-insert',revision('fake','active'));
 await db.exec("SET ROLE service_role; UPDATE public.icd_hierarchy_nodes SET title_en='valid synthetic update' WHERE revision='third' AND code='C1'; DELETE FROM public.icd_hierarchy_revisions WHERE revision='third'; RESET ROLE;");
 cases.push({name:'unpublished-staging-edit-and-cascade-cleanup-allowed',status:'PASS'});
 assert.equal((await db.query("SELECT count(*) AS count FROM public.icd_hierarchy_active")).rows[0].count,12542);
 const beforeInspection=(await db.query("SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY revision,code)) AS hash FROM public.icd_hierarchy_nodes n")).rows[0].hash;
 await db.exec('SET ROLE service_role;');
 const diagnostic=(await db.query("SELECT public.inspect_icd_snapshot_validation('first') AS diagnostic")).rows[0].diagnostic;
 await db.exec('RESET ROLE;');
 assert.equal(diagnostic.currentRole,'service_role');assert.equal(diagnostic.bypassRls,true);assert.ok(Array.isArray(diagnostic.plan));
 assert.equal((await db.query("SELECT md5(string_agg(to_jsonb(n)::text,'' ORDER BY revision,code)) AS hash FROM public.icd_hierarchy_nodes n")).rows[0].hash,beforeInspection);
 cases.push({name:'service-only-plan-inspection-does-not-execute-or-mutate-snapshot',status:'PASS'});
 await rejected('inspection-rejects-unknown-revision',"SELECT public.inspect_icd_snapshot_validation('unknown')",'22023');
 const grants=(await db.query("SELECT role_name,has_table_privilege(role_name,'public.icd_hierarchy_nodes','TRUNCATE') AS truncate,has_function_privilege(role_name,'public.activate_icd_hierarchy_revision(text)','EXECUTE') AS activate FROM (VALUES ('anon'),('authenticated'),('service_role'))r(role_name)")).rows;
 assert.ok(grants.every(row=>!row.truncate));assert.deepEqual(grants.map(row=>row.activate),[false,false,true]);
 assert.deepEqual((await db.query("SELECT has_function_privilege(role_name,'public.inspect_icd_snapshot_validation(text)','EXECUTE') AS inspect FROM (VALUES ('anon'),('authenticated'),('service_role'))r(role_name)")).rows.map(row=>row.inspect),[false,false,true]);
 const evidence={status:'PASS',engine:version,syntheticNodesPerCompleteRevision:12542,cases,grants,sourceContentUnchanged:true,productionExecuted:false};
 const rollback=await db.exec(fs.readFileSync(path.join(root,'supabase/tests/icd-published-immutability-rollback.sql'),'utf8'));
 const rollbackProof=rollback.at(-1).rows[0].proof;
 assert.equal(rollbackProof.status,'PASS');assert.equal(rollbackProof.verifiedCases,20);
 assert.equal(cases.length,37);
 console.log('ICD immutable snapshots: '+cases.length+' executed SQL cases plus 20 rollback-fixture checks passed ('+version+').');
}finally{await db.close();}

}
main().catch(error=>{console.error({code:error.code,message:error.message});process.exitCode=1;});
