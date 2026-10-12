# DRx private backup and recovery

The dedicated private Vercel Blob store is `store_5eil8JGWW3uU4KQo`,
`drx-backups-20261011`, in `lhr1`. It is not connected to the website runtime.
The website's existing protocol store and library encryption keys are unchanged.
The backup job needs only this store's read/write credential.

## Configuration

Store these through protected GitHub configuration for `barnat-`, never in source,
reports, browser bundles or public artifacts:

- Secret `DRX_BACKUP_BLOB_TOKEN`: the dedicated backup store credential.
- Secret `DRX_BACKUP_ARCHIVE_KEY`: a newly generated random 32-byte key encoded
  as exactly 64 lowercase hexadecimal characters. This is separate from the
  existing library/session keys.
- Variable `DRX_BACKUP_ARCHIVE_KEY_ID`: a unique archive key identifier.
- Variable `DRX_BACKUP_RETENTION_ENABLED=1`: enable only after configuration is
  complete. Missing configuration then fails the job rather than skipping retention.

Keep a recovery copy of the archive key in restricted storage outside both the
Blob store and the repository. Never delete or replace it while its archives
remain retained. The key ID is public metadata, not the key itself.

## Verified retention

The canonical backup/restore workflow runs at 03:00 UTC daily and after relevant
main changes. It first restores into disposable Supabase and requires exact
source/target manifest equality. Complete stored rows in four personal-library
tables, both write-receipt tables and both rollout controls are included.
Their SHA-256 fingerprints use a fresh private salt, absent from public evidence.
This verifies stored bytes and metadata, including encrypted payloads; it does
not decrypt users' library records.

Only a passing backup is compressed with XZ and encrypted with AES-256-GCM, a fresh IV
and an authenticated version header. The archive contains the seven SQL dumps,
their hash list, the source manifest and its private fingerprint salt. The salt
is inside the encrypted archive so an isolated future restore can recompute the
manifest. Encryption keys are never placed inside that archive.

The job uploads privately, requires anonymous access to fail, downloads without
cache, compares encrypted hashes, decrypts and compares the recovered archive
with the original. Only then does it write a private verification marker and
prune older verified archives. A failed or unmarked upload cannot displace a
verified copy. Evidence records unmarked copies that may need investigation.
No unrelated files are removed.

The policy keeps the latest 14 verified copies, rather than promising 14 calendar
days when multiple runs occur. Encrypted files are bounded to 64 MiB plus their
36-byte envelope; the dedicated store has a conservative 384 MiB capacity guard.
At capacity, the job stops and preserves existing copies instead of deleting a
good backup to make room for an unverified one. Shared account quota still
applies. Hobby storage is free within its included limits and becomes unavailable
at the limit; no plan upgrade is part of this implementation.
See [Vercel's current pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
and [private access behavior](https://vercel.com/docs/vercel-blob/private-storage).

## Recovery

1. Select a verified private archive and its key ID from the successful workflow
   evidence. Retrieve it with the backup-store credential into a restricted
   directory. Verify its encrypted SHA-256 against that evidence.
2. In an isolated environment, supply the corresponding recovery key through
   `DRX_BACKUP_ARCHIVE_KEY`, without printing it. Run
   `node scripts/backup-archive-crypto.js decrypt archive.enc recovered.archive`.
   Authentication failure publishes no recovered file. Existing outputs are
   never overwritten.
3. Inspect and extract the authenticated archive only into a new disposable
   directory. Verify every SQL file against `sha256.txt` before execution.
   GNU tar detects the compression format when reading a file (`tar -tf` / `tar -xf`);
   the initial pilot archive uses gzip, while subsequent archives use XZ.
4. Use the canonical workflow's source-version compatibility and isolated
   restore dispatcher. Preserve custom Auth triggers, migration history, RLS,
   write fences and default privileges. Recompute the manifests with the
   recovered private fingerprint salt and require exact equality.
5. Verify application reads and writes with synthetic accounts before planning
   any live cutover. Never run these restore commands against production.

The workflow also captures the complete Storage object inventory and reads every
object body through the existing privileged source API key. Individual objects
are bounded to 16 MiB, the complete body set to 32 MiB and the object count to 256.
Missing objects, changed metadata or byte lengths/checksums fail the backup;
an unchanged version inventory is required before and after capture. Paths and
object metadata remain inside the encrypted archive. Only counts and a salted
manifest fingerprint enter public evidence. After downloading and decrypting
the retained archive, every archived object body is verified against its hash
and length. No source bucket, permission or object is changed by this capture.

The automatic round trip verifies the archive key configured in GitHub. A
separate recovery-copy drill is required to prove recovery outside GitHub.
Users' library keys and historical keys require their own protected recovery
copies and a real library-decryption drill. Full native Auth/Storage catalog
parity and a replay through a fresh Storage API remain unverified. Physical
object bodies are included separately because [database backups alone do not
include Storage file bodies](https://supabase.com/docs/guides/platform/backups).
