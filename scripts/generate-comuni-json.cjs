#!/usr/bin/env node
/**
 * Script per generare il file JSON dei comuni per uso locale
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = process.argv[2] || '/Users/alex/Downloads/T4_codicicatastali_comuni_20_01_2020_full.txt';
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'comuni.json');

console.log('Lettura file:', INPUT_FILE);

const content = fs.readFileSync(INPUT_FILE, 'utf-8');
const lines = content.split('\n');

const dataLines = lines.slice(2).filter(line => line.trim());

const comuni = [];

for (const line of dataLines) {
  // Rimuovi "new" finale se presente
  const cleanLine = line.replace(/\s+new\s*$/, '').trim();

  const match = cleanLine.match(/^([A-Z0-9]+)\s+(.+?)\s+\(([A-Z]{2})\)\s+[A-Z]{2}$/);

  if (match) {
    const codice = match[1];
    let nome = match[2].trim();
    const provincia = match[3];

    // Controlla se è soppresso
    const soppresso = nome.includes('(soppresso)');
    if (soppresso) {
      nome = nome.replace(/\s*\(soppresso\)\s*/g, '').trim();
    }

    comuni.push({
      codice_catastale: codice,
      nome: nome,
      provincia: provincia,
      soppresso: soppresso
    });
  }
}

// Ordina per nome
comuni.sort((a, b) => a.nome.localeCompare(b.nome));

// Crea directory public se non esiste
const publicDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(comuni, null, 0)); // Compatto

const stats = fs.statSync(OUTPUT_FILE);
console.log(`\nFile JSON generato: ${OUTPUT_FILE}`);
console.log(`Totale comuni: ${comuni.length}`);
console.log(`Dimensione file: ${(stats.size / 1024).toFixed(1)} KB`);
