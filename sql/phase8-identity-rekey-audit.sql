-- Phase 8B: read-only auth/storage identity and re-key readiness audit.
-- No ownership mutation is permitted from this file.
--
-- Authentication/authorization identity is always auth.users.id / profiles.id.
-- profiles.legacy_user_id exists only to bridge historical encrypted/private rows.

begin read only;
set local statement_timeout = '8s';
set local lock_timeout = '2s';

-- 1) Profile identity map. A legacy storage UUID must be unique and distinct
-- from another profile's Auth UUID.
select
  p.id as auth_uid,
  p.legacy_user_id as legacy_storage_uid,
  p.role,
  p.status,
  (p.legacy_user_id is not null and p.legacy_user_id <> p.id) as bridged
from public.profiles p
order by p.created_at, p.id;

-- 2) Any profile whose legacy UUID collides with a different Auth UUID is unsafe.
-- Expected result: zero rows.
select
  owner.id as auth_uid,
  owner.legacy_user_id,
  other.id as colliding_auth_uid
from public.profiles owner
join public.profiles other
  on other.id = owner.legacy_user_id
 and other.id <> owner.id
where owner.legacy_user_id is not null;

-- 3) Every profile should have a backing auth.users row with the same UUID.
-- Expected result: zero rows.
select p.id as profile_without_auth_user
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null;

-- 4) Ownership distribution for bridged profiles. This deliberately reports
-- Auth-owned and legacy-owned rows separately; mixed ownership must be reviewed
-- before a re-key.
select
  p.id as auth_uid,
  p.legacy_user_id as legacy_storage_uid,
  (select count(*) from public.user_favorites f where f.user_id = p.id) as favorites_auth,
  (select count(*) from public.user_favorites f where f.user_id = p.legacy_user_id) as favorites_legacy,
  (select count(*) from public.user_prescriptions x where x.user_id = p.id) as prescriptions_auth,
  (select count(*) from public.user_prescriptions x where x.user_id = p.legacy_user_id) as prescriptions_legacy,
  (select count(*) from public.user_drugs d where d.user_id = p.id) as drugs_auth,
  (select count(*) from public.user_drugs d where d.user_id = p.legacy_user_id) as drugs_legacy,
  (select count(*) from public.user_notes n where n.user_id = p.id) as native_notes_auth
from public.profiles p
where p.legacy_user_id is not null
order by p.id;

-- 5) Native Auth-owned tables must never use the legacy UUID.
-- user_notes has an auth.users FK; this should remain zero.
select
  p.id as auth_uid,
  p.legacy_user_id,
  count(n.*) as legacy_owned_native_notes
from public.profiles p
join public.user_notes n on n.user_id = p.legacy_user_id
where p.legacy_user_id is not null
  and p.legacy_user_id <> p.id
group by p.id, p.legacy_user_id
having count(n.*) > 0;

-- 6) Private-library owners that cannot be explained by either profiles.id or
-- profiles.legacy_user_id. Expected result: zero rows for each table.
with known_storage_owners as (
  select id as storage_uid from public.profiles
  union
  select legacy_user_id from public.profiles where legacy_user_id is not null
),
owners as (
  select 'user_favorites'::text as table_name, user_id from public.user_favorites
  union
  select 'user_prescriptions', user_id from public.user_prescriptions
  union
  select 'user_drugs', user_id from public.user_drugs
)
select
  o.table_name,
  o.user_id,
  count(*) as rows_owned
from owners o
left join known_storage_owners k on k.storage_uid = o.user_id
where k.storage_uid is null
group by o.table_name, o.user_id
order by o.table_name, rows_owned desc;

-- 7) New/non-bridged accounts should store private rows under their Auth UUID.
-- This reports any rows attributed through medindex_users that would violate
-- that expectation and need investigation.
select
  p.id as auth_uid,
  p.legacy_user_id,
  m.id as medindex_storage_uid,
  m.email,
  m.enabled
from public.profiles p
join auth.users a on a.id = p.id
join public.medindex_users m on lower(m.email) = lower(a.email::text)
where p.legacy_user_id is null
  and m.id <> p.id
order by p.id;

-- 8) For bridged profiles, the compatibility user should be exactly the legacy
-- storage UUID, never a third identity.
select
  p.id as auth_uid,
  p.legacy_user_id,
  m.id as medindex_storage_uid,
  m.email
from public.profiles p
join auth.users a on a.id = p.id
join public.medindex_users m on lower(m.email) = lower(a.email::text)
where p.legacy_user_id is not null
  and m.id not in (p.id, p.legacy_user_id)
order by p.id;

-- 9) Collision check: a storage UUID must not map to multiple current profiles.
-- The unique partial index on legacy_user_id should make legacy collisions zero.
with identity_edges as (
  select id as auth_uid, id as storage_uid from public.profiles
  union all
  select id, legacy_user_id from public.profiles where legacy_user_id is not null
)
select storage_uid, count(distinct auth_uid) as auth_users
from identity_edges
group by storage_uid
having count(distinct auth_uid) > 1
order by storage_uid;

-- 10) Prescription re-key candidates. These rows cannot be moved by changing
-- user_id alone because the runtime encryption AAD includes the storage UUID.
select
  p.id as target_auth_uid,
  p.legacy_user_id as current_storage_uid,
  count(pr.*) as encrypted_prescriptions_requiring_runtime_rekey
from public.profiles p
join public.user_prescriptions pr on pr.user_id = p.legacy_user_id
where p.legacy_user_id is not null
  and p.legacy_user_id <> p.id
group by p.id, p.legacy_user_id
order by encrypted_prescriptions_requiring_runtime_rekey desc;

-- 11) Overall readiness summary.
select jsonb_build_object(
  'profiles', (select count(*) from public.profiles),
  'bridged_profiles', (select count(*) from public.profiles where legacy_user_id is not null and legacy_user_id <> id),
  'favorites_legacy_rows', (
    select count(*)
    from public.user_favorites f
    join public.profiles p on p.legacy_user_id = f.user_id
    where p.legacy_user_id is not null and p.legacy_user_id <> p.id
  ),
  'prescriptions_legacy_rows', (
    select count(*)
    from public.user_prescriptions x
    join public.profiles p on p.legacy_user_id = x.user_id
    where p.legacy_user_id is not null and p.legacy_user_id <> p.id
  ),
  'user_drugs_legacy_rows', (
    select count(*)
    from public.user_drugs d
    join public.profiles p on p.legacy_user_id = d.user_id
    where p.legacy_user_id is not null and p.legacy_user_id <> p.id
  ),
  'native_notes_auth_rows', (select count(*) from public.user_notes)
) as phase8_identity_readiness;

rollback;
