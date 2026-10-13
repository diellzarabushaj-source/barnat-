-- Read-only native catalog inventory. Run identically against source and an isolated clone.
SET search_path = '';
WITH relations AS (
 SELECT c.*,n.nspname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('auth','storage') AND c.relkind IN ('r','p','v','m','S')
), entries AS (
 SELECT nspname||'.'||relname AS identity, jsonb_build_object(
  'kind',relkind,'owner',pg_catalog.pg_get_userbyid(relowner),'rls',relrowsecurity,'forceRls',relforcerowsecurity,
  'acl',(SELECT jsonb_agg(jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) FROM pg_catalog.aclexplode(coalesce(relacl,pg_catalog.acldefault(CASE WHEN relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,relowner))) a),
  'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid),CASE WHEN a.attcollation=0 THEN NULL ELSE a.attcollation::pg_catalog.regcollation::text END) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=relations.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_array(k.conname,k.convalidated,pg_catalog.pg_get_constraintdef(k.oid,false)) ORDER BY k.conname) FROM pg_catalog.pg_constraint k WHERE k.conrelid=relations.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_array(ic.relname,i.indisvalid,i.indisready,pg_catalog.pg_get_indexdef(i.indexrelid,0,false)) ORDER BY ic.relname) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=relations.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid,false)) ORDER BY t.tgname) FROM pg_catalog.pg_trigger t WHERE t.tgrelid=relations.oid AND NOT t.tgisinternal),
  'policies',(SELECT jsonb_agg(jsonb_build_array(q.polname,q.polpermissive,q.polcmd,(SELECT jsonb_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END ORDER BY CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END) FROM unnest(q.polroles) role_oid),pg_catalog.pg_get_expr(q.polqual,q.polrelid),pg_catalog.pg_get_expr(q.polwithcheck,q.polrelid)) ORDER BY q.polname) FROM pg_catalog.pg_policy q WHERE q.polrelid=relations.oid),
  'sequence',(SELECT jsonb_build_array(seqtypid::pg_catalog.regtype::text,seqstart,seqincrement,seqmax,seqmin,seqcache,seqcycle) FROM pg_catalog.pg_sequence WHERE seqrelid=relations.oid),
  'view',CASE WHEN relkind IN ('v','m') THEN pg_catalog.pg_get_viewdef(oid,false) ELSE NULL END
 ) AS value FROM relations
)
SELECT 'native_relations_count='||count(*) AS entry FROM entries
UNION ALL SELECT 'native_relations_fingerprint='||encode(sha256(convert_to(coalesce(string_agg(identity||value::text,'' ORDER BY identity),''),'UTF8')),'hex') FROM entries;
WITH functions AS (
 SELECT p.*,n.nspname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('auth','storage') AND p.prokind IN ('f','p')
), entries AS (
 SELECT nspname||'.'||proname||'('||pg_catalog.pg_get_function_identity_arguments(oid)||')' AS identity,
 jsonb_build_object('definition',pg_catalog.pg_get_functiondef(oid),'owner',pg_catalog.pg_get_userbyid(proowner),'config',proconfig,
 'acl',(SELECT jsonb_agg(jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) FROM pg_catalog.aclexplode(coalesce(proacl,pg_catalog.acldefault('f',proowner))) a)) AS value FROM functions
)
SELECT 'native_functions_count='||count(*) AS entry FROM entries
UNION ALL SELECT 'native_functions_fingerprint='||encode(sha256(convert_to(coalesce(string_agg(identity||value::text,'' ORDER BY identity),''),'UTF8')),'hex') FROM entries;
WITH entries AS (
 SELECT n.nspname||'.'||t.typname AS identity,jsonb_build_object('kind',t.typtype,'owner',pg_catalog.pg_get_userbyid(t.typowner),
 'base',pg_catalog.format_type(t.typbasetype,t.typtypmod),'notNull',t.typnotnull,'default',t.typdefault,
 'acl',(SELECT jsonb_agg(jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) FROM pg_catalog.aclexplode(coalesce(t.typacl,pg_catalog.acldefault('T',t.typowner))) a),
 'enum',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid),
 'constraints',(SELECT jsonb_agg(pg_catalog.pg_get_constraintdef(k.oid,false) ORDER BY k.conname) FROM pg_catalog.pg_constraint k WHERE k.contypid=t.oid)) AS value
 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('auth','storage') AND t.typtype IN ('e','d')
)
SELECT 'native_types_count='||count(*) AS entry FROM entries
UNION ALL SELECT 'native_types_fingerprint='||encode(sha256(convert_to(coalesce(string_agg(identity||value::text,'' ORDER BY identity),''),'UTF8')),'hex') FROM entries;
WITH entries AS (
 SELECT n.nspname AS identity,jsonb_build_object('owner',pg_catalog.pg_get_userbyid(n.nspowner),
 'acl',(SELECT jsonb_agg(jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a)) AS value
 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('auth','storage')
)
SELECT 'native_schemas_count='||count(*) AS entry FROM entries
UNION ALL SELECT 'native_schemas_fingerprint='||encode(sha256(convert_to(coalesce(string_agg(identity||value::text,'' ORDER BY identity),''),'UTF8')),'hex') FROM entries;
WITH entries AS (
 SELECT rolname AS identity,jsonb_build_object('superuser',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls,
 'config',rolconfig,'connectionLimit',rolconnlimit,
 'memberOf',(SELECT jsonb_agg(jsonb_build_array(pg_catalog.pg_get_userbyid(m.roleid),pg_catalog.pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option) ORDER BY pg_catalog.pg_get_userbyid(m.roleid),pg_catalog.pg_get_userbyid(m.grantor)) FROM pg_catalog.pg_auth_members m WHERE m.member=pg_roles.oid)) AS value
 FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_auth_admin','supabase_storage_admin')
)
SELECT 'native_roles_count='||count(*) AS entry FROM entries
UNION ALL SELECT 'native_roles_fingerprint='||encode(sha256(convert_to(coalesce(string_agg(identity||value::text,'' ORDER BY identity),''),'UTF8')),'hex') FROM entries;
WITH entries AS (
 SELECT pg_catalog.pg_get_userbyid(d.defaclrole)||' '||n.nspname||' '||d.defaclobjtype::text AS identity,
 jsonb_build_object('acl',(SELECT jsonb_agg(jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 ORDER BY pg_catalog.pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable)
 FROM pg_catalog.aclexplode(d.defaclacl) a)) AS value
 FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN ('auth','storage')
)
SELECT jsonb_build_object('kind','defaultAcl','identity',identity,'components',jsonb_build_object('acl',encode(sha256(convert_to(value::text,'UTF8')),'hex'))) FROM entries ORDER BY identity;
