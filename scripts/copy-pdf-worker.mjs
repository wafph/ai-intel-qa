import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const mjsTarget = resolve('public/pdf.worker.min.mjs');
const jsCompatTarget = resolve('public/pdf.worker.min.js');

if (existsSync(source)) {
  mkdirSync(dirname(mjsTarget), { recursive: true });
  copyFileSync(source, mjsTarget);
  copyFileSync(source, jsCompatTarget);
  console.log(`[copy-pdf-worker] ${source} -> ${mjsTarget}`);
  console.log(`[copy-pdf-worker] ${source} -> ${jsCompatTarget}`);
} else if (existsSync(mjsTarget) || existsSync(jsCompatTarget)) {
  console.warn('[copy-pdf-worker] node_modules worker not found, keep existing public/pdf.worker.min.mjs / public/pdf.worker.min.js');
} else {
  console.warn('[copy-pdf-worker] pdfjs worker source not found and public worker files do not exist. Please run npm install first.');
}
