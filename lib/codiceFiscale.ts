// ============ CODICE FISCALE ITALIANO - UTILITY ============
// Calcolo, validazione e verifica coerenza del Codice Fiscale
// Ora usa il database completo dei comuni italiani (8222 comuni)

import { comuniService } from './comuniService';

// Mappa mesi per CF
const MESI_CF: Record<number, string> = {
  1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'H',
  7: 'L', 8: 'M', 9: 'P', 10: 'R', 11: 'S', 12: 'T'
};

const MESI_CF_REVERSE: Record<string, number> = {
  'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'H': 6,
  'L': 7, 'M': 8, 'P': 9, 'R': 10, 'S': 11, 'T': 12
};

// Valori per calcolo carattere di controllo
const VALORI_DISPARI: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
  'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
  'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23
};

const VALORI_PARI: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
  'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
  'U': 20, 'V': 21, 'W': 22, 'X': 23, 'Y': 24, 'Z': 25
};

const CARATTERE_CONTROLLO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ============ FUNZIONI INTERNE ============

// Estrai consonanti da una stringa
function estraiConsonanti(str: string): string {
  return str.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '');
}

// Estrai vocali da una stringa
function estraiVocali(str: string): string {
  return str.toUpperCase().replace(/[^AEIOU]/g, '');
}

// Calcola le 3 lettere del cognome
function calcolaCognome(cognome: string): string {
  const consonanti = estraiConsonanti(cognome);
  const vocali = estraiVocali(cognome);
  const lettere = consonanti + vocali + 'XXX';
  return lettere.substring(0, 3);
}

// Calcola le 3 lettere del nome
function calcolaNome(nome: string): string {
  const consonanti = estraiConsonanti(nome);
  const vocali = estraiVocali(nome);

  let lettere: string;
  if (consonanti.length >= 4) {
    // Se ci sono 4+ consonanti, prendi la 1a, 3a e 4a
    lettere = consonanti[0] + consonanti[2] + consonanti[3];
  } else {
    lettere = (consonanti + vocali + 'XXX').substring(0, 3);
  }
  return lettere;
}

// Calcola anno, mese e giorno
function calcolaDataNascita(dataNascita: string, genere: 'M' | 'F'): string {
  const data = new Date(dataNascita);
  const anno = data.getFullYear().toString().slice(-2);
  const mese = MESI_CF[data.getMonth() + 1];
  let giorno = data.getDate();

  // Per le femmine, aggiungere 40 al giorno
  if (genere === 'F') {
    giorno += 40;
  }

  return anno + mese + giorno.toString().padStart(2, '0');
}

// Calcola carattere di controllo
function calcolaCarattereControllo(cf15: string): string {
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const char = cf15[i];
    if (i % 2 === 0) {
      // Posizione dispari (1-based = indice pari 0-based)
      somma += VALORI_DISPARI[char] || 0;
    } else {
      // Posizione pari
      somma += VALORI_PARI[char] || 0;
    }
  }
  return CARATTERE_CONTROLLO[somma % 26];
}

// ============ INTERFACCE ============

export interface DatiAnagrafici {
  nome: string;
  cognome: string;
  dataNascita: string; // YYYY-MM-DD
  genere: 'M' | 'F';
  luogoNascita: string;
}

export interface ValidazioneResult {
  valido: boolean;
  errori: string[];
  warnings: string[];
  datiEstratti?: {
    cognome: string;
    nome: string;
    anno: number;
    mese: number;
    giorno: number;
    genere: 'M' | 'F';
    codiceCatastale: string;
  };
}

export interface CoerenzaResult {
  coerente: boolean;
  errori: string[];
  warnings: string[];
  dettagli: {
    cognomeOk: boolean;
    nomeOk: boolean;
    dataNascitaOk: boolean;
    genereOk: boolean;
    luogoNascitaOk: boolean | null; // null se non verificabile
  };
}

// ============ FUNZIONI PUBBLICHE ============

/**
 * Valida formato e carattere di controllo del CF (sincrona)
 */
export function validaCodiceFiscale(cf: string): ValidazioneResult {
  const result: ValidazioneResult = {
    valido: false,
    errori: [],
    warnings: []
  };

  if (!cf) {
    result.errori.push('Codice fiscale mancante');
    return result;
  }

  const cfUpper = cf.toUpperCase().trim();

  // Verifica lunghezza
  if (cfUpper.length !== 16) {
    result.errori.push(`Lunghezza non valida: ${cfUpper.length} caratteri invece di 16`);
    return result;
  }

  // Verifica formato con regex
  const regex = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/;
  if (!regex.test(cfUpper)) {
    result.errori.push('Formato non valido');
    return result;
  }

  // Verifica carattere di controllo
  const cf15 = cfUpper.substring(0, 15);
  const carattereCalcolato = calcolaCarattereControllo(cf15);
  const caratterePresente = cfUpper[15];

  if (carattereCalcolato !== caratterePresente) {
    result.errori.push(`Carattere di controllo errato: atteso '${carattereCalcolato}', trovato '${caratterePresente}'`);
    return result;
  }

  // Estrai dati dal CF
  const meseLettera = cfUpper[8];
  const mese = MESI_CF_REVERSE[meseLettera];
  if (!mese) {
    result.errori.push(`Mese non valido: '${meseLettera}'`);
    return result;
  }

  const giornoNum = parseInt(cfUpper.substring(9, 11));
  const genere: 'M' | 'F' = giornoNum > 40 ? 'F' : 'M';
  const giorno = genere === 'F' ? giornoNum - 40 : giornoNum;

  // Verifica giorno valido
  if (giorno < 1 || giorno > 31) {
    result.errori.push(`Giorno non valido: ${giorno}`);
    return result;
  }

  const annoShort = parseInt(cfUpper.substring(6, 8));
  // Assumiamo che anni < 30 siano 2000+, altrimenti 1900+
  const anno = annoShort < 30 ? 2000 + annoShort : 1900 + annoShort;

  result.valido = true;
  result.datiEstratti = {
    cognome: cfUpper.substring(0, 3),
    nome: cfUpper.substring(3, 6),
    anno,
    mese,
    giorno,
    genere,
    codiceCatastale: cfUpper.substring(11, 15)
  };

  return result;
}

