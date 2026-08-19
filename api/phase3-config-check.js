'use strict';

const DataApi = require('../lib/neon-data-api.js');

function present(name) {
  return Boolean(String(process.env[name] || '').trim());
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'method_not_allowed' });

  const secretConfigured = [
    'MEDINDEX_SUPABASE_SECRET_KEY',
    'SUPABASE_SECRET_KEY',
    'MEDINDEX_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].some(present);

  let supabaseServerProbe = { attempted:false, ok:false, status:null };
  if (secretConfigured) {
    supabaseServerProbe.attempted = true;
    try {
      const result = await DataApi.supabaseRequest('medindex_users?select=id&limit=1', { timeoutMs:5000 }, { privileged:true });
      supabaseServerProbe = {
        attempted:true,
        ok:true,
        status:result?.response?.status || 200,
        rows:Array.isArray(result?.data) ? result.data.length : null,
      };
    } catch (error) {
      supabaseServerProbe = {
        attempted:true,
        ok:false,
        status:Number(error?.status || 0) || null,
        errorCode:error?.payload?.code || null,
      };
    }
  }

  return res.status(200).json({
    ok:true,
    environment:process.env.VERCEL_ENV || null,
    branch:process.env.VERCEL_GIT_COMMIT_REF || null,
    configured:{
      MEDINDEX_SUPABASE_URL:present('MEDINDEX_SUPABASE_URL'),
      MEDINDEX_SUPABASE_PUBLISHABLE_KEY:present('MEDINDEX_SUPABASE_PUBLISHABLE_KEY'),
      MEDINDEX_SUPABASE_SECRET_KEY:present('MEDINDEX_SUPABASE_SECRET_KEY'),
      SUPABASE_SECRET_KEY:present('SUPABASE_SECRET_KEY'),
      MEDINDEX_SUPABASE_SERVICE_ROLE_KEY:present('MEDINDEX_SUPABASE_SERVICE_ROLE_KEY'),
      SUPABASE_SERVICE_ROLE_KEY:present('SUPABASE_SERVICE_ROLE_KEY'),
      MEDINDEX_MEDICAL_READ_PROVIDER:present('MEDINDEX_MEDICAL_READ_PROVIDER'),
      MEDINDEX_WRITE_PROVIDER:present('MEDINDEX_WRITE_PROVIDER'),
      SESSION_SECRET:present('SESSION_SECRET'),
      GOOGLE_CLIENT_ID:present('GOOGLE_CLIENT_ID'),
      MEDINDEX_DRIVE_SYNC_SECRET:present('MEDINDEX_DRIVE_SYNC_SECRET'),
      MEDINDEX_NEON_DATA_API_TOKEN:present('MEDINDEX_NEON_DATA_API_TOKEN'),
      NEON_DATA_API_TOKEN:present('NEON_DATA_API_TOKEN'),
      VERCEL_OIDC_TOKEN:present('VERCEL_OIDC_TOKEN'),
    },
    providers:{
      medicalReads:DataApi.readProvider(),
      writes:DataApi.writeProvider(),
    },
    supabaseServerProbe,
  });
};
