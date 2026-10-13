-- Read-only, complete multiset row parity. No identifiers or values are returned.
SELECT pg_catalog.format($sql$
SELECT jsonb_build_object('kind','rows','identity',%L,'components',jsonb_build_object(
'count',encode(sha256(convert_to(count(*)::text,'UTF8')),'hex'),
'fingerprint',encode(sha256(convert_to(current_setting('drx.backup_fingerprint_salt')||%L||coalesce(string_agg(digest,'' ORDER BY digest),''),'UTF8')),'hex')))
FROM (SELECT encode(sha256(convert_to(current_setting('drx.backup_fingerprint_salt')||to_jsonb(t)::text,'UTF8')),'hex') AS digest FROM %I.%I t) rows;
$sql$,n.nspname||'.'||c.relname,n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('auth','storage') AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname
\gexec
SELECT pg_catalog.format($sql$
SELECT jsonb_build_object('kind','sequenceState','identity',%L,'components',jsonb_build_object(
'state',encode(sha256(convert_to(current_setting('drx.backup_fingerprint_salt')||jsonb_build_array(last_value,is_called)::text,'UTF8')),'hex'))) FROM %I.%I;
$sql$,n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('auth','storage') AND c.relkind='S' ORDER BY n.nspname,c.relname
\gexec
