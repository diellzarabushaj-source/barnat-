"""Read bounded encrypted recovery material in memory; never extract patient files."""
import base64, json, subprocess, sys, tarfile
from pathlib import Path
try:
    with tarfile.open(sys.argv[1], 'r:*') as archive:
        names=['library-recovery-vault.enc','library-recovery-config.json','library-recovery-prescriptions.json']
        values={}
        for name in names:
            members=[member for member in archive.getmembers() if member.name==name]
            limit=32*1024*1024 if name.endswith('prescriptions.json') else 65536
            if len(members)!=1 or not members[0].isfile() or not 0<members[0].size<=limit:
                raise ValueError('Invalid recovery member')
            values[name]=archive.extractfile(members[0]).read()
        payload={'vault':base64.b64encode(values[names[0]]).decode(),
                 'config':json.loads(values[names[1]]),'rows':json.loads(values[names[2]])}
        result=subprocess.run(['node',str(Path(__file__).with_suffix('.js'))],
            input=json.dumps(payload),text=True,capture_output=True,timeout=30)
        if result.returncode!=0:
            raise ValueError('Independent archive envelope recovery failed')
        print(json.dumps(json.loads(result.stdout)))
except Exception:
    print('Archived prescription recovery failed; private contents were not printed.',file=sys.stderr)
    sys.exit(1)
