'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const workflow=fs.readFileSync(path.join(ROOT,'.github/workflows/drx-phase1-backup-restore.yml'),'utf8');
const baseline=require('../data/drx-phase1-baseline-v1.json');
const evidence=require('../data/drx-phase1-backup-restore-evidence-v1.json');

assert.match(workflow,/secrets\.SUPABASE_DB_URL/);
assert.match(workflow,/supabase\/setup-cli@v1/);
assert.match(workflow,/version: 2\.116\.0/);
const pushMatch=workflow.match(/^  push:\r?\n([\s\S]*?)^permissions:/m);
assert.ok(pushMatch,'Actual main push configuration must remain inspectable.');
assert.match(pushMatch[1],/branches: \[main\]/);
assert.match(pushMatch[1],/^      - "supabase\/migrations\/\*\*"$/m,
  'Every main migration, including the committed fence activation, must rerun actual backup/restore automatically.');
assert.match(workflow,/supabase db dump --db-url "\$SUPABASE_DB_URL"/);
assert.match(workflow,/--role-only/);
assert.match(workflow,/--use-copy --data-only/);
assert.match(workflow,/--schema supabase_migrations/);
assert.match(workflow,/supabase start/);
assert.match(workflow,/postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres/);
assert.match(workflow,/Capture source restore manifest/);
assert.match(workflow,/drugs_count=/);
assert.match(workflow,/dosage_regimens_count=/);
assert.match(workflow,/source_snapshots_count=/);
assert.match(workflow,/source_sections_count=/);
assert.match(workflow,/v3_products_count=/);
assert.match(workflow,/v3_rules_count=/);
assert.match(workflow,/v3_bindings_count=/);
assert.match(workflow,/fingerprint=/);
assert.match(workflow,/diff -u "\$RUNNER_TEMP\/drx-source-manifest\.txt" "\$RUNNER_TEMP\/drx-restore-manifest\.txt"/);
assert.match(workflow,/Require independent source manifest/);
assert.doesNotMatch(workflow,/grep -qx 'v3_products=0'/);
assert.match(workflow,/runner_ephemeral_only_no_database_payload_uploaded/);
assert.match(workflow,/name: Require complete private retention configuration/);
assert.match(workflow,/name: Retain and recover verified encrypted backup/);
assert.match(workflow,/node scripts\/backup-archive-crypto\.js encrypt/);
assert.match(workflow,/tar -cJf "\$BACKUP_DIR\/retained\.tar\.xz"/);
assert.match(workflow,/DRX_BACKUP_STORAGE_BODIES_REQUIRED: "1"/);
assert.match(workflow,/node scripts\/export-storage-bodies\.js/);
assert.match(workflow,/source-manifest\.txt private-fingerprint-salt storage-body-manifest\.json storage-objects/);
assert.match(workflow,/if before!=after:/);
assert.match(workflow,/node scripts\/retain-private-backup\.js/);
assert.match(workflow,/"personalLibraryRowParityVerified":True/);
assert.match(workflow,/echo "::add-mask::\$DRX_BACKUP_FINGERPRINT_SALT"/);
assert.equal((workflow.match(/--set private_fingerprint_salt=/g)||[]).length,2);
assert.match(workflow,/rm -f -- "\$RUNNER_TEMP\/drx-restore-private-manifest\.sql"/);
assert.doesNotMatch(workflow,/path:\s*[|>]?[\s\S]{0,120}(roles\.sql|schema\.sql|data\.sql)/);

const sources=baseline.googleSourceSnapshots;
assert.equal(sources.length,4);
for(const source of sources){
  assert.match(source.sha256,/^[0-9a-f]{64}$/);
  assert.ok(source.hashKind);
}
assert.equal(baseline.googleSnapshotGate.status,'PASS');
assert.equal(baseline.publicationAllowed,false);
assert.equal(baseline.backupAndRestore.gateStatus,'PASS');
assert.equal(baseline.backupAndRestore.restoreVerified,true);
assert.equal(baseline.phase1ExitGate.status,'PASS');
assert.equal(evidence.status,'PASS');
assert.equal(evidence.backupCreated,true);
assert.equal(evidence.restoreVerified,true);
if(evidence.schemaVersion==='drx-phase1-backup-restore-evidence-v2'){
  assert.equal(evidence.sourceRestoreParity,true);
  assert.deepEqual(evidence.sourceManifest,evidence.restoredManifest);
  assert.ok(Number.isInteger(evidence.restoredManifest.drugs_count));
  assert.ok(Number.isInteger(evidence.restoredManifest.dosage_regimens_count));
  assert.ok(Number.isInteger(evidence.restoredManifest.source_snapshots_count));
  assert.ok(Number.isInteger(evidence.restoredManifest.source_sections_count));
} else {
  assert.equal(evidence.restoredCounts.drugs,4015);
  assert.equal(evidence.restoredCounts.dosage_regimens,8104);
  assert.equal(evidence.restoredCounts.source_snapshots,100);
  assert.equal(evidence.restoredCounts.source_sections,575);
}
assert.equal(evidence.publicationAllowed,false);

console.log('DRx Phase 1 backup/restore workflow and Google snapshot hash contract passed.');


