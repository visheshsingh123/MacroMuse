// Run the official, checksum-verified emulator against a demo project only.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const jar = `${root}.cache/cloud-firestore-emulator-v1.22.0.jar`;
// Published with firebase-tools 15.34.0's downloadableEmulatorInfo.json.
const checksum = '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c';
const verified = bytes => createHash('sha256').update(bytes).digest('hex') === checksum;
const available = () => new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port: 8088 });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

let emulator;
try {
  if (await available()) throw new Error('Port 8088 is occupied. Stop the existing service before running isolated rules tests.');
  let bytes;
  try { bytes = await readFile(jar); } catch { /* Download the pinned official artifact. */ }
  if (!bytes || !verified(bytes)) {
    console.log('Downloading the official Firestore emulator (Java 21 required)…');
    const response = await fetch('https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar', { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Firestore emulator download was blocked or unavailable.');
    bytes = Buffer.from(await response.arrayBuffer());
    if (!verified(bytes)) throw new Error('Firestore emulator checksum mismatch. Refusing to execute.');
    await mkdir(`${root}.cache`, { recursive: true });
    await writeFile(jar, bytes);
  }
  emulator = spawn('java', ['-jar', jar, '--host', '127.0.0.1', '--port', '8088', '--project_id', 'demo-nutriglance', '--single_project_mode', 'true', '--rules', `${root}firestore.rules`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '', spawnError;
  emulator.on('error', error => { spawnError = error; });
  emulator.stdout.on('data', chunk => { log = (log + chunk).slice(-8000); });
  emulator.stderr.on('data', chunk => { log = (log + chunk).slice(-8000); });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (spawnError) throw spawnError;
    if (emulator.exitCode !== null) throw new Error(`Emulator exited: ${log}`);
    if (await available()) { ready = true; break; }
    await pause(200);
  }
  if (!ready) throw new Error(`Emulator did not start: ${log}`);
  const child = spawn(process.execPath, ['--test', 'tests/firestore.integration.js'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' },
  });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { emulator?.kill('SIGTERM'); }
