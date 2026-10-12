import hashlib, json, re, sys, tarfile

try:
    with tarfile.open(sys.argv[1], 'r:*') as archive:
        manifest=archive.extractfile('storage-body-manifest.json').read()
        records=json.loads(manifest)
        salt=archive.extractfile('private-fingerprint-salt').read()
        if not re.fullmatch(rb'[a-f0-9]{64}',salt) or not isinstance(records,list) or len(records)>256:
            raise ValueError('Invalid physical inventory')
        files=set()
        total=0
        for record in records:
            name=record['file']
            if not re.fullmatch(r'storage-objects/[0-9]{6}\.bin',name) or name in files:
                raise ValueError('Invalid object entry')
            files.add(name)
            member=archive.getmember(name)
            if not member.isfile() or member.size!=record['bytes'] or member.size>16*1024*1024:
                raise ValueError('Invalid object size')
            digest=hashlib.sha256()
            with archive.extractfile(member) as stream:
                for chunk in iter(lambda:stream.read(1024*1024),b''):
                    digest.update(chunk)
            if digest.hexdigest()!=record['sha256']:
                raise ValueError('Object bytes differ')
            total+=member.size
        if total>32*1024*1024:
            raise ValueError('Object total exceeds bound')
        actual={member.name for member in archive.getmembers() if member.name.startswith('storage-objects/') and member.isfile()}
        if actual!=files:
            raise ValueError('Physical inventory incomplete')
        print(json.dumps({'objectCount':len(records),'objectBytes':total,'completeInventoryRecovered':True,'manifestFingerprint':hashlib.sha256(salt+manifest).hexdigest()}))
except Exception:
    print('Archived Storage body verification failed; private contents were not printed.',file=sys.stderr)
    sys.exit(1)
