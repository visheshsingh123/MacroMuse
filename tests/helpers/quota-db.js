import { createMealsHandler } from '../../api/meals.js';
import { createUsageHandler } from '../../api/usage.js';
// Serial transactions commit only after the callback succeeds, including query reads.
export function database() {
  const data = new Map();let queue = Promise.resolve();
  function collection(path, filters = [], maximum = Infinity) {
    return { path, filters, maximum, query: true,
      doc(id) { return { path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }; },
      where(field, operator, value) { return collection(path, [...filters, { field, operator, value }], maximum); },
      limit(count) { return collection(path, filters, count); },
    };
  }
  function snapshot(ref) {
    if (!ref.query) return { exists: data.has(ref.path), data: () => structuredClone(data.get(ref.path)) };
    const entries = [...data].filter(([key, value]) => key.startsWith(`${ref.path}/`) && key.split('/').length === ref.path.split('/').length + 1 &&
      ref.filters.every(filter => filter.operator === '>=' ? value[filter.field] >= filter.value : value[filter.field] < filter.value)).slice(0, ref.maximum);
    return { size: entries.length, docs: entries.map(([path, value]) => ({ id: path.split('/').at(-1), data: () => structuredClone(value) })) };
  }
  return { data, collection, runTransaction(fn) {
    const result = queue.then(async () => {
      const writes = [];
      const output = await fn({ get: async ref => snapshot(ref), set: (ref, value) => writes.push([ref.path, structuredClone(value)]) });
      writes.forEach(([path, value]) => data.set(path, value));return output;
    });
    queue = result.catch(() => {});return result;
  } };
}
export function fixture() {
  const db = database();let now = Date.parse('2026-10-20T20:00:00Z');
  const services = () => ({ db, auth: { async verifyIdToken(token) {
    if (token === 'invalid') throw Error('invalid');
    return { uid: token, firebase: { sign_in_provider: token === 'anonymous' ? 'anonymous' : 'password' } };
  } } });
  const options = { getServices: services, clock: () => now, quota: async () => {} };
  const meals = createMealsHandler(options), usage = createUsageHandler(options);
  async function call(handler, body, uid = 'alice', method = body ? 'POST' : 'GET') {
    const res = { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code;return this; }, json(body) { this.body = body;return this; } };
    await handler({ method, body, headers: uid ? { authorization: `Bearer ${uid}` } : {} }, res);return res;
  }
  return { db, options, meals, usage, call, now: () => now, advance: ms => { now += ms; } };
}
