"""Compare native catalogs using per-component digests; never publish definitions."""
import json, re, sys
from pathlib import Path

KINDS={'relations':'relation','functions':'function','types':'type','schemas':'schema','roles':'role'}
def component_sql(source):
    pattern=r"SELECT 'native_(relations|functions|types|schemas|roles)_count='\|\|count\(\*\) AS entry FROM entries\nUNION ALL SELECT 'native_\1_fingerprint='[^;]+;"
    def replace(match):
        kind=KINDS[match.group(1)]
        return "SELECT jsonb_build_object('kind','"+kind+"','identity',identity,'components',(SELECT jsonb_object_agg(key,encode(sha256(convert_to(value::text,'UTF8')),'hex')) FROM jsonb_each(entries.value))) FROM entries ORDER BY identity;"
    result,count=re.subn(pattern,replace,source)
    if count!=5:
        raise ValueError('Exact native catalog sections are required')
    return result

def capture(filename):
    path=Path(filename)
    if path.stat().st_size>1024*1024:
        raise ValueError('Native catalog exceeds bound')
    result={}
    for line in path.read_text().splitlines():
        row=json.loads(line)
        if set(row)!={'kind','identity','components'} or row['kind'] not in KINDS.values():
            raise ValueError('Invalid catalog entry')
        identity=row['identity']
        if not isinstance(identity,str) or len(identity)>1024 or not re.fullmatch(r'[A-Za-z0-9_ .(),"\[\]]+',identity):
            raise ValueError('Invalid native identity')
        fields=row['components']
        if not isinstance(fields,dict) or not 1<=len(fields)<=32 or any(not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*',name) or not isinstance(value,str) or not re.fullmatch(r'[a-f0-9]{64}',value) for name,value in fields.items()):
            raise ValueError('Only component hashes are accepted')
        key=(row['kind'],identity)
        if key in result:
            raise ValueError('Duplicate native identity')
        result[key]=fields
    return result

def compare(source,target):
    counts=lambda rows:{kind:sum(key[0]==kind for key in rows) for kind in KINDS.values()}
    before,after=counts(source),counts(target)
    if before['schema']!=2 or before['role']!=5 or min(before[k] for k in ['relation','function','type'])<1:
        raise ValueError('Incomplete source native catalogs')
    differences=[]
    for key in sorted(set(source)|set(target)):
        left,right=source.get(key),target.get(key)
        if left!=right:
            fields=['missingSource' if left is None else 'missingTarget'] if left is None or right is None else [name for name in sorted(set(left)|set(right)) if left.get(name)!=right.get(name)]
            differences.append({'kind':key[0],'identity':key[1],'fields':fields})
    return {'schemaVersion':'drx-native-catalog-parity-v1','status':'PASS' if not differences else 'MISMATCH','nativeCatalogParityVerified':not differences,'sourceCounts':before,'restoredCounts':after,'differenceCount':len(differences),'differences':differences[:40],'differencesTruncated':len(differences)>40,'rawDefinitionsPublished':False}

if __name__=='__main__':
    try:
        if sys.argv[1]=='build':
            Path(sys.argv[3]).write_text(component_sql(Path(sys.argv[2]).read_text()))
        elif sys.argv[1]=='compare':
            proof=compare(capture(sys.argv[2]),capture(sys.argv[3]));Path(sys.argv[4]).write_text(json.dumps(proof,indent=2)+'\n')
            print(json.dumps(proof))
            if proof['status']!='PASS':sys.exit(1)
        else:raise ValueError('Unknown operation')
    except Exception as error:
        allowed={'Exact native catalog sections are required','Native catalog exceeds bound','Invalid catalog entry','Invalid native identity','Only component hashes are accepted','Duplicate native identity','Incomplete source native catalogs','Unknown operation'}
        reason=str(error) if str(error) in allowed else 'Invalid catalog encoding'
        print('Native catalog verification failed: '+reason+'; raw definitions and private diagnostics were not printed.',file=sys.stderr)
        sys.exit(1)
