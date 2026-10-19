import { HttpError } from './api-security.js';

export const models = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b',
  'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct']);

export function validatePayload(raw) {
  const fail = () => { throw new HttpError(400, 'Invalid AI request.'); };
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw) > 2_500_000) throw new HttpError(413, 'Please use a smaller meal photo.');
    try { raw = JSON.parse(raw); } catch { fail(); }
  }
  if (!raw || Array.isArray(raw) || !models.has(raw.model)) fail();
  if (Buffer.byteLength(JSON.stringify(raw)) > 2_500_000) throw new HttpError(413, 'Please use a smaller meal photo.');
  if (!Array.isArray(raw.messages) || !raw.messages.length || raw.messages.length > 25) fail();
  let textLength = 0, imageCount = 0;
  const text = value => {
    if (typeof value !== 'string' || !value.trim()) fail();
    textLength += value.length;
    if (textLength > 24000) throw new HttpError(400, 'The conversation is too long. Please start a new chat.');
    return value;
  };
  const messages = raw.messages.map(message => {
    if (!message || !['system', 'user', 'assistant'].includes(message.role)) fail();
    let content;
    if (typeof message.content === 'string') content = text(message.content);
    else {
      if (message.role !== 'user' || !Array.isArray(message.content) || !message.content.length || message.content.length > 3) fail();
      content = message.content.map(part => {
        if (part?.type === 'text') return { type: 'text', text: text(part.text) };
        if (part?.type !== 'image_url' || ++imageCount > 1) fail();
        const url = part.image_url?.url;
        if (typeof url !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) fail();
        const encoded = url.slice(url.indexOf(',') + 1);
        const bytes = Buffer.from(encoded, 'base64');
        const valid = url.startsWith('data:image/jpeg;') ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff :
          url.startsWith('data:image/png;') ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
            bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!valid) fail();
        return { type: 'image_url', image_url: { url } };
      });
    }
    return { role: message.role, content };
  });
  if (messages.at(-1).role !== 'user') fail();
  const tokens = raw.max_tokens ?? 600;
  if (!Number.isInteger(tokens) || tokens < 1 || tokens > 1024) fail();
  const payload = { model: raw.model, messages, max_tokens: tokens };
  if (raw.reasoning_effort === 'none' && raw.model.includes('qwen')) payload.reasoning_effort = 'none';
  if (raw.reasoning_effort === 'low' && raw.model.startsWith('openai/gpt-oss-')) payload.reasoning_effort = 'low';
  return payload;
}
