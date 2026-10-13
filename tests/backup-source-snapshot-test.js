'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const python=process.env.PYTHON || (process.platform==='win32'?'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':'python3');
const code=String.raw`
import importlib.util, io, os, pathlib, tempfile
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('snapshot','scripts/backup-source-snapshot.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sid='00000003-0000001B-1'
source='postgresql://postgres.ftuchtmolddhhsdcwnqe:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require'
module.source_url(source)
for value in ['postgresql://postgres:synthetic@localhost/postgres',source.replace('5432','6543'),source.replace('ftuchtmolddhhsdcwnqe','foreign'),source.replace('require','disable'),source+'&options=-c%20x=y']:
    try: module.source_url(value)
    except ValueError: pass
    else: raise AssertionError('Invalid source accepted')
for value in ["';COMMIT;--",'00000003-0000001B-1\n',sid+';']:
    try: module.sql_prefix(value)
    except ValueError: pass
    else: raise AssertionError('Invalid snapshot accepted')
header=''.join('export '+name+'="synthetic$(never)"\n' for name in ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'])
template=header+'pg_dump \\\n  --data-only \\\n  --schema "*"\n'
result=module.snapshot_dump_script(template,sid)
assert 'synthetic' not in result and '$(never)' not in result
assert result.count('--snapshot=')==1 and '--data-only' in result and '--schema "*"' in result
assert '--snapshot=' not in module.snapshot_dump_script(header+'pg_dumpall --roles-only\n',sid,True)
for template in ['pg_dump \\\n',header+'pg_dump \n',header+'pg_dump \\\npg_dump \\\n']:
    try: module.snapshot_dump_script(template,sid)
    except ValueError: pass
    else: raise AssertionError('Changed CLI template accepted')
os.environ.update(SUPABASE_DB_URL=source,DRX_REAL_PSQL='fake-psql')
calls=[]
module.snapshot_id=lambda:sid
module.subprocess.run=lambda args,**kwargs:(calls.append((args,kwargs)) or SimpleNamespace(returncode=0))
assert module.psql([source,'-X','-c','select 42'])==0
query=calls[-1][1]['input']
assert query.startswith(module.sql_prefix(sid)) and 'select 42;\n' in query and query.endswith('COMMIT;\n')
assert 'READ ONLY' in query and '--quiet' in calls[-1][0]
module.subprocess.call=lambda args:(calls.append((args,{})) or 0)
module.psql(['postgresql://postgres:postgres@127.0.0.1:54322/postgres','-c','select 1'])
assert not calls[-1][1] and '--quiet' not in calls[-1][0]
os.environ['DRX_SNAPSHOT_LIVE_CHECK']='1'
module.psql([source,'-c','select 2']);assert not calls[-1][1]
del os.environ['DRX_SNAPSHOT_LIVE_CHECK']
with tempfile.TemporaryDirectory(prefix='snapshot-test-',dir='tests') as directory:
    root=pathlib.Path(directory).resolve();assert root.parent==pathlib.Path('tests').resolve()
    query_file=root/'query.sql';query_file.write_text('select 7;\n')
    module.psql([source,'--file',str(query_file)])
    assert 'select 7;' in calls[-1][1]['input'] and '--file' not in calls[-1][0]
    data=root/'native.sql';rows=root/'rows.sql';target=root/'source.sql'
    rows.write_text(pathlib.Path('scripts/backup-native-rows.sql').read_text())
    data.write_text("SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 17, true);\n")
    module.sequence_checkpoint(data,rows,target)
    output=target.read_text();assert "jsonb_build_array(17::bigint,true)" in output
    assert 'last_value' not in output and 'is_called' not in output
    for content in ["SELECT pg_catalog.setval('public.foreign', 17, true);\n",data.read_text()*2,data.read_text().replace('17','9223372036854775808')]:
        data.write_text(content)
        try: module.sequence_checkpoint(data,rows,target)
        except ValueError: pass
        else: raise AssertionError('Invalid sequence checkpoint accepted')
print('Snapshot guards passed: read-only imports, separate local/live guard, CLI credential isolation and retained sequence checkpoints.')
`;
const result=spawnSync(python,['-c',code],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
assert.equal(result.status,0,result.stdout+result.stderr);
process.stdout.write(result.stdout);
