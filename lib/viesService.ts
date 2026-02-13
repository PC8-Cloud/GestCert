// VIES API Service - EU VAT Number Validation
// https://ec.europa.eu/taxation_customs/vies/rest-api/
// Uses Vite dev proxy (/api/vies) to bypass CORS in development.

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
 * Format: "VIA GAETANO NEGRI 1 \n20123 MILANO MI\n"
 * Line 1: street + house number
 * Line 2: ZIP + city + province
 */
function parseViesAddress(raw: string): { address: string; houseNumber?: string; zipCode: string; city: string; province: string } {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  let address = '';
  let houseNumber: string | undefined;
  let zipCode = '';
  let city = '';
  let province = '';

  if (lines.length >= 1) {
    const streetLine = lines[0];
    const parts = streetLine.split(/\s+/);
    if (parts.length > 1 && /^\d+[a-zA-Z\/]*$/.test(parts[parts.length - 1])) {
      houseNumber = parts.pop();
      address = parts.join(' ');
    } else {
      address = streetLine;
    }
  }

  if (lines.length >= 2) {
    const locationLine = lines[1];
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
 * Lookup a Partita IVA using the EU VIES REST API.
 * In dev mode uses Vite proxy (/api/vies) to bypass CORS.
 * In production tries direct call, then falls back to a CORS proxy.
 */
export async function lookupPartitaIva(piva: string): Promise<ViesResult | null> {
  const cleaned = piva.replace(/[\s.\-]/g, '');

  if (!/^\d{11}$/.test(cleaned)) {
    throw new Error('La Partita IVA deve contenere 11 cifre');
  }

  // Use Vite dev proxy to avoid CORS
  const proxyUrl = `/api/vies/ms/IT/vat/${cleaned}`;
  const directUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/IT/vat/${cleaned}`;

  let response: Response;

  try {
    // Try proxy first (works in dev with Vite)
    response = await fetch(proxyUrl);
  } catch {
    // Fallback: try direct (may work if CORS is allowed or in production)
    try {
      response = await fetch(directUrl);
    } catch (err) {
      console.error('[VIES] Errore chiamata API (diretto):', err);
      throw new Error('Impossibile contattare il servizio VIES. Verifica la connessione.');
    }
  }

  try {
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Errore VIES: ${response.status} ${response.statusText}`);
    }

    const data: ViesApiResponse = await response.json();

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
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith('La Partita IVA') || err.message.startsWith('Errore VIES'))) {
      throw err;
    }
    console.error('[VIES] Errore parsing risposta:', err);
    throw new Error('Errore nella lettura della risposta VIES.');
  }
}
