'use strict';

const names = [
  'MEDINDEX_SUPABASE_URL',
  'MEDINDEX_SUPABASE_PUBLISHABLE_KEY',
  'MEDINDEX_SUPABASE_SECRET_KEY',
  'SUPABASE_SECRET_KEY',
  'MEDINDEX_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MEDINDEX_MEDICAL_READ_PROVIDER',
  'MEDINDEX_WRITE_PROVIDER',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'MEDINDEX_DRIVE_SYNC_SECRET',
  'MEDINDEX_NEON_DATA_API_TOKEN',
  'NEON_DATA_API_TOKEN',
  'VERCEL_OIDC_TOKEN',
];

const configured = Object.fromEntries(names.map(name => [name, Boolean(String(process.env[name] || '').trim())]));
const secretConfigured = ['MEDINDEX_SUPABASE_SECRET_KEY','SUPABASE_SECRET_KEY','MEDINDEX_SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_ROLE_KEY']
  .some(name => configured[name]);
const requestedWriteProvider = String(process.env.MEDINDEX_WRITE_PROVIDER || 'auto').trim().toLowerCase();
const effectiveWriteProvider = requestedWriteProvider === 'neon'
  ? 'neon'
  : requestedWriteProvider === 'supabase'
    ? 'supabase'
    : secretConfigured ? 'supabase' : 'neon';

console.log('[phase3-env-check]', JSON.stringify({
  vercelEnv:process.env.VERCEL_ENV || null,
  gitRef:process.env.VERCEL_GIT_COMMIT_REF || null,
  configured,
  effectiveWriteProvider,
}));
