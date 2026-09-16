import { extractTextFromImages } from './src/services/security/ocrExtraction.js';
import fs from 'fs';
const path = process.argv[2];
if (!path) { console.error('Użycie: node test_ocr.mjs <ścieżka-do-zdjęcia>'); process.exit(1); }
const buffer = fs.readFileSync(path);
const text = await extractTextFromImages([{ buffer, filename: path.split('/').pop() }]);
console.log('--- Wykryty tekst ---');
console.log(text || '(brak tekstu / OCR nic nie znalazł)');
