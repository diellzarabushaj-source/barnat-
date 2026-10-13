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
not by itself decrypt users' library records. With library recovery enabled,
the independently recovered prescription keys are verified as described below.

Only a passing backup is compressed with XZ and encrypted with AES-256-GCM, a fresh IV
and an authenticated version header. The archive contains the seven SQL dumps,
their hash list, the source manifest and its private fingerprint salt. The salt
is inside the encrypted archive so an isolated future restore can recompute the
manifest. Plaintext encryption keys and the archive key are never placed inside
that archive. Optional library recovery material contains only authenticated
ciphertext, as described below.

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

The automatic round trip verifies the archive key configured in GitHub. Keep
the separate protected recovery copy outside GitHub available for a disaster.
Historical library vaults remain necessary while their dependent backups exist. Physical
object bodies are included separately because [database backups alone do not
include Storage file bodies](https://supabase.com/docs/guides/platform/backups).

## Complete native Auth and Storage recovery

Scheduled runs and relevant main pushes require native recovery. Manual dispatch
defaults to `native_probe=true`; explicitly disabling it produces only the
earlier limited recovery scope and must not be reported as complete native recovery.

After the owner's approved hosted upgrade, the source image is pinned to
`17.11.0.003`, which is also the scheduled and manual restore default.
The disposable restore accepts
only `17.6.1.155` or `17.11.0.003`, and checks both the actual container tag and
the running PostgreSQL version. This choice never upgrades the hosted project.

A single private custom-format dump captures both entire managed schemas,
all their rows, managed migration histories and sequence states. Precisely the
three known application Auth triggers are deferred until their application
functions exist. Native triggers, owners and ACLs are preserved. Only the named
disposable loopback database may drop/recreate these schemas. The earlier partial
Auth compatibility additions remain available only for the explicitly limited mode.

Storage is pinned to `v1.81.3` and its migration ceiling to the captured source
level (`revoke-grants-to-unused-operations` or `unlock-object-versioning`). This
supports the source's versioned-object indexes while restart parity prevents any
schema drift. The PostgreSQL dump client is resolved from official ECR, GHCR or
Docker Hub mirrors at the same pinned version. The filtered application COPY file
is a disposable intermediate, regenerated from the retained original `data.sql`
with `scripts/native-recovery-app-data.py`; it is not stored twice in the archive.

The full native archive is retained encrypted alongside the generated native SQL
and trigger selection. Complete source/restore catalogs cover relations, column
definitions, constraints, indexes, triggers, policies, functions, enum/domain types,
schemas, default ACLs, role privilege attributes/configuration/membership and
sequence parameters. All native table rows and sequence states are compared with
private salted digests. No native user values, passwords, tokens or file paths
are published. Auth, Storage and REST services are restarted, and parity is
required again before any synthetic API mutations.

The isolated API proof creates two confirmed `example.invalid` accounts, checks
profile bootstrapping and rejection of a metadata-based admin claim, password
sign-in, refresh, identity, cross-owner profile access and logout refresh revocation.
It replays every captured private file through Storage and requires identical bytes
on readback and denial for anonymous/unrelated callers. The actual avatar handler
is exercised for upload, read, delete and rejection of another owner's path.
The actual personal-library code tests encrypted synthetic prescriptions, native
notes, CAS receipts/replay/conflicts, account binding and the direct-delete fence.
All probe traffic is hard-pinned to `http://127.0.0.1:54321`; source secrets are
replaced before application imports. There are no production API mutations or
emails sent to real users.

Successful aggregate evidence includes `nativeRecovery`, its actual PostgreSQL
version, restart proof and `api` result, plus `nativeStorageApiReplayVerified`.
The native row parity is taken before file replay and synthetic users change
local timestamps/version IDs. Existing source prescriptions are independently
decrypted from the retained archive; synthetic application tests use a separate
throwaway cipher key. These are distinct checks.

External OAuth provider credentials, hosted Auth signing configuration, deployment
secrets and dashboard settings must be supplied securely when rebuilding a hosted
project. This database/API drill does not export or test those control-plane secrets,
Google OAuth against real accounts, existing users' passwords, or immediate expiry
of already-issued access JWTs. It proves native database recovery and the isolated
service/application flows; a live cutover still needs a maintenance decision.

## Independent prescription cipher-key recovery

This repository encrypts `public.user_prescriptions.payload`. The other personal
library scopes are checked through complete stored-row parity. Recovery of this
ciphertext must not export `SESSION_SECRET`, which also signs login sessions.

The gated production/main build audit derives only the library AES keys using the
existing HKDF and seals them with a public RSA-3072 key. The RSA private key is
already wrapped with the separate archive AES-256-GCM key. The source credentials
are neither rotated nor printed. Only aggregate counts and a sealed packet enter
authenticated build logs. Preview and local builds skip the audit. Enable
`DRX_LIBRARY_KEY_RECOVERY_ENABLED=library_recovery_20261012` only for this production
audit, and remove that nonsecret flag after capturing the packet.

The main-only `DRx Private Library Key Recovery` workflow accepts the sealed
packet and the encrypted RSA private-key bytes; its inputs must never contain
plaintext credentials. It verifies the RSA public-key and wrapped-key hashes,
recovers the derived cipher keys in memory, and decrypts every current stored
prescription with its original owner/client context. Empty data, missing keys,
unknown key IDs, a wrong owner and changed ciphertext fail closed. It publishes
an immutable encrypted vault to `drx-key-recovery/ftuchtmolddhhsdcwnqe/` in the
existing private store, downloads it, repeats independent decryption, and
requires anonymous access to fail before marking it verified. The capacity
guard counts both archives and recovery vaults. Archive pruning never deletes
vaults; registration and backup writes share one concurrency group.

After that workflow passes, set repository variable
`DRX_BACKUP_LIBRARY_RECOVERY_ENABLED=1`. Subsequent backups must download the
private vault and decrypt all restored prescription envelopes without the
original source session secret. The encrypted archive also includes the encrypted
vault, public recovery config and restored encrypted envelopes. After the archive
is downloaded and decrypted, a separate in-memory reader repeats that envelope
recovery before retention succeeds. Aggregate evidence appears under
`prescriptionKeyRecovery`; this scoped proof does not claim full native Auth or
Storage API recovery. Do not enable the flag before the private vault is verified.

For an offline drill, supply the retained archive's archive key privately and run
`python3 scripts/verify-library-archive.py recovered.archive`. This reads bounded
members in memory, verifies every envelope, and prints only counts and ciphertext
hashes. It does not depend on the original Vercel signing secret. Preserve every
historical vault and archive-key recovery copy while dependent backups exist.

## Paid features

Paid-plan activation is explicitly deferred by the owner. Do not start billing,
upgrade compute, or enable paid password features as part of these recovery jobs.
