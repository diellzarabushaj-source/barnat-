'use strict';

const { supabaseRequest } = require('./supabase-data-api.js');
const TABLE = 'medlex_study_progress';
const FIELDS = 'revision,mutation_id,snapshot';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const MAX_CARDS = 2000;
const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isKey = value => typeof value === 'string' && KEY.test(value);
const isRating = value => value === 'known' || value === 'review';

function normalizeSnapshot(value) {
  if (!isRecord(value) || !isRecord(value.ratings)) return null;
  const ratings = Object.entries(value.ratings);
  if (ratings.length > MAX_CARDS || !ratings.every(([key, rating]) => isKey(key) && isRating(rating))) return null;
  const result = { ratings:Object.fromEntries(ratings), session:null };
  if (value.session === null) return result;
  if (!isRecord(value.session)) return null;
  const { chapter, topic, deck, answers } = value.session;
  if (typeof chapter !== 'string' || !/^(?:all|0[1-9]|1[0-8])$/.test(chapter) ||
      !isKey(topic) || !Array.isArray(deck) || deck.length === 0 || deck.length > MAX_CARDS ||
      !deck.every(isKey) || new Set(deck).size !== deck.length ||
      !Array.isArray(answers) || answers.length > deck.length || !answers.every(isRating)) return null;
  result.session = { chapter, topic, deck, answers };
  return result;
}

async function readBody(req) {
  const limit = 64 * 1024;
  const size = Number(req.headers?.['content-length']);
  if (size > limit) return null;
  let raw = typeof req.body === 'string' ? req.body : req.body ? JSON.stringify(req.body) : '';
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > limit) return null;
    }
  }
  if (Buffer.byteLength(raw) > limit) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function responseState(row) {
  return { revision:row?.revision || 0, mutation:row?.mutation_id || null, snapshot:row?.snapshot || {ratings:{}, session:null} };
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie, Origin');
  if (!['GET','PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ok:false, code:'METHOD_NOT_ALLOWED'});
  }
  const auth = await import('./auth.mjs');
  const session = auth.sessionData(auth.sessionFromRequest(req));
  if (!auth.isSupabaseSession(session)) return res.status(401).json({ok:false, code:'AUTH_REQUIRED'});
  const userId = session.authUid;
  // Bind an already open tab to the account it loaded, even if the browser's
  // session cookie is replaced by another account between requests.
  if (!UUID.test(userId) || req.headers?.['x-medlex-account'] !== userId) {
    return res.status(403).json({ok:false, code:'ACCOUNT_CHANGED'});
  }

  const user = `user_id=eq.${userId}`;
  const request = (path, options) => supabaseRequest(path, {privileged:true, timeoutMs:5500, ...options});
  const get = async () => (await request(`${TABLE}?select=${FIELDS}&${user}&limit=1`)).data?.[0];
  try {
    if (req.method === 'GET') return res.status(200).json({ok:true, ...responseState(await get())});

    const body = await readBody(req);
    const revision = body?.revision;
    const mutation = body?.mutation;
    const snapshot = normalizeSnapshot(body?.snapshot);
    if (!snapshot || !Number.isInteger(revision) || revision < 0 || revision >= 2147483647 ||
        typeof mutation !== 'string' || !UUID.test(mutation)) {
      return res.status(400).json({ok:false, code:'PROGRESS_INVALID'});
    }

    const values = { revision:revision + 1, mutation_id:mutation, snapshot, updated_at:new Date().toISOString() };
    const {data} = revision === 0
      ? await request(`${TABLE}?on_conflict=user_id&select=${FIELDS}`, {
        method:'POST', body:{...values, user_id:userId}, prefer:'resolution=ignore-duplicates,return=representation',
      })
      : await request(`${TABLE}?select=${FIELDS}&${user}&revision=eq.${revision}`, {
        method:'PATCH', body:values, prefer:'return=representation',
      });
    if (data?.[0]) return res.status(200).json({ok:true, ...responseState(data[0])});

    const current = await get();
    // Replaying a successful request after the response was lost is safe.
    if (current?.mutation_id === mutation) return res.status(200).json({ok:true, ...responseState(current)});
    return res.status(409).json({ok:false, code:'PROGRESS_CONFLICT', ...responseState(current)});
  } catch (error) {
    console.error('MedLex study progress:', error?.code || error?.status || error?.name);
    return res.status(503).json({ok:false, code:'PROGRESS_UNAVAILABLE'});
  }
}

module.exports = { handle };