// Verify the actual extracted SQL/run blocks, rather than accepting a backup
// filename that was merely created and never restored.
const triggerMatch=workflow.match(/<<'SQL' > "\$BACKUP_DIR\/auth_custom_triggers\.sql"\r?\n([\s\S]*?)^\s*SQL\s*$/m);
const securityMatch=workflow.match(/cat > "\$RUNNER_TEMP\/drx-restore-security-manifest\.sql" <<'SQL'\r?\n([\s\S]*?)^\s*SQL\s*$/m);
assert.ok(triggerMatch, 'Managed auth triggers require an independent catalog extraction.');
assert.ok(securityMatch, 'Source and target must execute the same security manifest SQL.');
const triggerSql=triggerMatch[1];
const securitySql=securityMatch[1];
for(const table of ['icd_hierarchy_nodes','icd_hierarchy_revisions']){
  assert.ok(securitySql.includes("'"+table+"'"),'Restore catalogs must include immutable ICD tables and triggers.');
}
for(const key of ['icd_nodes_count','icd_nodes_fingerprint','icd_revisions_count','icd_revisions_fingerprint']){
  assert.equal((workflow.match(new RegExp("select '"+key+"=",'g'))||[]).length,2,'Both independently captured manifests must cover '+key);
  assert.ok(workflow.includes("'"+key+"'"),'Restore completion requires '+key);
}
assert.ok(workflow.includes('immutable_icd_snapshots_and_guards'));
assert.match(triggerSql,/set search_path = ''/);
assert.match(triggerSql,/pg_catalog\.format\('DROP TRIGGER IF EXISTS %I ON %I\.%I;/);
assert.match(triggerSql,/ALTER TABLE %I\.%I %s TRIGGER %I/);
assert.match(triggerSql,/pg_catalog\.pg_get_triggerdef\(t\.oid,false\)/);
assert.match(triggerSql,/rn\.nspname='auth' and c\.relname='users' and not t\.tgisinternal/);
assert.match(triggerSql,/fn\.nspname not in \('auth','storage'\)/);
for (const [state,command] of [['D','DISABLE'],['R','ENABLE REPLICA'],['A','ENABLE ALWAYS']]) {
  assert.ok(triggerSql.includes(`when '${state}' then '${command}'`), `Enabled state ${state} must replay as ${command}.`);
}
assert.match(triggerSql,/else 'ENABLE'/); // original O state
assert.doesNotMatch(triggerSql,/\b(?:from|join)\s+auth\.users\b/i);

const restore=workflow.slice(workflow.indexOf('- name: Restore into disposable local Supabase'),workflow.indexOf('- name: Write failure evidence'));
assert.ok(restore.includes("DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'"));
assert.doesNotMatch(restore,/psql "\$SUPABASE_DB_URL"/);
const restoreOrder=['restore_sql managed_auth','restore_sql schema','restore_sql data','restore_sql history','restore_sql auth_triggers'];
let previous=-1;
for (const stage of restoreOrder) {
  const position=restore.indexOf(stage);
  assert.ok(position>previous, `Restore stage missing or out of order: ${stage}`);
  previous=position;
}
assert.match(restore,/restore_sql history --single-transaction[\s\S]*?DROP SCHEMA IF EXISTS supabase_migrations CASCADE[\s\S]*?--file "\$BACKUP_DIR\/history_schema\.sql"[\s\S]*?--file "\$BACKUP_DIR\/history_data\.sql"/);
assert.match(restore,/restore_sql auth_triggers --single-transaction --file "\$BACKUP_DIR\/auth_custom_triggers\.sql"/);
assert.match(restore,/SET session_replication_role = replica/);
assert.match(workflow,/pg_dump "\$SOURCE_DATABASE_URL" --schema-only --table=auth\.mfa_recovery_code_sets --table=auth\.mfa_recovery_codes/);
const boundedAuthDump=workflow.match(/sh -c 'exec pg_dump "\$SOURCE_DATABASE_URL" --schema-only ([^']+)'/);
assert.ok(boundedAuthDump,'Managed Auth restoration must capture only confirmed absent table definitions.');
assert.deepEqual([...boundedAuthDump[1].matchAll(/--table=([a-z_.]+)/g)].map(match=>match[1]).sort(),
  ['auth.mfa_recovery_code_sets','auth.mfa_recovery_codes','auth.scim_tokens','auth.scim_users']);
assert.doesNotMatch(boundedAuthDump[1],/--schema\b|\*|--clean|--data-only/,
  'Managed Auth compatibility must not become an unrestricted or destructive schema/data capture.');
assert.match(workflow,/> "\$BACKUP_DIR\/auth_recovery_schema\.sql" 2> "\$RUNNER_TEMP\/drx-restore-auth-schema-dump\.log"/);
assert.match(workflow,/public\.ecr\.aws\/supabase\/postgres:\$SOURCE_POSTGRES_VERSION/);
assert.match(restore,/restore_sql managed_auth --file "\$BACKUP_DIR\/auth_recovery_schema\.sql"/);
assert.match(restore,/psql "\$DB_URL" -X --quiet --set ON_ERROR_STOP=1 --set VERBOSITY=sqlstate --set SHOW_CONTEXT=never "\$@"[\s\\]*> "\$RUNNER_TEMP\/drx-restore-\$\{stage\}\.log" 2>&1/);
assert.match(restore,/project_id = "drx-isolated-restore"/);
assert.match(restore,/RESTORE_CONTAINER='supabase_db_drx-isolated-restore'/);
assert.match(restore,/docker inspect "\$RESTORE_CONTAINER" --format '\{\{\.Name\}\}'/);
assert.match(restore,/if \[ "\$stage" = "managed_auth" \] \|\| \[ "\$stage" = "auth_triggers" \]; then[\s\S]*?docker exec -i "\$RESTORE_CONTAINER" psql -U supabase_admin -d postgres/);
assert.doesNotMatch(restore,/GRANT\s+(?:supabase_admin|supabase_auth_admin|CREATE)/i);
assert.match(restore,/docker exec -i "\$RESTORE_CONTAINER" psql -U supabase_admin -d postgres -X --quiet --single-transaction/);
assert.match(restore,/supabase start > "\$RUNNER_TEMP\/drx-restore-start\.log" 2>&1/);
assert.ok(restore.indexOf('--file "$RUNNER_TEMP/drx-restore-security-manifest.sql"')>restore.indexOf('restore_sql auth_triggers'));
assert.equal((workflow.match(/--file "\$RUNNER_TEMP\/drx-restore-security-manifest\.sql" >> "\$RUNNER_TEMP\/drx-(?:source|restore)-manifest\.txt"/g)||[]).length,2);

for (const fingerprint of ['migration_history','application_functions','personal_write_tables','personal_write_triggers','personal_write_schemas','personal_write_controls']) {
  assert.ok(securitySql.includes(`${fingerprint}_fingerprint=`), `Missing restore security fingerprint: ${fingerprint}`);
}
assert.match(securitySql,/supabase_migrations\.schema_migrations/);
assert.match(securitySql,/pg_catalog\.pg_get_functiondef/);
assert.match(securitySql,/pg_catalog\.aclexplode\(coalesce\(proacl,pg_catalog\.acldefault\('f',proowner\)\)/);
assert.match(securitySql,/pg_catalog\.has_function_privilege/);
assert.match(securitySql,/pg_catalog\.has_table_privilege/);
assert.match(securitySql,/pg_catalog\.has_schema_privilege/);
assert.match(securitySql,/relrowsecurity/);
assert.match(securitySql,/relforcerowsecurity/);
assert.match(securitySql,/pg_catalog\.pg_policy/);
assert.match(securitySql,/pg_catalog\.pg_get_constraintdef/);
assert.match(securitySql,/t\.tgenabled::text/); // pg_trigger enabled state is PostgreSQL internal char, requiring an explicit concat cast.
assert.match(securitySql,/pg_catalog\.to_regclass\(pg_catalog\.format\('%I\.control',schema_name\)\) is null then 'absent'/);
assert.match(securitySql,/select singleton,fence_enabled from %I\.control order by singleton/);
assert.match(securitySql,/values \('note_write_private'\),\('prescription_write_private'\)/);
assert.doesNotMatch(securitySql,/\b(?:from|join)\s+(?:auth\.users|public\.(?:user_notes|user_favorites|user_prescriptions|medindex_users)|(?:note_write_private|prescription_write_private)\.receipts)\b/i, 'Catalog parity must never probe or aggregate private clinical/account rows.');
assert.doesNotMatch(securitySql,/decrypt|encryption_key|payload|diagnosis|email|health/i);
assert.match(workflow,/required\.issubset\(source_manifest\) or source_manifest!=restored_manifest/);
for (const field of ['privateContentParityVerified','decryptionVerified','encryptionKeyRecoveryVerified']) {
  assert.ok(workflow.includes(`"${field}":False`), `${field} must remain explicitly unverified.`);
}
assert.match(workflow,/name: Remove disposable database and raw backup files\r?\n\s*if: always\(\)/);
assert.match(workflow,/\$\{RUNNER_TEMP:\?\}\/drx-phase1-backup/);
assert.match(workflow,/rm -f -- "\$RUNNER_TEMP"\/drx-restore-\*\.log/);
assert.match(workflow,/path: drx-phase1-backup-restore-evidence\.json/);
assert.doesNotMatch(workflow,/cat "?\$RUNNER_TEMP\/drx-restore-.*\.log/);

console.log('Isolated migration-history replay, quoted custom auth trigger states and private-data-free security catalog parity contracts passed.');


// Execute the real credential resolver with synthetic aliases. The test never
// connects to a database or imports the runner/repository's credential values.
const resolverSection=workflow.slice(workflow.indexOf('- name: Resolve backup credential safely'),workflow.indexOf('- name: Write blocked evidence'));
const resolverMatch=resolverSection.match(/        run: \|\r?\n([\s\S]*)/);
assert.ok(resolverMatch,'The source credential resolver must remain executable.');
const resolver=resolverMatch[1].replace(/\r\n/g,'\n').replace(/^ {10}/gm,'').trim();
assert.ok(resolver.indexOf('DB_SOURCE_CANDIDATE=')<resolver.indexOf('resolved_url="$value"'),'Candidate routing must be validated before selecting the URL.');
assert.ok(workflow.indexOf('DB_SOURCE_CANDIDATE=')<workflow.indexOf('supabase db dump'),'No dump can precede source-project validation.');
assert.match(workflow,/SUPABASE_PROJECT_REF: "ftuchtmolddhhsdcwnqe"/);
assert.match(workflow,/BLOCKED_NO_APPROVED_SOURCE_DATABASE_CONNECTION/);
assert.match(workflow,/supabase link --project-ref "\$SUPABASE_PROJECT_REF"/);
assert.match(workflow,/name: Require independent source manifest\r?\n\s*if: steps\.credential\.outputs\.available == 'true' && steps\.credential\.outputs\.mode != 'db_url'[\s\S]*?exit 1/);
const bash=process.platform==='win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const bundledPython=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.platform==='win32' && fs.existsSync(bundledPython) ? bundledPython : 'python3';
const project='ftuchtmolddhhsdcwnqe';
const direct=`postgresql://postgres:synthetic-password@db.${project}.supabase.co:5432/postgres?sslmode=require`;
const pooler=`postgres://postgres.${project}:synthetic-password@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=verify-full&connect_timeout=10`;
let resolverCases=0;
function resolveAliases(urls=[],extra={}) {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'drx-backup-source-'));
  // This exact temporary directory is the only recursive cleanup target.
  assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith('drx-backup-source-'));
  try {
    const outputFile=path.join(temporary,'github-output');
    const environmentFile=path.join(temporary,'github-env');
    const environment={PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT || '',WINDIR:process.env.WINDIR || '',
      SUPABASE_PROJECT_REF:project,SUPABASE_POOLER_REGION:'eu-west-2',RUNNER_TEMP:temporary,
      GITHUB_OUTPUT:outputFile,GITHUB_ENV:environmentFile,DRX_TEST_PYTHON:python,...extra};
    urls.forEach((value,index)=>{environment[`DB_URL_${index+1}`]=value;});
    // Adapt only the executable name for Windows; all resolver/validator logic
    // is the literal workflow code, including alias ordering and fallback.
    const result=spawnSync(bash,['-c',resolver.replace(/\bpython3\b/g,'"${DRX_TEST_PYTHON}"')],{env:environment,encoding:'utf8',timeout:15000});
    assert.equal(result.error,undefined,'The local resolver fixture must execute.');
    assert.equal(result.status,0,'Synthetic credential resolution must settle without a connection.');
    assert.equal(result.stderr,'','The validator must not print parsing errors or URL values.');
    const visible=result.stdout.split('\n').filter(line=>!line.startsWith('::add-mask::')).join('\n');
    for(const value of [...urls,...Object.values(extra)].filter(value=>typeof value==='string' && value)) {
      assert.ok(!visible.includes(value),'Credential values must never appear in informational diagnostics.');
    }
    const outputs=Object.fromEntries(fs.readFileSync(outputFile,'utf8').trim().split(/\r?\n/).map(line=>line.split('=')));
    resolverCases++;
    return {outputs,environment:fs.existsSync(environmentFile) ? fs.readFileSync(environmentFile,'utf8') : ''};
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
const acceptedDirect=resolveAliases([direct]);
assert.deepEqual(acceptedDirect.outputs,{available:'true',mode:'db_url',source:'DB_URL_1'});
assert.ok(acceptedDirect.environment.includes(direct));
const acceptedPooler=resolveAliases([pooler]);
assert.equal(acceptedPooler.outputs.mode,'db_url');
assert.ok(acceptedPooler.environment.includes(pooler));
const encodedPooler=pooler.replace('postgres.'+project,'postgres%2E'+project);
assert.equal(resolveAliases([encodedPooler]).outputs.mode,'db_url','Decoded session-pooler username retains the exact project.');
const neon='postgresql://postgres:synthetic-password@ep-unrelated.neon.tech:5432/postgres';
const otherProject='aaaaaaaaaaaaaaaaaaaa';
const rejected=[
  neon,
  direct.replace(project,otherProject),
  pooler.replace(project,otherProject),
  direct.replace('.supabase.co:', '.supabase.co.evil.invalid:'),
  pooler.replace('.pooler.supabase.com:', '.pooler.supabase.com.evil.invalid:'),
  direct.replace(':5432/', ':6543/'),
  pooler.replace(':5432/', ':6543/'),
  direct.replace('/postgres?', '/other_database?'),
  direct+'&host=ep-unrelated.neon.tech',
  direct+'&hostaddr=127.0.0.1',
  direct+'&dbname=other_database',
  direct+'&user=other_user',
  direct+'&port=6543',
  direct+'&service=other_project',
  direct+'&%68ost=ep-unrelated.neon.tech',
  direct+'&sslmode=disable',
  direct+'#fragment',
  direct+'\nDRXEOF\nINJECTED=1',
  'postgresql://postgres:synthetic-password@[malformed:5432/postgres',
];
for(const candidate of rejected){
  const result=resolveAliases([candidate,direct]);
  assert.equal(result.outputs.source,'DB_URL_2','A rejected alias must not prevent a later valid project credential.');
  assert.ok(result.environment.includes(direct));
  assert.ok(!result.environment.includes(candidate),'A rejected credential never enters the job environment.');
}
const noSource=resolveAliases([neon,pooler.replace(project,otherProject)]);
assert.deepEqual(noSource.outputs,{available:'false',mode:'none',source:'none'});
assert.equal(noSource.environment,'','No approved credential is fail-closed before any dump.');
const password=resolveAliases([neon],{DB_PASSWORD_1:'synthetic/@:password?'});
assert.equal(password.outputs.source,'DB_PASSWORD_1');
assert.ok(password.environment.includes(`postgres.${project}:synthetic%2F%40%3Apassword%3F@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require`));
const linked=resolveAliases([neon],{ACCESS_TOKEN_1:'synthetic-management-token'});
assert.deepEqual(linked.outputs,{available:'true',mode:'linked',source:'ACCESS_TOKEN_1'});
assert.ok(!linked.environment.includes(neon),'Linked fallback never retains the rejected database URL.');
console.log(`Source-project backup resolver: ${resolverCases} synthetic direct/session-pooler, routing override, alias fallback and fail-closed cases passed without database access.`);

// The compatibility replay may contain only this catalog-proven, additive
// column statement. Missing, incompatible, repeated or failed output is closed
// before appending anything to the managed schema that will be hashed/replayed.
const authExpiryMatch=workflow.match(/^ {12}# BEGIN exact source Auth expiry compatibility\r?\n[\s\S]*?^ {12}# END exact source Auth expiry compatibility/m);
assert.ok(authExpiryMatch,'Auth compatibility must be a bounded source-catalog extraction.');
const authExpiryCapture=authExpiryMatch[0].replace(/\r\n/g,'\n').replace(/^ {10}/gm,'');
const authExpirySqlMatch=authExpiryCapture.match(/<<'SQL'[^\n]*\n([\s\S]*?)^SQL$/m);
assert.ok(authExpirySqlMatch,'The catalog extraction query must remain independently inspectable.');
const authExpirySql=authExpirySqlMatch[1];
for(const condition of ["a.atttypid='pg_catalog.timestamptz'::pg_catalog.regtype",'a.atttypmod=-1',
  'not a.attnotnull','not a.atthasdef','d.oid is null',"a.attidentity=''","a.attgenerated=''",
  "a.attrelid='auth.one_time_tokens'::pg_catalog.regclass","a.attname='expires_at'",'a.attnum>0','not a.attisdropped']){
  assert.ok(authExpirySql.includes(condition),`Missing exact source-column requirement: ${condition}`);
}
assert.match(authExpirySql,/from pg_catalog\.pg_attribute a[\s\S]*left join pg_catalog\.pg_attrdef d/);
assert.doesNotMatch(authExpirySql,/\b(?:from|join)\s+auth\./i,'Only metadata may be read from the source.');
assert.doesNotMatch(authExpirySql,/^\s*(?:alter|drop|create|insert|update|delete)\b/im,'The source query must not execute DDL or DML.');
assert.match(authExpiryCapture,/cmp --silent - "\$RUNNER_TEMP\/drx-restore-auth-expiry\.sql"/);
assert.match(authExpiryCapture,/cat "\$RUNNER_TEMP\/drx-restore-auth-expiry\.sql" >> "\$BACKUP_DIR\/auth_recovery_schema\.sql"/);
assert.ok(workflow.indexOf('# END exact source Auth expiry compatibility')<workflow.indexOf('sha256sum "$BACKUP_DIR"/*.sql'),
  'The compatibility addition must be covered by the existing managed Auth backup hash.');
const cleanup=workflow.slice(workflow.indexOf('- name: Remove disposable database and raw backup files'));
assert.ok(cleanup.includes('"$RUNNER_TEMP/drx-restore-auth-expiry.sql"'),'Temporary compatibility SQL must be removed with raw backup diagnostics.');
const authExpiryDir=fs.mkdtempSync(path.join(os.tmpdir(),'drx-auth-expiry-capture-'));
assert.equal(path.dirname(path.resolve(authExpiryDir)),path.resolve(os.tmpdir()));
const authExpiryStatement='ALTER TABLE auth.one_time_tokens ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;';
const authExpiryPrivateMarker='SYNTHETIC_AUTH_CATALOG_CONTEXT_MUST_NOT_APPEAR';
const authExpiryCases=[
  ['matching',authExpiryStatement+'\n',false,true],
  ['missing','',false,false],
  ['incompatible','SOURCE_AUTH_EXPIRY_SCHEMA_MISMATCH\n',false,false],
  ['multiple',authExpiryStatement+'\n'+authExpiryStatement+'\n',false,false],
  ['capture-error','',true,false],
];
try {
  for(const [name,output,captureFails,accepted] of authExpiryCases){
    const temporary=path.join(authExpiryDir,name);
    fs.mkdirSync(temporary);
    const portable=temporary.replace(/\\/g,'/');
    const schemaFile=path.join(temporary,'auth_recovery_schema.sql');
    const originalSchema='-- captured source MFA schema only\n';
    fs.writeFileSync(schemaFile,originalSchema);
    const standIn=`psql() {
      printf '%s\\0' "$@" > "$RUNNER_TEMP/catalog-args"
      cat > "$RUNNER_TEMP/catalog-query.sql"
      if [ "$DRX_AUTH_CAPTURE_FAILS" = "1" ]; then
        printf '%s\\n' '${authExpiryPrivateMarker}' >&2
        return 3
      fi
      printf '%s' "$DRX_AUTH_CATALOG_OUTPUT"
    }`;
    const command=`set -euo pipefail\n${standIn}\n${authExpiryCapture}\n`;
    const result=spawnSync(bash,['-c',command],{encoding:'utf8',timeout:15000,env:{
      PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT || '',WINDIR:process.env.WINDIR || '',
      RUNNER_TEMP:portable,BACKUP_DIR:portable,SUPABASE_DB_URL:direct,
      DRX_AUTH_CATALOG_OUTPUT:output,DRX_AUTH_CAPTURE_FAILS:captureFails ? '1' : '0'}});
    assert.equal(result.error,undefined,`Catalog compatibility fixture must execute: ${name}`);
    assert.equal(result.status,accepted ? 0 : 1,`Catalog compatibility acceptance is bounded: ${name}`);
    assert.equal(result.stderr,'','Raw source diagnostics must stay in ephemeral files.');
    assert.ok(!result.stdout.includes(authExpiryPrivateMarker),'Source capture failures must not leak raw context.');
    assert.ok(!result.stdout.includes(authExpiryStatement),'Generated source DDL must not be printed.');
    assert.equal(fs.readFileSync(schemaFile,'utf8'),accepted ? originalSchema+'\n'+authExpiryStatement+'\n' : originalSchema,
      `Only one exact validated statement may enter the managed Auth backup: ${name}`);
    assert.deepEqual(fs.readFileSync(path.join(temporary,'catalog-args'),'utf8').split('\0').slice(0,-1),
      [direct,'-X','--quiet','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--set','SHOW_CONTEXT=never','--tuples-only','--no-align']);
    assert.equal(fs.readFileSync(path.join(temporary,'catalog-query.sql'),'utf8'),authExpirySql,
      'Only the real catalog SELECT is sent to the source connection.');
  }
} finally {fs.rmSync(authExpiryDir,{recursive:true,force:true});}
console.log(`Bounded Auth expiry capture: ${authExpiryCases.length} executable exact, missing, incompatible, multiple and private failure output cases passed without database access.`);

// Auth additions and both Storage lifecycle columns were confirmed against
// source catalogs and official migrations after the exact pinned images. Execute
// every metadata guard with synthetic output without accessing a database.
const boundedAuthSpecs=[
  {name:'tables',label:'table allowlist',expected:'AUTH_RECOVERY_TABLES_CONFIRMED',append:false,
    requirements:["count(*)=4","array['mfa_recovery_code_sets','mfa_recovery_codes','scim_tokens','scim_users']",
      "c.relkind='r'","pg_catalog.pg_get_userbyid(c.relowner)='supabase_auth_admin'",'not c.relrowsecurity','not c.relforcerowsecurity']},
  {name:'factor',label:'factor compatibility',expected:"ALTER TYPE auth.factor_type ADD VALUE IF NOT EXISTS 'recovery_code' AFTER 'phone';",append:true,
    requirements:["array_agg(e.enumlabel::text order by e.enumsortorder)=array['totp','webauthn','phone','recovery_code']",
      "n.nspname='auth' and t.typname='factor_type' and t.typtype='e'"]},
  {name:'lifecycle',platform:'Storage',prefix:'storage',label:'lifecycle compatibility',
    expected:'ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS lifecycle_configuration jsonb, ADD COLUMN IF NOT EXISTS lifecycle_configuration_generation uuid;',append:true,
    requirements:['count(*)=2',"array['lifecycle_configuration','lifecycle_configuration_generation']",
      "c.relkind='r'","pg_catalog.pg_get_userbyid(c.relowner)='supabase_storage_admin'",'c.relrowsecurity','not c.relforcerowsecurity',
      "a.attname='lifecycle_configuration' and a.atttypid='pg_catalog.jsonb'::pg_catalog.regtype",
      "a.attname='lifecycle_configuration_generation' and a.atttypid='pg_catalog.uuid'::pg_catalog.regtype",
      'a.atttypmod=-1','not a.attnotnull','not a.atthasdef','d.oid is null',"a.attidentity=''","a.attgenerated=''",
      "n.nspname='storage' and c.relname='buckets'","a.attname in ('lifecycle_configuration','lifecycle_configuration_generation')",
      'a.attnum>0','not a.attisdropped']},
];
const boundedAuthDir=fs.mkdtempSync(path.join(os.tmpdir(),'drx-bounded-auth-capture-'));
assert.equal(path.dirname(path.resolve(boundedAuthDir)),path.resolve(os.tmpdir()));
let boundedAuthCases=0;
try{
  for(const spec of boundedAuthSpecs){
    const begin=`# BEGIN exact source ${spec.platform || 'Auth'} ${spec.label}`;
    const end=`# END exact source ${spec.platform || 'Auth'} ${spec.label}`;
    const start=workflow.indexOf(begin);
    const finish=workflow.indexOf(end,start);
    assert.ok(start>=0 && finish>start,`Missing bounded source guard: ${spec.name}`);
    const capture=workflow.slice(start-12,finish+end.length).replace(/\r\n/g,'\n').replace(/^ {10}/gm,'');
    const queryMatch=capture.match(/<<'SQL'[^\n]*\n([\s\S]*?)^SQL$/m);
    assert.ok(queryMatch,`Missing source catalog SELECT: ${spec.name}`);
    for(const condition of spec.requirements)assert.ok(queryMatch[1].includes(condition),`Missing bounded ${spec.name} requirement: ${condition}`);
    assert.doesNotMatch(queryMatch[1],/\b(?:from|join)\s+(?:auth|storage)\./i,'Compatibility guards may read only PostgreSQL catalogs.');
    assert.doesNotMatch(queryMatch[1],/^\s*(?:alter|drop|create|insert|update|delete)\b/im,'No source DDL or DML may execute.');
    assert.ok(finish<workflow.indexOf('sha256sum "$BACKUP_DIR"/*.sql'),'Every bounded managed-schema addition must precede backup hashing.');
    const compatibilityPath=`"$RUNNER_TEMP/drx-restore-${spec.prefix || 'auth'}-${spec.name}.${spec.append ? 'sql' : 'txt'}"`;
    assert.ok(cleanup.includes(compatibilityPath),'Every temporary compatibility capture must be cleaned.');
    if(spec.append)assert.ok(capture.includes('>> "$BACKUP_DIR/auth_recovery_schema.sql"'),'Bounded managed-schema additions must replay in the existing isolated admin transaction.');
    for(const [name,output,captureFails,accepted] of [
      ['matching',spec.expected+'\n',false,true],['missing','',false,false],
      ['incompatible','SOURCE_PLATFORM_SCHEMA_MISMATCH\n',false,false],
      ['multiple',spec.expected+'\n'+spec.expected+'\n',false,false],['capture-error','',true,false]]){
      boundedAuthCases++;
      const temporary=path.join(boundedAuthDir,`${spec.name}-${name}`); fs.mkdirSync(temporary);
      const portable=temporary.replace(/\\/g,'/');
      const schemaFile=path.join(temporary,'auth_recovery_schema.sql');
      const originalSchema='-- exact captured MFA/SCIM schema and expiry addition\n';
      fs.writeFileSync(schemaFile,originalSchema);
      const privateMarker='SYNTHETIC_BOUNDED_AUTH_CONTEXT_MUST_NOT_APPEAR';
      const standIn=`psql() {
        cat > "$RUNNER_TEMP/catalog-query.sql"
        if [ "$DRX_AUTH_CAPTURE_FAILS" = "1" ]; then printf '%s\\n' '${privateMarker}' >&2; return 3; fi
        printf '%s' "$DRX_AUTH_CATALOG_OUTPUT"
      }`;
      const result=spawnSync(bash,['-c',`set -euo pipefail\n${standIn}\n${capture}\n`],{encoding:'utf8',timeout:15000,env:{
        PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT || '',WINDIR:process.env.WINDIR || '',
        RUNNER_TEMP:portable,BACKUP_DIR:portable,SUPABASE_DB_URL:direct,
        DRX_AUTH_CATALOG_OUTPUT:output,DRX_AUTH_CAPTURE_FAILS:captureFails ? '1' : '0'}});
      assert.equal(result.error,undefined,`Bounded catalog guard must execute: ${spec.name}/${name}`);
      assert.equal(result.status,accepted ? 0 : 1,`Only exact compatible source metadata is accepted: ${spec.name}/${name}`);
      assert.equal(result.stderr,'');
      assert.ok(!result.stdout.includes(privateMarker),'Raw source diagnostics cannot appear in public output.');
      assert.ok(!result.stdout.includes(spec.expected),'Catalog guard/output DDL cannot appear in public output.');
      assert.equal(fs.readFileSync(schemaFile,'utf8'),accepted && spec.append ? originalSchema+spec.expected+'\n' : originalSchema,
        'Unvalidated or repeated compatibility must never alter the hashed schema replay.');
      assert.equal(fs.readFileSync(path.join(temporary,'catalog-query.sql'),'utf8'),queryMatch[1]);
    }
  }
}finally{fs.rmSync(boundedAuthDir,{recursive:true,force:true});}
console.log(`Bounded MFA/SCIM tables, factor enum and Storage lifecycle columns: ${boundedAuthCases} executable exact, missing, incompatible, repeated and private failure capture cases passed without database access.`);

// Execute the literal restore function with synthetic command stand-ins. Only
// managed Auth stages may use the verified local admin container, and both must
// remain transactional. Schema/data/history must keep the local postgres path.
const restoreFunctionMatch=restore.match(/          restore_sql\(\) \{\r?\n[\s\S]*?\r?\n          \}/);
assert.ok(restoreFunctionMatch,'The real restore dispatcher must remain executable.');
const restoreFunction=restoreFunctionMatch[0].replace(/\r\n/g,'\n').replace(/^ {10}/gm,'');
const restoreDispatchDir=fs.mkdtempSync(path.join(os.tmpdir(),'drx-restore-dispatch-'));
assert.equal(path.dirname(path.resolve(restoreDispatchDir)),path.resolve(os.tmpdir()));
const restoreContainer='supabase_db_drx-isolated-restore';
const localRestoreUrl='postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const restorePrivateMarker='SYNTHETIC_RESTORE_CONTEXT_MUST_NOT_APPEAR';
let restoreDispatchCases=0;
try {
  const sourceFile=path.join(restoreDispatchDir,'synthetic.sql').replace(/\\/g,'/');
  const historyFile=path.join(restoreDispatchDir,'synthetic-history.sql').replace(/\\/g,'/');
  const sourceSql='-- synthetic schema/trigger statement only\nSELECT 1;\n';
  fs.writeFileSync(sourceFile,sourceSql); fs.writeFileSync(historyFile,'SELECT 2;\n');
  function bashLiteral(value){return "'"+value.replace(/'/g,"'\"'\"'")+"'";}
  function invokeRestore(stage,args,failAdmin=false){
    const capture=path.join(restoreDispatchDir,`capture-${++restoreDispatchCases}`).replace(/\\/g,'/');
    const standIns=`
      docker() {
        printf '%s\\0' docker "$@" > "$DRX_RESTORE_CAPTURE"
        cat > "$DRX_RESTORE_CAPTURE.stdin"
        if [ "$DRX_RESTORE_FAIL_ADMIN" = "1" ]; then
          printf '%s\\n' 'psql:<stdin>:1: ERROR:  42501' 'CONTEXT: ${restorePrivateMarker}' >&2
          return 3
        fi
      }
      psql() { printf '%s\\0' psql "$@" > "$DRX_RESTORE_CAPTURE"; }
    `;
    const command=`set -euo pipefail\n${standIns}\n${restoreFunction.replace(/\bpython3\b/g,'"${DRX_TEST_PYTHON}"')}\nrestore_sql ${[stage,...args].map(bashLiteral).join(' ')}\n`;
    const environment={PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT || '',WINDIR:process.env.WINDIR || '',
      RUNNER_TEMP:restoreDispatchDir.replace(/\\/g,'/'),GITHUB_WORKSPACE:ROOT.replace(/\\/g,'/'),
      RESTORE_CONTAINER:restoreContainer,DB_URL:localRestoreUrl,DRX_RESTORE_CAPTURE:capture,
      DRX_RESTORE_FAIL_ADMIN:failAdmin ? '1' : '0',DRX_TEST_PYTHON:python};
    const result=spawnSync(bash,['-c',command],{env:environment,encoding:'utf8',timeout:15000});
    assert.equal(result.error,undefined,'The synthetic restore dispatcher must execute.');
    assert.equal(result.stderr,'','Raw database diagnostics must remain private.');
    assert.ok(!result.stdout.includes(restorePrivateMarker),'Synthetic private context cannot leak from admin restoration.');
    return {result,args:fs.readFileSync(capture,'utf8').split('\0').slice(0,-1),capture};
  }
  const adminArgs=['docker','exec','-i',restoreContainer,'psql','-U','supabase_admin','-d','postgres','-X','--quiet',
    '--single-transaction','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--set','SHOW_CONTEXT=never','--file=-'];
  for(const [stage,args] of [['managed_auth',['--file',sourceFile]],['auth_triggers',['--single-transaction','--file',sourceFile]]]){
    const invocation=invokeRestore(stage,args);
    assert.equal(invocation.result.status,0);
    assert.deepEqual(invocation.args,adminArgs,'Each managed stage streams only into the explicitly local admin in one transaction.');
    assert.equal(fs.readFileSync(invocation.capture+'.stdin','utf8'),sourceSql,'Managed restoration must replay the captured source file exactly.');
  }
  const postgresArgs=['psql',localRestoreUrl,'-X','--quiet','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--set','SHOW_CONTEXT=never'];
  for(const [stage,args] of [['schema',['--file',sourceFile]],
    ['data',['--command','SET session_replication_role = replica','--file',sourceFile]],
    ['history',['--single-transaction','--command','DROP SCHEMA IF EXISTS supabase_migrations CASCADE','--file',sourceFile,'--file',historyFile]]]){
    const invocation=invokeRestore(stage,args);
    assert.equal(invocation.result.status,0);
    assert.deepEqual(invocation.args,[...postgresArgs,...args],'Ordinary restoration must keep its original local postgres arguments.');
    assert.equal(fs.existsSync(invocation.capture+'.stdin'),false,'Ordinary restoration must not enter the admin streaming path.');
  }
  const failed=invokeRestore('auth_triggers',['--single-transaction','--file',sourceFile],true);
  assert.equal(failed.result.status,1,'Managed restoration failure must stop the workflow.');
  const failureMatch=failed.result.stdout.match(/Isolated restore failed: (\{.*\}); raw database diagnostics are not published\./);
  assert.ok(failureMatch,'Admin failure must emit only the bounded safe diagnostic.');
  assert.deepEqual(JSON.parse(failureMatch[1]),{failedStage:'auth_triggers',sqlstate:'42501',copyRelation:null});
} finally {fs.rmSync(restoreDispatchDir,{recursive:true,force:true});}
console.log(`Isolated restore dispatcher: ${restoreDispatchCases} executable managed-admin, transaction, ordinary-postgres and private failure cases passed without database access.`);

// Execute diagnostics against synthetic SQL/logs. Even a row that resembles a
// COPY statement, a verbose error, or a malformed identifier must not leak text.
assert.match(restore,/backup-restore-diagnostic\.py/);
assert.match(workflow,/drx-restore-failure\.json/);
const diagnosticDir=fs.mkdtempSync(path.join(os.tmpdir(),'drx-backup-diagnostic-'));
assert.equal(path.dirname(path.resolve(diagnosticDir)),path.resolve(os.tmpdir()));
try {
  const logFile=path.join(diagnosticDir,'restore.log');
  const sqlFile=path.join(diagnosticDir,'data.sql');
  const secret='SYNTHETIC_PRIVATE_CONTENT_MUST_NOT_APPEAR';
  function diagnostic(log,sql,stage='data') {
    fs.writeFileSync(logFile,log); fs.writeFileSync(sqlFile,sql);
    const result=spawnSync(python,[path.join(ROOT,'scripts/backup-restore-diagnostic.py'),stage,logFile,sqlFile],{encoding:'utf8'});
    assert.equal(result.status,0); assert.equal(result.stderr,'');
    assert.ok(!result.stdout.includes(secret));
    return JSON.parse(result.stdout);
  }
  const sql=`COPY auth.schema_migrations (version) FROM stdin;\n${secret}\nCOPY public.private_name (value) FROM stdin;\n\\.\n`;
  const log=`psql:/tmp/data.sql:4: ERROR:  23505\nCONTEXT: ${secret}\n`;
  assert.deepEqual(diagnostic(log,sql),{failedStage:'data',sqlstate:'23505',copyRelation:'auth.schema_migrations'});
  assert.deepEqual(diagnostic(log.replace('23505','22P02'),sql),{failedStage:'data',sqlstate:'22P02',copyRelation:'auth.schema_migrations'});
  assert.deepEqual(diagnostic(`psql:/tmp/data.sql:2: ERROR: private ${secret}\n`,sql),{failedStage:'data',sqlstate:'unavailable',copyRelation:null});
  assert.deepEqual(diagnostic(log,`COPY "auth"."users" (id) FROM stdin;\n${secret}\n\\.\n`,secret),{failedStage:'unknown',sqlstate:'23505',copyRelation:null});
  assert.deepEqual(diagnostic('psql:/tmp/data.sql:3: ERROR:  23502\n',`COPY "public"."user_notes" (id) FROM stdin;\n${secret}\n\\.\n`),{failedStage:'data',sqlstate:'23502',copyRelation:'public.user_notes'});
  assert.deepEqual(diagnostic('psql:/tmp/data.sql:3: ERROR:  23514\n',`COPY "private ${secret}".x (id) FROM stdin;\n${secret}\n\\.\n`),{failedStage:'data',sqlstate:'23514',copyRelation:null});
  assert.deepEqual(diagnostic('connection failure '+secret,sql),{failedStage:'data',sqlstate:'unavailable',copyRelation:null});
} finally {fs.rmSync(diagnosticDir,{recursive:true,force:true});}
console.log('Seven executable restore-diagnostic privacy and SQLSTATE cases passed.');


// Execute the actual bounded catalog builder and comparison. Fingerprint equality
// stays strict, while only names, privilege booleans, counts and hashes can leave
// the disposable runner; raw definitions/config/default/policy text cannot.
function catalogPython(marker){
  const start=workflow.indexOf(`# BEGIN ${marker}`); const end=workflow.indexOf(`# END ${marker}`,start);
  assert.ok(start>=0 && end>start,`Missing actual catalog diagnostic: ${marker}`);
  const block=workflow.slice(start,end).replace(/\r\n/g,'\n').replace(/^ {10}/gm,'');
  const match=block.match(/<<'PY'\n([\s\S]*?)^PY$/m);
  assert.ok(match,`Missing executable catalog Python: ${marker}`); return match[1];
}
const catalogBuilder=catalogPython('safe catalog component builder');
const catalogComparison=catalogPython('safe catalog mismatch comparison');
const catalogDir=fs.mkdtempSync(path.join(os.tmpdir(),'drx-catalog-component-diagnostic-'));
assert.equal(path.dirname(path.resolve(catalogDir)),path.resolve(os.tmpdir()));
for(const file of ['drx-restore-security-components.sql','drx-source-security-components.ndjson','drx-restore-security-components.ndjson']){
  assert.ok(cleanup.includes(`"$RUNNER_TEMP/${file}"`),'Ephemeral component diagnostics must be cleaned.');
}
assert.match(restore,/if ! diff -u "\$RUNNER_TEMP\/drx-source-manifest\.txt" "\$RUNNER_TEMP\/drx-restore-manifest\.txt"; then[\s\S]*?safe catalog mismatch comparison[\s\S]*?exit 1\s*fi/);
assert.match(workflow,/--file "\$RUNNER_TEMP\/drx-restore-security-components\.sql"[\s\\]*> "\$RUNNER_TEMP\/drx-source-security-components\.ndjson" 2> "\$RUNNER_TEMP\/drx-restore-source-components\.log"/);
assert.match(restore,/--file "\$RUNNER_TEMP\/drx-restore-security-components\.sql"[\s\\]*> "\$RUNNER_TEMP\/drx-restore-security-components\.ndjson" 2> "\$RUNNER_TEMP\/drx-restore-target-components\.log"/);
let catalogCases=0;
try{
  const catalogEnv={...process.env,RUNNER_TEMP:catalogDir};
  const exactSql=securitySql.replace(/\r\n/g,'\n').replace(/^ {10}/gm,'');
  fs.writeFileSync(path.join(catalogDir,'drx-restore-security-manifest.sql'),exactSql);
  const built=spawnSync(python,['-c',catalogBuilder],{encoding:'utf8',env:catalogEnv});
  assert.equal(built.status,0,built.stderr); assert.equal(built.stdout,''); assert.equal(built.stderr,'');
  const componentsSql=fs.readFileSync(path.join(catalogDir,'drx-restore-security-components.sql'),'utf8').replace(/\r\n/g,'\n');
  for(const [cte,label] of [['functions','application_functions'],['relations','personal_write_tables']]){
    const entry=exactSql.match(new RegExp(`(with ${cte} as \\([\\s\\S]*?\\n\\))\\nselect '${label}_fingerprint=`));
    assert.ok(entry); assert.ok(componentsSql.includes(entry[1]),'Diagnostics must derive the exact existing fingerprint entry definitions.');
  }
  assert.match(componentsSql,/md5\(\(entry->'definition'\)::text\)/);
  assert.match(componentsSql,/md5\(\(entry->'config'\)::text\)/);
  assert.match(componentsSql,/md5\(\(entry->'acl'\)::text\)/);
  assert.doesNotMatch(componentsSql,/^\s*(?:alter|drop|create|insert|update|delete)\b/im);
  assert.match(componentsSql,/pg_catalog\.pg_default_acl/);
  assert.match(componentsSql,/rolname in \('postgres','supabase_admin'\)/);
  assert.match(componentsSql,/values \('GLOBAL'\),\('public'\),\('private'\),\('note_write_private'\),\('prescription_write_private'\)/);
  assert.match(componentsSql,/pg_catalog\.acldefault\(k\.object_type::"char",c\.oid\)/);
  assert.match(componentsSql,/case when cardinality\(acl\)=0 then null::pg_catalog\.aclitem\[\] else acl end/);
  assert.doesNotMatch(componentsSql,/\b(?:from|join)\s+(?:auth\.users|public\.(?:user_notes|user_favorites|user_prescriptions|medindex_users)|(?:note_write_private|prescription_write_private)\.receipts)\b/i);
  const roleNames=['anon','authenticated','service_role'];
  const privilegeNames=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  const fn={kind:'function',identity:'public.synthetic_rpc()',components:{owner:'postgres',definitionHash:'a'.repeat(32),configHash:'b'.repeat(32),aclHash:'c'.repeat(32),effective:roleNames.map(role=>[role,false])}};
  const table={kind:'table',identity:'public.user_prescriptions',components:{owner:'postgres',rls:true,forceRls:false,
    privileges:roleNames.flatMap(role=>privilegeNames.map(privilege=>[role,privilege,false])),
    columnsHash:'d'.repeat(32),columnsCount:3,constraintsHash:'e'.repeat(32),constraintsCount:2,policiesHash:'f'.repeat(32),policiesCount:1}};
  const secret='SYNTHETIC_PRIVATE_CATALOG_EXPRESSION_MUST_NOT_APPEAR';
  function compare(source,restored){
    catalogCases++;
    for(const [name,rows] of [['drx-source-security-components.ndjson',source],['drx-restore-security-components.ndjson',restored]]){
      fs.writeFileSync(path.join(catalogDir,name),typeof rows==='string' ? rows : rows.map(row=>JSON.stringify(row)).join('\n')+(rows.length ? '\n' : ''));
    }
    const result=spawnSync(python,['-c',catalogComparison],{encoding:'utf8',env:catalogEnv});
    assert.equal(result.status,0,result.stderr); assert.equal(result.stderr,''); assert.ok(!result.stdout.includes(secret));
    const failureText=fs.readFileSync(path.join(catalogDir,'drx-restore-failure.json'),'utf8');
    assert.ok(!failureText.includes(secret)); const failure=JSON.parse(failureText);
    assert.equal(failure.failedStage,'manifest_comparison');
    assert.equal(failure.restoreVerified,undefined,'Diagnostics cannot convert any manifest mismatch into verification.');
    return failure.catalogDiagnostic;
  }
  const same=compare([fn,table],[fn,table]);
  assert.equal(same.status,'NO_COMPONENT_DIFFERENCE'); assert.equal(same.differenceCount,0);
  assert.deepEqual(same.sourceCounts,{function:1,defaultAcl:0,table:1});
  const changedFn=structuredClone(fn); changedFn.components.definitionHash='1'.repeat(32); changedFn.components.aclHash='2'.repeat(32); changedFn.components.effective[0][1]=true;
  const changedTable=structuredClone(table); changedTable.components.privileges[0][2]=true; changedTable.components.constraintsHash='3'.repeat(32);
  const changed=compare([fn,table],[changedFn,changedTable]);
  assert.equal(changed.status,'DIFFERENCES'); assert.equal(changed.differenceCount,5);
  assert.deepEqual(changed.differenceCountsByKindAndComponent,{function:{aclHash:1,definitionHash:1,effective:1},defaultAcl:{},table:{constraintsHash:1,privileges:1}});
  assert.deepEqual(changed.differences.map(item=>item.component).sort(),['aclHash','constraintsHash','definitionHash','effective','privileges']);
  assert.deepEqual(changed.differences.find(item=>item.component==='effective').source,[['anon',false]]);
  assert.deepEqual(changed.differences.find(item=>item.component==='privileges').restored,[['anon','SELECT',true]]);
  const defaults={kind:'defaultAcl',identity:'postgres:public:f',components:{grants:['PUBLIC',...roleNames,'postgres'].map(role=>[role,'EXECUTE',false])}};
  const changedDefaults=structuredClone(defaults); changedDefaults.components.grants[1][2]=true;
  const aclDifference=compare([defaults],[changedDefaults]);
  assert.equal(aclDifference.differenceCount,1); assert.equal(aclDifference.differences[0].component,'grants');
  assert.deepEqual(aclDifference.differences[0].source,[['anon','EXECUTE',false]]);
  assert.deepEqual(aclDifference.differences[0].restored,[['anon','EXECUTE',true]]);
  const absent=compare([fn],[table]); assert.equal(absent.differenceCount,2);
  assert.ok(absent.differences.every(item=>item.component==='present' && typeof item.source==='boolean' && typeof item.restored==='boolean'));
  const injected=structuredClone(fn); injected.rawDefinition=secret; injected.components.unapprovedRawConfig=secret;
  assert.equal(compare([injected],[fn]).differenceCount,0,'Only approved component fields may be emitted.');
  const invalid=structuredClone(fn); invalid.components.definitionHash=secret;
  assert.equal(compare([invalid],[fn]).status,'UNAVAILABLE','Invalid hashes must produce only a generic safe diagnostic.');
  assert.equal(compare(secret,[fn]).status,'UNAVAILABLE','Malformed input must not appear in a traceback or evidence.');
  assert.equal(compare([fn,fn],[fn]).status,'UNAVAILABLE','Duplicate identities cannot silently replace an entry.');
  const many=Array.from({length:51},(_,index)=>({...structuredClone(fn),identity:`public.synthetic_${index}()`}));
  const bounded=compare(many,[]); assert.equal(bounded.differenceCount,51); assert.equal(bounded.differences.length,25); assert.equal(bounded.truncated,true);
  assert.deepEqual(bounded.differenceCountsByKindAndComponent,{function:{present:51},defaultAcl:{},table:{}},'Complete kind/component counts must survive individual diagnostic truncation.');
}finally{fs.rmSync(catalogDir,{recursive:true,force:true});}
console.log(`Safe catalog component diagnostic: exact fingerprint builder and ${catalogCases} executable mismatch, missing, privacy, invalid and bounded-output cases passed.`);


// Execute local schema preparation through the real dispatcher. These fixtures
// verify caller/transaction/privacy wiring; actual PostgreSQL guard/rollback
// semantics are recorded separately by the outputs-only embedded PG verifier.
const defaultsMatch=restore.match(/          # BEGIN guarded local default ACL preparation\r?\n([\s\S]*?)          # END guarded local default ACL preparation/);
assert.ok(defaultsMatch);
const defaultsCapture=defaultsMatch[1].replace(/\r\n/g,'\n').replace(/^ {10}/gm,'');
const defaultsSqlMatch=defaultsCapture.match(/<<'SQL'\n([\s\S]*?)^SQL$/m);
assert.ok(defaultsSqlMatch);const defaultsSql=defaultsSqlMatch[1];
assert.deepEqual([...defaultsSql.matchAll(/^ALTER DEFAULT PRIVILEGES (.+);$/gm)].map(match=>match[1]),
  ['TABLES','FUNCTIONS','SEQUENCES'].map(kind=>`FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ${kind} FROM anon, authenticated, service_role`));
for(const condition of ["current_user IS DISTINCT FROM 'postgres'","cardinality(allowed_recipients) IS DISTINCT FROM 4",
  "d.defaclnamespace=0 OR n.nspname IN ('private','note_write_private','prescription_write_private')",
  "defaclobjtype NOT IN ('r','f','S')",'a.grantee<>ALL(allowed_recipients)','a.grantor<>creator','OR a.is_grantable',
  'jsonb_build_array(creator,creator,privilege,false)',"('S','SELECT'),('S','UPDATE'),('S','USAGE')",'d.oid IS NULL','IS DISTINCT FROM e.acl',"pg_catalog.acldefault('f',creator)","a.grantee=0 AND a.privilege_type='EXECUTE' AND NOT a.is_grantable"]){
  assert.ok(defaultsSql.includes(condition),`Missing fail-closed local default ACL requirement: ${condition}`);
}
assert.doesNotMatch(defaultsSql,/\b(?:GRANT|CASCADE)\b/,'Preparation may not add privileges or delete objects.');
assert.doesNotMatch(defaultsCapture,/SUPABASE_DB_URL|BACKUP_DIR|supabase_admin/,'Preparation must use only the current_user postgres local path.');
assert.match(defaultsCapture,/restore_sql schema --single-transaction --file "\$RUNNER_TEMP\/drx-restore-postgres-defaults\.sql"/);
assert.ok(restore.indexOf('# BEGIN guarded local default ACL preparation')>restore.indexOf('docker inspect "$RESTORE_CONTAINER"'));
assert.ok(restore.indexOf('# END guarded local default ACL preparation')<restore.indexOf('restore_sql schema --file "$BACKUP_DIR/schema.sql"'),
  'Default grants must be removed before source application objects are created, preserving source capture/replay ordering.');
assert.ok(cleanup.includes('"$RUNNER_TEMP/drx-restore-postgres-defaults.sql"'));
const localAssignment=restore.match(/DB_URL='postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres'/);
assert.ok(localAssignment);
const defaultsDir=fs.mkdtempSync(path.join(os.tmpdir(),'drx-local-default-transaction-'));
assert.equal(path.dirname(path.resolve(defaultsDir)),path.resolve(os.tmpdir()));
try{
  for(const fails of [false,true]){
    const directory=path.join(defaultsDir,fails ? 'reject' : 'accept');fs.mkdirSync(directory);
    const portable=directory.replace(/\\/g,'/');const privateMarker='SYNTHETIC_DEFAULT_GUARD_CONTEXT_MUST_NOT_APPEAR';
    const standIn=`psql() {
      printf '%s\\0' "$@" > "$RUNNER_TEMP/observed-args"
      local previous="" argument
      for argument in "$@"; do
        if [ "$previous" = "--file" ]; then cat "$argument" > "$RUNNER_TEMP/observed.sql"; fi
        previous="$argument"
      done
      if [ "$DRX_DEFAULTS_FAIL" = "1" ]; then printf '%s\\n' 'psql:/tmp/defaults.sql:1: ERROR:  P0001' 'CONTEXT: ${privateMarker}' >&2; return 3; fi
    }
    python3() { command "${python.replace(/\\/g,'/')}" "$@"; }`;
    const result=spawnSync(bash,['-c',`set -euo pipefail\n${standIn}\n${restoreFunction}\n${localAssignment[0]}\n${defaultsCapture}`],
      {encoding:'utf8',timeout:15000,env:{...process.env,RUNNER_TEMP:portable,GITHUB_WORKSPACE:ROOT.replace(/\\/g,'/'),DRX_DEFAULTS_FAIL:fails ? '1' : '0'}});
    assert.equal(result.error,undefined);assert.equal(result.status,fails ? 1 : 0);assert.equal(result.stderr,'');
    assert.ok(!result.stdout.includes(privateMarker));
    assert.equal(fs.readFileSync(path.join(directory,'observed.sql'),'utf8'),defaultsSql,'The bounded guard SQL must be replayed exactly.');
    const args=fs.readFileSync(path.join(directory,'observed-args'),'utf8').split('\0').slice(0,-1);
    assert.equal(args[0],'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    assert.ok(args.includes('--single-transaction'));assert.ok(args.includes('ON_ERROR_STOP=1'));
    if(fails){
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'drx-restore-failure.json'),'utf8')),{failedStage:'schema',sqlstate:'P0001',copyRelation:null});
    }
  }
}finally{fs.rmSync(defaultsDir,{recursive:true,force:true});}
console.log('Guarded local default ACL preparation: exact three revokes, safe preconditions/order and two executable local transaction/privacy dispatcher cases passed.');
