"""One read-only source snapshot for dumps and parity queries; never log credentials."""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from urllib.parse import urlsplit, unquote, parse_qs

PROJECT = 'ftuchtmolddhhsdcwnqe'
SNAPSHOT = re.compile(r'[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+')


def source_url(value):
    url = urlsplit(value)
    direct = url.hostname == f'db.{PROJECT}.supabase.co' and unquote(url.username or '') == 'postgres'
    pooled = bool(re.fullmatch(r'aws-[0-9]+-eu-west-2\.pooler\.supabase\.com', url.hostname or '')) and unquote(url.username or '') == f'postgres.{PROJECT}'
    if url.scheme not in ('postgres', 'postgresql') or not (direct or pooled) or (url.port or 5432) != 5432 or url.path != '/postgres' or not url.password or url.fragment:
        raise ValueError('source_connection_invalid')
    if any(ord(c) < 32 for part in (url.username, url.password) for c in unquote(part or '')):
        raise ValueError('source_connection_invalid')
    options = parse_qs(url.query)
    if set(options) - {'sslmode', 'connect_timeout'} or options.get('sslmode', ['require']) not in (['require'], ['verify-ca'], ['verify-full']):
        raise ValueError('source_connection_invalid')
    return url


def state_dir():
    root = Path(os.environ['RUNNER_TEMP']).resolve()
    directory = root / 'drx-source-snapshot'
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.resolve().parent != root:
        raise ValueError('snapshot_state_invalid')
    return directory


def snapshot_id():
    directory = state_dir()
    value = (directory / 'snapshot').read_text().strip()
    if not SNAPSHOT.fullmatch(value) or (directory / 'stop').exists() or not (directory / 'ready').exists():
        raise ValueError('snapshot_unavailable')
    return value


def sql_prefix(snapshot):
    if not SNAPSHOT.fullmatch(snapshot):
        raise ValueError('snapshot_invalid')
    return f"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSET TRANSACTION SNAPSHOT '{snapshot}';\n"


def serve():
    dsn = os.environ['SUPABASE_DB_URL']
    source_url(dsn)
    directory = state_dir()
    if (directory / 'snapshot').exists():
        raise ValueError('snapshot_already_started')
    process = subprocess.Popen([os.environ['DRX_REAL_PSQL'], dsn, '-X', '-qAt', '--set', 'ON_ERROR_STOP=1'],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                               env={**os.environ, 'PGCONNECT_TIMEOUT': '15'})
    stopping = [False]
    for event in (signal.SIGTERM, signal.SIGINT):
        signal.signal(event, lambda *_: stopping.__setitem__(0, True))
    try:
        process.stdin.write("SET idle_in_transaction_session_timeout='28min';\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n")
        process.stdin.flush()
        exported = process.stdout.readline().strip()
        if not SNAPSHOT.fullmatch(exported):
            raise ValueError('snapshot_export_failed')
        (directory / 'snapshot').write_text(exported)
        (directory / 'snapshot').chmod(0o600)
        (directory / 'ready').touch(mode=0o600)
        started = time.monotonic()
        while not stopping[0] and not (directory / 'stop').exists():
            if process.poll() is not None or time.monotonic() - started > 26 * 60:
                raise ValueError('snapshot_connection_closed')
            time.sleep(0.25)
    finally:
        (directory / 'ready').unlink(missing_ok=True)
        if process.poll() is None:
            try:
                process.stdin.write('ROLLBACK;\n\\q\n')
                process.stdin.flush()
                process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                process.terminate()
                process.wait(timeout=10)


def psql(arguments):
    executable = os.environ['DRX_REAL_PSQL']
    if not arguments or arguments[0] != os.environ.get('SUPABASE_DB_URL') or os.environ.get('DRX_SNAPSHOT_LIVE_CHECK') == '1':
        return subprocess.call([executable, *arguments])
    source_url(arguments[0])
    prefix = sql_prefix(snapshot_id())
    # Every -c/-f query must run in the same session as SET TRANSACTION SNAPSHOT.
    kept, commands, index = [], [], 0
    while index < len(arguments):
        token = arguments[index]
        if token in ('-c', '--command', '-f', '--file'):
            if index + 1 >= len(arguments):
                raise ValueError('query_arguments_invalid')
            value = arguments[index + 1]
            if token in ('-f', '--file'):
                value = Path(value).read_text()
            commands.append(value if token in ('-f', '--file') else value.rstrip().rstrip(';') + ';\n')
            index += 2
        elif token.startswith(('--command=', '--file=')):
            key, value = token.split('=', 1)
            commands.append(Path(value).read_text() if key == '--file' else value.rstrip().rstrip(';') + ';\n')
            index += 1
        else:
            kept.append(token)
            index += 1
    if not commands:
        commands = [sys.stdin.read()]
    query = prefix + '\n'.join(commands) + '\nCOMMIT;\n'
    # SQL diagnostics can contain a private COPY row. Callers already redirect
    # source diagnostics; do not add the query or connection to an exception.
    return subprocess.run([executable, *kept, '--quiet'], input=query, text=True).returncode