/**
 * Verifica coerenza tra CF e dati anagrafici (ASYNC - usa database comuni)
 */
export async function verificaCoerenza(cf: string, dati: DatiAnagrafici): Promise<CoerenzaResult> {
  const result: CoerenzaResult = {
    coerente: true,
    errori: [],
    warnings: [],
    dettagli: {
      cognomeOk: true,
      nomeOk: true,
      dataNascitaOk: true,
      genereOk: true,
      luogoNascitaOk: null
    }
  };

  // Prima valida il CF
  const validazione = validaCodiceFiscale(cf);
  if (!validazione.valido) {
    result.coerente = false;
    result.errori = validazione.errori;
    return result;
  }

  const estratti = validazione.datiEstratti!;

  // Verifica cognome
  const cognomeCalcolato = calcolaCognome(dati.cognome);
  if (cognomeCalcolato !== estratti.cognome) {
    result.coerente = false;
    result.dettagli.cognomeOk = false;
    result.errori.push(`Cognome non corrisponde: CF indica '${estratti.cognome}', calcolato '${cognomeCalcolato}' da '${dati.cognome}'`);
  }

  // Verifica nome
  const nomeCalcolato = calcolaNome(dati.nome);
  if (nomeCalcolato !== estratti.nome) {
    result.coerente = false;
    result.dettagli.nomeOk = false;
    result.errori.push(`Nome non corrisponde: CF indica '${estratti.nome}', calcolato '${nomeCalcolato}' da '${dati.nome}'`);
  }

  // Verifica data di nascita
  if (dati.dataNascita) {
    const dataParts = dati.dataNascita.split('-');
    if (dataParts.length === 3) {
      const annoInput = parseInt(dataParts[0]);
      const meseInput = parseInt(dataParts[1]);
      const giornoInput = parseInt(dataParts[2]);

      if (annoInput !== estratti.anno) {
        result.coerente = false;
        result.dettagli.dataNascitaOk = false;
        result.errori.push(`Anno di nascita non corrisponde: CF indica ${estratti.anno}, inserito ${annoInput}`);
      }
      if (meseInput !== estratti.mese) {
        result.coerente = false;
        result.dettagli.dataNascitaOk = false;
        result.errori.push(`Mese di nascita non corrisponde: CF indica ${estratti.mese}, inserito ${meseInput}`);
      }
      if (giornoInput !== estratti.giorno) {
        result.coerente = false;
        result.dettagli.dataNascitaOk = false;
        result.errori.push(`Giorno di nascita non corrisponde: CF indica ${estratti.giorno}, inserito ${giornoInput}`);
      }
    }
  }

  // Verifica genere
  if (dati.genere !== estratti.genere) {
    result.coerente = false;
    result.dettagli.genereOk = false;
    result.errori.push(`Genere non corrisponde: CF indica '${estratti.genere}', inserito '${dati.genere}'`);
  }

  // Verifica luogo di nascita (usa database comuni)
  if (dati.luogoNascita) {
    const codiceCatastale = await comuniService.getCodiceByComuneNome(dati.luogoNascita);
    if (codiceCatastale) {
      if (codiceCatastale !== estratti.codiceCatastale) {
        result.coerente = false;
        result.dettagli.luogoNascitaOk = false;
        result.errori.push(`Luogo di nascita non corrisponde: CF indica '${estratti.codiceCatastale}', '${dati.luogoNascita}' ha codice '${codiceCatastale}'`);
      } else {
        result.dettagli.luogoNascitaOk = true;
      }
    } else {
      result.dettagli.luogoNascitaOk = null;
      result.warnings.push(`Codice catastale per '${dati.luogoNascita}' non trovato nel database - verifica manuale necessaria`);
    }
  }

  return result;
}

/**
 * Genera codice fiscale dai dati anagrafici (ASYNC - usa database comuni)
 */
