import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/meal-photo.js', import.meta.url), 'utf8');
function fixture({ encodedSizes = [700000], brokenDecoder = false, brokenEncoder = false, brokenReader = false } = {}) {
  const state = { decoded: 0, closed: 0, revoked: 0, reads: [], encodes: [] };
  const bitmap = { width: 6000, height: 4000, close: () => state.closed++ };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toBlob(callback, type) {
      state.encodes.push({ width: this.width, height: this.height });
      callback(brokenEncoder ? null : { type, size: encodedSizes.shift() || 700000 });
    },
  };
  class Reader {
    readAsDataURL(blob) {
      state.reads.push(blob);
      queueMicrotask(() => {
        if (brokenReader) return this.onerror();
        this.result = `data:${blob.type};base64,${blob.base64 || '/9j/AA=='}`;
        this.onload();
      });
    }
  }
  class Image {
    set src(_url) { queueMicrotask(() => this.onerror()); }
  }
  const context = {
    window: { createImageBitmap: async () => {
      state.decoded++;
      if (brokenDecoder) throw new Error('Invalid image');
      return bitmap;
    } },
    document: { createElement: () => canvas },
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL: () => state.revoked++ },
    Image, FileReader: Reader,
  };
  vm.runInNewContext(code, context);
  return { photo: context.window.NutriPhoto, state, canvas };
}

test('meal photos accept the exact 10 MB boundary and reject larger originals before decoding', async () => {
  const { photo, state } = fixture();
  const size = 10 * 1024 * 1024;
  const prepared = await photo.prepare({ type: 'image/jpeg', size });
  assert.equal(prepared.mimeType, 'image/jpeg');
  assert.equal(state.decoded, 1);
  await assert.rejects(photo.prepare({ type: 'image/jpeg', size: size + 1 }), /10 MB or smaller/);
  assert.equal(state.decoded, 1);
});

test('already-small JPEG, PNG and WebP files retain their original bytes and MIME type', async () => {
  const { photo, state } = fixture();
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    const prepared = await photo.prepare({ type, size: 500000, base64: 'original-image-bytes' });
    assert.equal(prepared.base64, 'original-image-bytes');
    assert.equal(prepared.mimeType, type);
  }
  assert.equal(state.decoded, 0);
});

test('large images retain their aspect ratio and fit the existing inline-image budget', async () => {
  const { photo, state, canvas } = fixture({ encodedSizes: [2500000, 800000] });
  await photo.prepare({ type: 'image/png', size: 9000000 });
  assert.equal(state.encodes.length, 2);
  for (const { width, height } of state.encodes) {
    assert(Math.max(width, height) <= 2048);
    assert(Math.abs(width / height - 1.5) < .005);
  }
  assert(state.reads[0].size <= 1800000);
  assert.equal(state.reads[0].type, 'image/jpeg');
  assert.equal(state.closed, 1);
  assert.equal(canvas.width * canvas.height, 0);
});

test('unsupported or empty uploads never reach image processing', async () => {
  const { photo, state } = fixture();
  await assert.rejects(photo.prepare({ type: 'image/svg+xml', size: 500 }), /JPG, PNG or WebP/);
  await assert.rejects(photo.prepare({ type: 'image/jpeg', size: 0 }), /empty/);
  assert.equal(state.decoded, 0);
  assert.equal(state.reads.length, 0);
});

test('unreadable or unencodable photos fail cleanly and release image resources', async () => {
  const decoder = fixture({ brokenDecoder: true });
  await assert.rejects(decoder.photo.prepare({ type: 'image/jpeg', size: 2000000 }), /Couldn’t open/);
  assert.equal(decoder.state.revoked, 1);
  const encoder = fixture({ brokenEncoder: true });
  await assert.rejects(encoder.photo.prepare({ type: 'image/jpeg', size: 2000000 }), /Couldn’t prepare/);
  assert.equal(encoder.state.closed, 1);
  assert.equal(encoder.canvas.width * encoder.canvas.height, 0);
  const reader = fixture({ brokenReader: true });
  await assert.rejects(reader.photo.prepare({ type: 'image/jpeg', size: 1000 }), /Couldn’t read/);
});
