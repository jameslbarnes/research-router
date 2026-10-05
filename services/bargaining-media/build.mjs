import { statSync, writeFileSync } from 'node:fs';

const bytes = statSync(new URL('./public/introduction.mp4', import.meta.url)).size;
writeFileSync(new URL('./media.json', import.meta.url), JSON.stringify({ bytes }, null, 2) + '\n');