def snapshot_dump_script(script, snapshot, role_only=False):
    # CLI dry-run expands credentials into shell quotes. Remove those exports
    # and pass original credentials as Docker environment variables instead.
    script, removed = re.subn(r'^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=.*\n', '', script, flags=re.M)
    if removed != 5:
        raise ValueError('dump_template_changed')
    if role_only:
        if len(re.findall(r'^pg_dumpall\b', script, re.M)) != 1:
            raise ValueError('dump_template_changed')
        return script
    if not SNAPSHOT.fullmatch(snapshot) or len(re.findall(r'^pg_dump\s+\\\s*$', script, re.M)) != 1:
        raise ValueError('dump_template_changed')
    return re.sub(r'^pg_dump\s+\\\s*$', lambda _: f'pg_dump --snapshot="{snapshot}" \\', script, count=1, flags=re.M)


def dump(arguments):
    url = source_url(os.environ['SUPABASE_DB_URL'])
    if arguments[:3] != ['supabase', 'db', 'dump'] or '--db-url' not in arguments or '-f' not in arguments:
        raise ValueError('dump_arguments_invalid')
    if arguments[arguments.index('--db-url') + 1] != os.environ['SUPABASE_DB_URL']:
        raise ValueError('dump_source_invalid')
    target = Path(arguments[arguments.index('-f') + 1])
    root = Path(os.environ['RUNNER_TEMP']).resolve()
    if target.resolve().parent != root / 'drx-phase1-backup':
        raise ValueError('dump_target_invalid')
    dry = subprocess.run([*arguments, '--dry-run'], capture_output=True, text=True, timeout=90)
    if dry.returncode or len(dry.stdout) > 256 * 1024:
        raise ValueError('dump_template_unavailable')
    script = snapshot_dump_script(dry.stdout, snapshot_id(), '--role-only' in arguments)
    private_script = state_dir() / 'dump.sh'
    private_script.write_text(script)
    private_script.chmod(0o600)
    environment = {**os.environ, 'PGHOST': url.hostname, 'PGPORT': str(url.port or 5432),
                   'PGUSER': unquote(url.username), 'PGPASSWORD': unquote(url.password), 'PGDATABASE': 'postgres',
                   'PGSSLMODE': parse_qs(url.query).get('sslmode', ['require'])[0]}
    command = ['docker', 'run', '--rm', '--network', 'host', '-v', f'{private_script}:/drx/dump.sh:ro']
    for name in ('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE'):
        command.extend(['-e', name])
    command.extend([os.environ['SOURCE_DUMP_IMAGE'], 'bash', '/drx/dump.sh'])
    try:
        with target.open('wb') as output:
            result = subprocess.run(command, env=environment, stdout=output, stderr=subprocess.DEVNULL, timeout=180)
        if result.returncode or not target.stat().st_size:
            raise ValueError('snapshot_dump_failed')
    finally:
        private_script.unlink(missing_ok=True)


def sequence_checkpoint(native_data, rows_file, target):
    # Sequences are not MVCC. Audit the checkpoint actually retained by pg_dump,
    # rather than a newer live sequence value reached by another sign-in.
    data = Path(native_data).read_text()
    rows = Path(rows_file).read_text()
    split = "SELECT pg_catalog.format($sql$\nSELECT jsonb_build_object('kind','sequenceState'"
    if rows.count(split) != 1:
        raise ValueError('sequence_template_changed')
    output = rows.split(split, 1)[0]
    seen = set()
    pattern = r"^SELECT pg_catalog\.setval\('((?:auth|storage)\.[A-Za-z_][A-Za-z0-9_]*)', ([0-9]+), (true|false)\);$"
    for match in re.finditer(pattern, data, re.M):
        identity, value, called = match.groups()
        if identity in seen or int(value) > 9223372036854775807:
            raise ValueError('sequence_checkpoint_invalid')
        seen.add(identity)
        output += f"SELECT jsonb_build_object('kind','sequenceState','identity','{identity}','components',jsonb_build_object('state',encode(sha256(convert_to(current_setting('drx.backup_fingerprint_salt')||jsonb_build_array({value}::bigint,{called})::text,'UTF8')),'hex')));\n"
    if not seen or len(seen) > 32 or len(re.findall(r'^SELECT pg_catalog\.setval\(', data, re.M)) != len(seen):
        raise ValueError('sequence_checkpoint_invalid')
    Path(target).write_text(output)


def main():
    operation, *arguments = sys.argv[1:]
    if operation == 'serve':
        serve()
    elif operation == 'psql':
        sys.exit(psql(arguments))
    elif operation == 'dump':
        dump(arguments)
    elif operation == 'sequence':
        sequence_checkpoint(*arguments)
    elif operation == 'stop':
        (state_dir() / 'stop').touch(mode=0o600)
    else:
        raise ValueError('operation_invalid')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError):
        print('Consistent source snapshot failed; private diagnostics are not published.', file=sys.stderr)
        sys.exit(1)
