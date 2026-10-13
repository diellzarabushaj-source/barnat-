"""Defer precisely the three application-owned Auth triggers until app restore."""
import re, sys
from pathlib import Path
EXPECTED={'cleanup_atomic_note_receipts_auth_owner','cleanup_atomic_prescription_receipts_auth_owner','medindex_auth_user_profile_created'}
def filtered(source):
    found=set(); result=[]
    for line in source.splitlines():
        match=re.fullmatch(r'[0-9]+; [0-9]+ [0-9]+ TRIGGER auth users ([a-z_]+) [a-z_]+',line)
        if match and match[1] in EXPECTED:
            if match[1] in found:raise ValueError('Duplicate deferred trigger')
            found.add(match[1]);result.append(';'+line)
        else:result.append(line)
    if found!=EXPECTED:raise ValueError('Exact application trigger allowlist required')
    return '\n'.join(result)+'\n'
if __name__=='__main__':
    try:Path(sys.argv[2]).write_text(filtered(Path(sys.argv[1]).read_text()))
    except Exception:
        print('Native restore trigger selection failed; private definitions were not printed.',file=sys.stderr);sys.exit(1)
