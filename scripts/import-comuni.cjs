#!/usr/bin/env node
/**
 * Script per importare i comuni italiani dal file dei codici catastali
 * Genera un file SQL per l'import su Supabase
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = process.argv[2] || '/Users/alex/Downloads/T4_codicicatastali_comuni_20_01_2020_full.txt';
const OUTPUT_FILE = path.join(__dirname, '..', 'supabase-comuni.sql');

console.log('Lettura file:', INPUT_FILE);

const content = fs.readFileSync(INPUT_FILE, 'utf-8');
const lines = content.split('\n');

// Salta le prime 2 righe (header)
const dataLines = lines.slice(2).filter(line => line.trim());

console.log(`Trovate ${dataLines.length} righe di dati`);

const comuni = [];
let skipped = 0;

for (const line of dataLines) {
  // Formato: CODICE NOME_COMUNE (PROV) PROV [new]
  // Es: A001 ABANO TERME (PD) PD
  // Es: A012 ABETONE (soppresso) (PT) PT
  // Es: M429 BORGO D'ANAUNIA (TN) TN new

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

    comuni.push({ codice, nome, provincia, soppresso });
  } else {
    // Ignora header ripetuti e righe vuote
    if (!line.includes('Codice catastale') &&
        !line.includes('del comune') &&
        !line.includes('Tabella dei Codici') &&
        line.trim()) {
      console.warn('Riga non parsata:', line);
      skipped++;
    }
  }
}

console.log(`Parsati ${comuni.length} comuni`);
console.log(`Righe saltate (header): ${skipped}`);

// Genera SQL
let sql = `-- Comuni italiani - Codici catastali per Codice Fiscale
-- Generato automaticamente da import-comuni.cjs
-- Data: ${new Date().toISOString()}
-- Fonte: Agenzia delle Entrate
-- Totale comuni: ${comuni.length}

-- Pulisci tabella esistente (opzionale)
-- TRUNCATE TABLE comuni RESTART IDENTITY;

-- Insert comuni
INSERT INTO comuni (codice_catastale, nome, provincia, soppresso) VALUES
`;

const values = comuni.map(c => {
  // Escape apostrofi per SQL
  const nomeEscaped = c.nome.replace(/'/g, "''");
  return `('${c.codice}', '${nomeEscaped}', '${c.provincia}', ${c.soppresso})`;
});

sql += values.join(',\n') + '\nON CONFLICT (codice_catastale) DO UPDATE SET nome = EXCLUDED.nome, provincia = EXCLUDED.provincia, soppresso = EXCLUDED.soppresso;\n';

fs.writeFileSync(OUTPUT_FILE, sql);

console.log(`\nFile SQL generato: ${OUTPUT_FILE}`);
console.log(`Totale comuni: ${comuni.length}`);
console.log(`Di cui soppressi: ${comuni.filter(c => c.soppresso).length}`);
