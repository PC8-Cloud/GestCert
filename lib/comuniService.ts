import { supabase } from './supabase';
import { STORAGE_MODE } from './config';

// ============ INTERFACCIA COMUNE ============

export interface Comune {
  codice_catastale: string;
  nome: string;
  provincia: string;
  soppresso: boolean;
}

// ============ CACHE LOCALE ============

let comuniCache: Comune[] = [];
let cacheLoaded = false;
let cacheLoading: Promise<Comune[]> | null = null;

// Mappa per ricerca veloce per nome (case-insensitive)
const comuniByNome: Map<string, Comune> = new Map();

// Mappa per ricerca veloce per codice
const comuniByCodice: Map<string, Comune> = new Map();

// ============ SERVIZIO COMUNI ============

export const comuniService = {
  /**
   * Carica tutti i comuni (con cache)
   */
  async loadAll(): Promise<Comune[]> {
    // Se già in cache, ritorna subito
    if (cacheLoaded) {
      return comuniCache;
    }

    // Se sta già caricando, aspetta
    if (cacheLoading) {
      return cacheLoading;
    }

    // Inizia caricamento
    cacheLoading = this._fetchComuni();

    try {
      comuniCache = await cacheLoading;
      cacheLoaded = true;

      // Popola le mappe per ricerca veloce
      for (const comune of comuniCache) {
        comuniByNome.set(comune.nome.toUpperCase(), comune);
        comuniByCodice.set(comune.codice_catastale.toUpperCase(), comune);
      }

      console.log(`Caricati ${comuniCache.length} comuni in cache`);
      return comuniCache;
    } finally {
      cacheLoading = null;
    }
  },

  /**
   * Fetch comuni dal database
   */
  async _fetchComuni(): Promise<Comune[]> {
    if (STORAGE_MODE === 'local') {
      // In modalità locale, carica dal file JSON statico
      return this._loadFromJSON();
    }

    // Modalità Supabase - carica tutti i comuni (8222+)
    // Supabase limita a 1000 righe per default, quindi usiamo paginazione
    const allComuni: Comune[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('comuni')
        .select('codice_catastale, nome, provincia, soppresso')
        .order('nome', { ascending: true })
        .range(from, to);

      if (error) {
        console.error('Errore caricamento comuni da Supabase:', error);
        // Fallback a JSON locale
        return this._loadFromJSON();
      }

      if (data && data.length > 0) {
        allComuni.push(...data);
        hasMore = data.length === pageSize;
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`Caricati ${allComuni.length} comuni da Supabase`);
    return allComuni;
  },

  /**
   * Carica comuni dal file JSON statico (fallback/locale)
   */
  async _loadFromJSON(): Promise<Comune[]> {
    try {
      const response = await fetch('/comuni.json');
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Impossibile caricare comuni.json, uso lista vuota:', e);
    }
    return [];
  },

  /**
   * Cerca codice catastale per nome comune
   */
  async getCodiceByComuneNome(nome: string): Promise<string | null> {
    await this.loadAll();

    const nomeUpper = nome.toUpperCase().trim();
    const comune = comuniByNome.get(nomeUpper);

    return comune ? comune.codice_catastale : null;
  },

  /**
   * Cerca nome comune per codice catastale
   */
  async getComuneNomeByCodice(codice: string): Promise<string | null> {
    await this.loadAll();

    const codiceUpper = codice.toUpperCase().trim();
    const comune = comuniByCodice.get(codiceUpper);

    if (comune) {
      // Formatta con prima lettera maiuscola
      return comune.nome.charAt(0).toUpperCase() + comune.nome.slice(1).toLowerCase();
    }
    return null;
  },

  /**
   * Cerca comune completo per codice
   */
  async getComuneByCodice(codice: string): Promise<Comune | null> {
    await this.loadAll();

    const codiceUpper = codice.toUpperCase().trim();
    return comuniByCodice.get(codiceUpper) || null;
  },

  /**
   * Cerca comuni per nome (parziale, per autocomplete)
   */
  async searchByNome(query: string, limit: number = 10): Promise<Comune[]> {
    await this.loadAll();

    const queryUpper = query.toUpperCase().trim();
    if (!queryUpper) return [];

    const results: Comune[] = [];

    // Prima cerca match esatti all'inizio
    for (const comune of comuniCache) {
      if (comune.nome.toUpperCase().startsWith(queryUpper)) {
        results.push(comune);
        if (results.length >= limit) break;
      }
    }

    // Se non abbastanza, cerca match parziali
    if (results.length < limit) {
      for (const comune of comuniCache) {
        if (!results.includes(comune) &&
          comune.nome.toUpperCase().includes(queryUpper)) {
          results.push(comune);
          if (results.length >= limit) break;
        }
      }
    }

    return results;
  },

  /**
   * Ottieni tutti i nomi comuni (per autocomplete completo)
   */
  async getAllNomi(): Promise<string[]> {
    await this.loadAll();
    return comuniCache.map(c => c.nome);
  },

  /**
   * Verifica se la cache è caricata
   */
  isCacheLoaded(): boolean {
    return cacheLoaded;
  },

  /**
   * Forza ricaricamento cache
   */
  async reloadCache(): Promise<void> {
    cacheLoaded = false;
    comuniByNome.clear();
    comuniByCodice.clear();
    comuniCache = [];
    await this.loadAll();
  }
};
