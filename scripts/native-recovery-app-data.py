"""Keep application COPY blocks; native rows come from the complete native dump."""
import re,sys
from pathlib import Path
IDENT=r'(?:[a-z_][a-z0-9_]*|"[a-z_][a-z0-9_]*")'
HEADER=re.compile(r'^COPY ('+IDENT+r')\.('+IDENT+r') \([^\r\n]+\) FROM stdin;\s*$')
SEQUENCE=re.compile(r"^SELECT pg_catalog\.setval\('("+IDENT+r")\.("+IDENT+r")', [0-9]+, (?:true|false)\);\s*$")
def filter_data(source,target):
    inside=False;skip=False;removed=0;retained=0
    with open(source,encoding='utf-8',newline='') as incoming,open(target,'x',encoding='utf-8',newline='') as outgoing:
        for line in incoming:
            if inside:
                if not skip:outgoing.write(line)
                if line.rstrip('\r\n')=='\\.':inside=False;skip=False
                continue
            match=HEADER.fullmatch(line)
            if match:
                inside=True;skip=match[1].strip('"') in {'auth','storage'}
                if skip:removed+=1
                else:retained+=1;outgoing.write(line)
                continue
            sequence=SEQUENCE.fullmatch(line)
            if sequence and sequence[1].strip('"') in {'auth','storage'}:continue
            if re.match(r'^COPY\s',line) or re.match(r'^(?:INSERT INTO|ALTER TABLE|SELECT pg_catalog\.setval\().*(?:"?auth"?|"?storage"?)\.',line):
                raise ValueError('Unexpected native data statement')
            outgoing.write(line)
    if inside or removed<1 or retained<1:raise ValueError('Complete COPY block boundaries required')
    return {'nativeCopyBlocksDeferred':removed,'applicationCopyBlocksRetained':retained}
if __name__=='__main__':
    try:
        import json
        print(json.dumps(filter_data(sys.argv[1],sys.argv[2])))
    except Exception:
        print('Application data selection failed; raw rows were not printed.',file=sys.stderr);sys.exit(1)
