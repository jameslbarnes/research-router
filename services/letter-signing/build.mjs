import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLetter } from './app.mjs';
import './build-science.mjs';

const letter = parseLetter(readFileSync(new URL('../../site/letter/index.html', import.meta.url), 'utf8'));
writeFileSync(new URL('./generated-letter.json', import.meta.url), JSON.stringify(letter, null, 2) + '\n');
console.log(`Prepared letter version ${letter.hash.slice(0, 12)}.`);

// Only the signing interface is served by Cloudflare. The letter stays on GitHub Pages.
const destination = new URL('./public/', import.meta.url);
rmSync(destination, { recursive: true, force: true });
for (const path of ['sign/index.html', 'sign.js', 'sign.css', 'invitations.js', 'companion.css', 'hosting.js',
  'assets/orcid-id.svg', 'assets/spatial-threads/journey-poster-desktop.jpg']) {
  const target = new URL('letter/' + path, destination);
  mkdirSync(dirname(fileURLToPath(target)), { recursive: true });
  cpSync(new URL('../../site/letter/' + path, import.meta.url), target);
}
