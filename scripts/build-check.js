'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = ['public/index.html', 'public/styles.css', 'public/app.js'];

for (const relative of required) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) throw new Error(`Missing build asset: ${relative}`);
  if (fs.statSync(absolute).size === 0) throw new Error(`Build asset is empty: ${relative}`);
}

const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const localReferences = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
for (const reference of localReferences) {
  if (reference.startsWith('#')) continue;
  if (!reference.startsWith('/') || reference.startsWith('//')) {
    throw new Error(`Build must use same-origin assets: ${reference}`);
  }
  const target = path.resolve(root, 'public', reference.slice(1));
  const publicRoot = path.resolve(root, 'public') + path.sep;
  if (!target.startsWith(publicRoot) || !fs.existsSync(target)) {
    throw new Error(`Referenced asset does not exist: ${reference}`);
  }
}

for (const relative of required) {
  const contents = fs.readFileSync(path.join(root, relative), 'utf8');
  if (/https?:\/\//i.test(contents)) {
    throw new Error(`External URL found in local asset: ${relative}`);
  }
}

if (!/<main\b/i.test(html) || !/<form\b/i.test(html) || !/<script[^>]+src="\/app\.js"/i.test(html)) {
  throw new Error('The production shell is missing a main region, form, or application script');
}

process.stdout.write(`Build assets verified: ${required.join(', ')}\n`);
