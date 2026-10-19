import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hashes = new Set();
for (const file of readdirSync(`${root}public`, { recursive: true }).filter(file => file.endsWith('.html')).sort()) {
  const html = readFileSync(`${root}public/${file}`, 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  }
}
const csp = [
  "default-src 'self'",
  `script-src 'self' https://www.gstatic.com/firebasejs/ https://apis.google.com https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js ${[...hashes].sort().join(' ')}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "connect-src 'self' https://*.googleapis.com https://www.gstatic.com https://nutriglance.firebaseapp.com https://docs.google.com",
  "frame-src https://nutriglance.firebaseapp.com https://accounts.google.com",
  "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const configPath = `${root}vercel.json`;
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const headers = [
  { source: '/(.*)', headers: [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  ] },
  { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
];
if (process.argv.includes('--check')) {
  if (JSON.stringify(config.headers) !== JSON.stringify(headers)) {
    console.error('Security headers are stale. Run npm run security:headers and commit vercel.json.');
    process.exit(1);
  }
} else {
  config.headers = headers;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
