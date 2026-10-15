import crypto from 'crypto';

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

/**
 * Extracts a username or user identifier from incoming request headers, body, or query.
 */
export function extractUsername(req) {
  // Check custom headers
  const headerUser =
    req.headers?.['x-username'] ||
    req.headers?.['x-user-id'] ||
    req.headers?.['x-user'];
  if (typeof headerUser === 'string' && headerUser.trim()) {
    return headerUser.trim();
  }

  // Check request body
  if (req.body && typeof req.body === 'object') {
    if (typeof req.body.username === 'string' && req.body.username.trim()) {
      return req.body.username.trim();
    }
    if (typeof req.body.userId === 'string' && req.body.userId.trim()) {
      return req.body.userId.trim();
    }
    if (typeof req.body.user === 'string' && req.body.user.trim()) {
      return req.body.user.trim();
    }
  }

  // Check query parameters
  if (req.query && typeof req.query === 'object') {
    const queryUser = req.query.username || req.query.userId || req.query.user;
    if (typeof queryUser === 'string' && queryUser.trim()) {
      return queryUser.trim();
    }
  }

  return null;
}

/**
 * Generates a deterministic positive integer from a username using SHA-256 hash.
 */
export function hashUsernameToNumber(username) {
  const hash = crypto.createHash('sha256').update(String(username)).digest();
  return hash.readUInt32BE(0);
}

/**
 * Generates a cryptographically strong random positive integer.
 */
export function generateRandomNumber() {
  if (typeof crypto.randomInt === 'function') {
    return crypto.randomInt(0, 1000000000);
  }
  return Math.floor(Math.random() * 1000000000);
}

/**
 * Checks if a specific Groq API key is active by calling the models endpoint.
 */
export async function isKeyActive(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return false;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Main API route handler for Groq completions.
 * Selects an API key via (number % 5) based on username hash or random number,
 * and includes a fallback mechanism to switch to another active key if one fails.
 */
export default async function handler(req, res) {
  // Support GET for key health check
  if (req.method === 'GET') {
    const keys = getHostedKeys();
    if (keys.length === 0) {
      return res.status(500).json({
        status: 'unconfigured',
        message: 'No Groq API keys configured. Set GROQ_API_KEY_1 through GROQ_API_KEY_5.',
      });
    }

    const keyStatuses = await Promise.all(
      keys.map(async (key, idx) => ({
        index: idx,
        active: await isKeyActive(key),
      }))
    );

    const activeCount = keyStatuses.filter(k => k.active).length;
    return res.status(200).json({
      status: activeCount > 0 ? 'healthy' : 'unhealthy',
      totalKeys: keys.length,
      activeKeysCount: activeCount,
      keys: keyStatuses,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const keys = getHostedKeys();
  if (keys.length === 0) {
    return res.status(500).json({
      error: {
        message: 'No Groq API keys configured. Please configure GROQ_API_KEY_1 through GROQ_API_KEY_5 in environment variables.',
      },
    });
  }

  // 1. Generate random number or create username hash-based number
  const username = extractUsername(req);
  let number;
  let selectionMethod;

  if (username) {
    number = hashUsernameToNumber(username);
    selectionMethod = 'username-hash';
  } else {
    number = generateRandomNumber();
    selectionMethod = 'random';
  }

  // 2. Apply modulo 5 (number % 5) -> resulting index (0 to 4)
  const moduloIndex = Math.abs(number) % 5;

  // Map to available keys (handles cases where fewer than 5 keys are hosted)
  const initialIndex = moduloIndex % keys.length;

  // Prepare sanitized payload for Groq (strip non-standard root fields if present)
  let groqPayload = req.body;
  if (typeof req.body === 'string') {
    try {
      groqPayload = JSON.parse(req.body);
    } catch {
      groqPayload = req.body;
    }
  }

  if (groqPayload && typeof groqPayload === 'object' && !Array.isArray(groqPayload)) {
    const { username: _u, userId: _uid, ...cleanPayload } = groqPayload;
    groqPayload = cleanPayload;
  }

  // 3. Process the request with the selected key and fallback if it fails
  const totalKeys = keys.length;
  let lastError = null;
  let lastResponseData = null;
  let lastStatus = 500;

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const currentIndex = (initialIndex + attempt) % totalKeys;
    const apiKey = keys[currentIndex];

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(groqPayload),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        // Successful response - API key is active
        res.setHeader('x-selected-key-index', String(moduloIndex));
        res.setHeader('x-active-key-index', String(currentIndex));
        res.setHeader('x-selection-method', selectionMethod);
        if (attempt > 0) {
          res.setHeader('x-fallback-attempts', String(attempt));
        }
        return res.status(response.status).json(data);
      }

      // If the response failed (e.g. 401 Unauthorized, 403 Forbidden, 429 Rate Limited, 5xx Server Error)
      console.warn(
        `[Groq Proxy] API key at index ${currentIndex} (attempt ${attempt + 1}/${totalKeys}) failed with status ${response.status}:`,
        data?.error?.message || response.statusText
      );

      lastStatus = response.status;
      lastResponseData = data;

      // Switch to the next key in rotation on the next iteration
      continue;
    } catch (err) {
      console.warn(
        `[Groq Proxy] Network/connection error with key at index ${currentIndex} (attempt ${attempt + 1}/${totalKeys}):`,
        err.message
      );
      lastError = err;
      // Switch to the next key on failure
      continue;
    }
  }

  // All keys were attempted and failed
  if (lastResponseData) {
    return res.status(lastStatus).json(lastResponseData);
  }

  return res.status(500).json({
    error: {
      message: lastError ? `All API keys failed: ${lastError.message}` : 'All hosted AI API keys are currently inactive or failed.',
    },
  });
}
