import crypto from 'node:crypto';
import { authenticated, consumeQuota, HttpError, sendError } from '../lib/api-security.js';
import { validatePayload } from '../lib/ai-payload.js';
import { getPlan } from '../lib/pro.js';
import { modePayload, validateReply } from '../lib/ai-modes.js';
import { reserveChef, finishChef } from '../lib/free-usage.js';

/**
 * Returns the list of hosted AI API keys from environment variables.
 * Prioritizes GROQ_API_KEY_1 through GROQ_API_KEY_5.
 * Falls back to GROQ_API_KEYS (comma-separated) or GROQ_API_KEY.
 */
export function getHostedKeys() {
  const envKeys = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ]
    .map(k => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean);

  if (envKeys.length > 0) {
    return envKeys;
  }

  if (process.env.GROQ_API_KEYS) {
    const split = process.env.GROQ_API_KEYS
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);
    if (split.length > 0) return split;
  }

  if (process.env.GROQ_API_KEY) {
    const single = process.env.GROQ_API_KEY.trim();
    if (single) return [single];
  }

  return [];
}

export function createGroqHandler({ getServices, quota, request = fetch, mode = 'generic', clock = Date.now } = {}) {
  return async function handler(req, res) {
    let reservation, owner;
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: { message: 'Method not allowed' } });
    }
    try {
      const { uid, db } = await authenticated(req, getServices);
      owner = { uid, db };
      if (req.method === 'GET') {
        await (quota || consumeQuota)(db, uid, 'ai');
        return res.status(200).json({ status: getHostedKeys().length ? 'configured' : 'unconfigured' });
      }
      const payload = modePayload(validatePayload(req.body), mode);
      const keys = [...new Set(getHostedKeys())].slice(0, 5);
      if (!keys.length) throw new HttpError(503, 'AI analysis is not configured yet. Please try again later.');
      if (mode === 'chef' && !quota) {
        reservation = await reserveChef(db, uid, clock(), { requestQuota: true });
      } else {
        const plan = mode === 'generic' ? { plan: 'free' } : await getPlan(db, uid, clock());
        await (quota || consumeQuota)(db, uid, plan.plan === 'pro' ? 'pro-ai' : 'ai');
        if (mode === 'chef') reservation = await reserveChef(db, uid, clock());
      }
      const initial = crypto.createHash('sha256').update(uid).digest().readUInt32BE(0) % keys.length;
      const signal = AbortSignal.timeout(25000);
      let attempt = 0, providerPayload = payload, usedFallback = false;
      while (attempt < keys.length) {
        const response = await request('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys[(initial + attempt) % keys.length]}` },
          body: JSON.stringify(providerPayload),
        });
        if (response.ok) {
          let data;
          try { data = validateReply(await response.json(), mode); }
          catch (error) {
            if (mode === 'chef' && !usedFallback && (error.status === 502 || error instanceof SyntaxError)) {
              providerPayload = { ...payload, model: 'openai/gpt-oss-120b', reasoning_effort: 'low' };
              usedFallback = true;continue;
            }
            throw error;
          }
          if (reservation) {
            data.usage = await finishChef(db, uid, reservation, true, clock());
            reservation = null;
          }
          return res.status(200).json(data);
        }
        // Avoid trying an unavailable model on every key before falling back.
        if (mode === 'chef' && !usedFallback && [400, 404, 422].includes(response.status)) {
          providerPayload = { ...payload, model: 'openai/gpt-oss-120b', reasoning_effort: 'low' };
          usedFallback = true;continue;
        }
        if (![401, 403, 429, 500, 502, 503, 504].includes(response.status)) break;
        attempt++;
      }
      throw new HttpError(502, 'AI analysis is temporarily unavailable. Please try again.');
    } catch (error) { return sendError(res, error); }
    finally {
      if (reservation) await finishChef(owner.db, owner.uid, reservation, false, clock()).catch(() => {});
    }
  };
}

export default createGroqHandler({ mode: 'meal' });
