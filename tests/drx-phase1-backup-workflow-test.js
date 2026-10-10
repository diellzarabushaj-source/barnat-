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
const restoreOrder=['restore_sql schema','restore_sql data','restore_sql history','restore_sql auth_triggers'];
let previous=-1;
for (const stage of restoreOrder) {
  const position=restore.indexOf(stage);
  assert.ok(position>previous, `Restore stage missing or out of order: ${stage}`);
  previous=position;
}
assert.match(restore,/restore_sql history --single-transaction[\s\S]*?DROP SCHEMA IF EXISTS supabase_migrations CASCADE[\s\S]*?--file "\$BACKUP_DIR\/history_schema\.sql"[\s\S]*?--file "\$BACKUP_DIR\/history_data\.sql"/);
assert.match(restore,/restore_sql auth_triggers --single-transaction --file "\$BACKUP_DIR\/auth_custom_triggers\.sql"/);
assert.match(restore,/SET session_replication_role = replica/);
assert.match(restore,/psql "\$DB_URL" -X --quiet --set ON_ERROR_STOP=1 "\$@" > "\$RUNNER_TEMP\/drx-restore-\$\{stage\}\.log" 2>&1/);
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
