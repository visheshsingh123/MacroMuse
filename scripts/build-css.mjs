import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root = fileURLToPath(new URL('../', import.meta.url));
const from = `${root}src/tailwind.css`, to = `${root}public/app.css`;
const result = await postcss([tailwind({ base: root, optimize: { minify: true } })])
  .process(await readFile(from, 'utf8'), { from, to });
await writeFile(to, result.css);