export async function generaCodiceFiscale(dati: DatiAnagrafici): Promise<{ cf: string | null; errore: string | null }> {
  // Verifica dati obbligatori
  if (!dati.nome || !dati.cognome || !dati.dataNascita || !dati.genere || !dati.luogoNascita) {
    return { cf: null, errore: 'Tutti i dati anagrafici sono obbligatori per generare il CF' };
  }

  // Cerca codice catastale nel database
  const codiceCatastale = await comuniService.getCodiceByComuneNome(dati.luogoNascita);
  if (!codiceCatastale) {
    return { cf: null, errore: `Codice catastale per '${dati.luogoNascita}' non trovato. Inserire il CF manualmente.` };
  }

  // Calcola le parti
  const cognome = calcolaCognome(dati.cognome);
  const nome = calcolaNome(dati.nome);
  const dataNascita = calcolaDataNascita(dati.dataNascita, dati.genere);

  // Componi CF senza carattere di controllo
  const cf15 = cognome + nome + dataNascita + codiceCatastale;

  // Calcola e aggiungi carattere di controllo
  const carattereControllo = calcolaCarattereControllo(cf15);
  const cfCompleto = cf15 + carattereControllo;

  return { cf: cfCompleto, errore: null };
}

/**
 * Estrai dati dal CF (sincrona - per visualizzazione base)
 */
export function estraiDatiDaCF(cf: string): {
  valido: boolean;
  genere?: 'M' | 'F';
  dataNascita?: string;
  annoNascita?: number;
  meseNascita?: number;
  giornoNascita?: number;
  codiceCatastale?: string;
} {
  const validazione = validaCodiceFiscale(cf);
  if (!validazione.valido || !validazione.datiEstratti) {
    return { valido: false };
  }

  const d = validazione.datiEstratti;
  const dataNascita = `${d.anno}-${d.mese.toString().padStart(2, '0')}-${d.giorno.toString().padStart(2, '0')}`;

  return {
    valido: true,
    genere: d.genere,
    dataNascita,
    annoNascita: d.anno,
    meseNascita: d.mese,
    giornoNascita: d.giorno,
    codiceCatastale: d.codiceCatastale
  };
}

/**
 * Lista dei comuni disponibili (ASYNC - per autocomplete)
 */
export async function getComuni(): Promise<string[]> {
  return comuniService.getAllNomi();
}

/**
 * Cerca comuni per autocomplete (ASYNC)
 */
export async function searchComuni(query: string, limit: number = 10): Promise<string[]> {
  const comuni = await comuniService.searchByNome(query, limit);
  return comuni.map(c => c.nome);
}

/**
 * Reverse lookup: trova comune dal codice catastale (ASYNC)
 */
export async function getComuneDaCodice(codiceCatastale: string): Promise<string | null> {
  return comuniService.getComuneNomeByCodice(codiceCatastale);
}

/**
 * Genera CF parziale con i dati disponibili (ASYNC - per auto-completamento progressivo)
 */
export async function generaCFParziale(dati: Partial<DatiAnagrafici>): Promise<string> {
  let cf = '';

  // Cognome (primi 3 caratteri)
  if (dati.cognome && dati.cognome.trim().length > 0) {
    cf += calcolaCognome(dati.cognome);
  } else {
    return cf; // Serve almeno il cognome
  }

  // Nome (caratteri 4-6)
  if (dati.nome && dati.nome.trim().length > 0) {
    cf += calcolaNome(dati.nome);
  } else {
    return cf; // Senza nome, ritorna solo cognome
  }

  // Data di nascita e genere (caratteri 7-11)
  if (dati.dataNascita && dati.genere) {
    cf += calcolaDataNascita(dati.dataNascita, dati.genere);
  } else {
    return cf; // Senza data/genere, ritorna cognome+nome
  }

  // Luogo di nascita (caratteri 12-15)
  if (dati.luogoNascita) {
    const codiceCatastale = await comuniService.getCodiceByComuneNome(dati.luogoNascita);
    if (codiceCatastale) {
      cf += codiceCatastale;
      // Aggiungi carattere di controllo (carattere 16)
      cf += calcolaCarattereControllo(cf);
    }
  }

  return cf;
}

/**
 * Estrai tutti i dati possibili dal CF (ASYNC - per auto-fill inverso con nome comune)
 */
export async function estraiTuttiDatiDaCF(cf: string): Promise<{
  valido: boolean;
  genere?: 'M' | 'F';
  dataNascita?: string;
  luogoNascita?: string;
  codiceCatastale?: string;
}> {
  const validazione = validaCodiceFiscale(cf);
  if (!validazione.valido || !validazione.datiEstratti) {
    return { valido: false };
  }

  const d = validazione.datiEstratti;
  const dataNascita = `${d.anno}-${d.mese.toString().padStart(2, '0')}-${d.giorno.toString().padStart(2, '0')}`;
  const luogoNascita = await getComuneDaCodice(d.codiceCatastale);

  return {
    valido: true,
    genere: d.genere,
    dataNascita,
    luogoNascita: luogoNascita || undefined,
    codiceCatastale: d.codiceCatastale
  };
}

/**
 * Pre-carica il database dei comuni (chiamare all'avvio app)
 */
export async function preloadComuni(): Promise<void> {
  await comuniService.loadAll();
}
