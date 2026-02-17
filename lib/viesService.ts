// VIES API Service - EU VAT Number Validation
// https://ec.europa.eu/taxation_customs/vies/rest-api/
// Uses Supabase Edge Function (check-vat) as primary method to bypass CORS.
// Falls back to Vite dev proxy, then direct call.

import { supabaseUrl, supabaseAnonKey } from './supabase';

export interface ViesResult {
  isValid: boolean;
  ragioneSociale: string;
  address: string;
  houseNumber?: string;
  zipCode: string;
  city: string;
  province: string;
}

interface ViesApiResponse {
  isValid: boolean;
  name: string;
  address: string;
}

/**
 * Parse the VIES address field.
 * Handles multiple formats:
 *   "VIA GAETANO NEGRI 1 \n20123 MILANO MI\n"
 *   "VIA NINO BIXIO 41-43, 94015 PIAZZA ARMERINA EN"
 */
function parseViesAddress(raw: string): { address: string; houseNumber?: string; zipCode: string; city: string; province: string } {
  // Normalize: split on newline or comma
  const lines = raw.split(/[\n,]/).map(l => l.trim()).filter(Boolean);

  let address = '';
  let houseNumber: string | undefined;
  let zipCode = '';
  let city = '';
  let province = '';

  if (lines.length >= 1) {
    const streetLine = lines[0];
    const parts = streetLine.split(/\s+/);
    // Check if last token looks like a house number (e.g. "1", "41-43", "12A", "5/B")
    if (parts.length > 1 && /^\d+[a-zA-Z\/\-]*$/.test(parts[parts.length - 1])) {
      houseNumber = parts.pop();
      address = parts.join(' ');
    } else {
      address = streetLine;
    }
  }

  if (lines.length >= 2) {
    const locationLine = lines[1];
    // Try standard format: "20123 MILANO MI"
    const match = locationLine.match(/^(\d{5})\s+(.+?)\s+([A-Z]{2})$/);
    if (match) {
      zipCode = match[1];
      city = match[2];
      province = match[3];
    } else {
      const tokens = locationLine.split(/\s+/);
      if (tokens.length >= 2 && /^\d{5}$/.test(tokens[0])) {
        zipCode = tokens[0];
        if (tokens.length >= 3 && /^[A-Z]{2}$/.test(tokens[tokens.length - 1])) {
          province = tokens[tokens.length - 1];
          city = tokens.slice(1, -1).join(' ');
        } else {
          city = tokens.slice(1).join(' ');
        }
      }
    }
  }

  return { address, houseNumber, zipCode, city, province };
}

/**
 * Call VIES via Supabase Edge Function (server-side, no CORS issues).
 */
async function fetchViaEdgeFunction(cleaned: string): Promise<Response | null> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[VIES] Supabase non configurato, skip edge function');
    return null;
  }

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/check-vat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ countryCode: 'IT', vatNumber: cleaned }),
    });

    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return resp;
    }
    console.warn(`[VIES] Edge function returned non-JSON (${resp.status})`);
    return null;
  } catch (err) {
    console.warn('[VIES] Edge function non raggiungibile:', err);
    return null;
  }
}

/**
 * Call VIES via Vite dev proxy (dev mode only).
 */
async function fetchViaProxy(cleaned: string): Promise<Response | null> {
  try {
    const resp = await fetch(`/api/vies/ms/IT/vat/${cleaned}`);
    const contentType = resp.headers.get('content-type') || '';
    if (resp.ok && contentType.includes('application/json')) {
      return resp;
    }
    console.warn(`[VIES] Proxy returned ${resp.status} (${contentType})`);
    return null;
  } catch {
    console.warn('[VIES] Proxy non disponibile');
    return null;
  }
}

/**
 * Call VIES directly (may fail due to CORS in browser).
 */
async function fetchDirect(cleaned: string): Promise<Response> {
  const resp = await fetch(
    `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/${cleaned}`
  );
  return resp;
}

/**
 * Lookup a Partita IVA using the EU VIES REST API.
 * Strategy: Edge Function → Vite proxy → Direct call.
 */
export async function lookupPartitaIva(piva: string): Promise<ViesResult | null> {
  const cleaned = piva.replace(/[\s.\-]/g, '');

  if (!/^\d{11}$/.test(cleaned)) {
    throw new Error('La Partita IVA deve contenere 11 cifre');
  }

  // Try methods in order: Edge Function → Vite proxy → Direct
  let response: Response | null = null;

  response = await fetchViaEdgeFunction(cleaned);

  if (!response) {
    response = await fetchViaProxy(cleaned);
  }

  if (!response) {
    try {
      response = await fetchDirect(cleaned);
    } catch (err) {
      console.error('[VIES] Tutti i metodi falliti:', err);
      throw new Error('Impossibile contattare il servizio VIES. Verifica la connessione.');
    }
  }

  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      return null;
    }
    if (response.status >= 500) {
      throw new Error('Il servizio VIES non è al momento disponibile. Riprova più tardi.');
    }
    throw new Error(`Errore VIES: ${response.status} ${response.statusText}`);
  }

  let data: ViesApiResponse;
  try {
    data = await response.json();
  } catch {
    throw new Error('Errore nella lettura della risposta VIES. Riprova più tardi.');
  }

  if (!data.isValid) {
    return { isValid: false, ragioneSociale: '', address: '', zipCode: '', city: '', province: '' };
  }

  const parsed = parseViesAddress(data.address || '');

  return {
    isValid: true,
    ragioneSociale: data.name || '',
    address: parsed.address,
    houseNumber: parsed.houseNumber,
    zipCode: parsed.zipCode,
    city: parsed.city,
    province: parsed.province,
  };
}
