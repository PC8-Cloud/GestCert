import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

interface AddressResult {
  display_name: string;
  address: {
    road?: string;
    house_number?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  lat: string;
  lon: string;
}

interface ParsedAddress {
  street: string;      // Via/Piazza (senza numero)
  houseNumber: string; // Numero civico
  zipCode: string;     // CAP
  city: string;        // Città
  province: string;    // Provincia (sigla)
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onAddressSelect: (parsed: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}

// Mappa province italiane -> sigle
const PROVINCE_SIGLE: Record<string, string> = {
  'Agrigento': 'AG', 'Alessandria': 'AL', 'Ancona': 'AN', 'Aosta': 'AO', 'Arezzo': 'AR',
  'Ascoli Piceno': 'AP', 'Asti': 'AT', 'Avellino': 'AV', 'Bari': 'BA', 'Barletta-Andria-Trani': 'BT',
  'Belluno': 'BL', 'Benevento': 'BN', 'Bergamo': 'BG', 'Biella': 'BI', 'Bologna': 'BO',
  'Bolzano': 'BZ', 'Brescia': 'BS', 'Brindisi': 'BR', 'Cagliari': 'CA', 'Caltanissetta': 'CL',
  'Campobasso': 'CB', 'Caserta': 'CE', 'Catania': 'CT', 'Catanzaro': 'CZ', 'Chieti': 'CH',
  'Como': 'CO', 'Cosenza': 'CS', 'Cremona': 'CR', 'Crotone': 'KR', 'Cuneo': 'CN',
  'Enna': 'EN', 'Fermo': 'FM', 'Ferrara': 'FE', 'Firenze': 'FI', 'Foggia': 'FG',
  'Forlì-Cesena': 'FC', 'Frosinone': 'FR', 'Genova': 'GE', 'Gorizia': 'GO', 'Grosseto': 'GR',
  'Imperia': 'IM', 'Isernia': 'IS', "L'Aquila": 'AQ', 'La Spezia': 'SP', 'Latina': 'LT',
  'Lecce': 'LE', 'Lecco': 'LC', 'Livorno': 'LI', 'Lodi': 'LO', 'Lucca': 'LU',
  'Macerata': 'MC', 'Mantova': 'MN', 'Massa-Carrara': 'MS', 'Matera': 'MT', 'Messina': 'ME',
  'Milano': 'MI', 'Modena': 'MO', 'Monza e Brianza': 'MB', 'Napoli': 'NA', 'Novara': 'NO',
  'Nuoro': 'NU', 'Oristano': 'OR', 'Padova': 'PD', 'Palermo': 'PA', 'Parma': 'PR',
  'Pavia': 'PV', 'Perugia': 'PG', 'Pesaro e Urbino': 'PU', 'Pescara': 'PE', 'Piacenza': 'PC',
  'Pisa': 'PI', 'Pistoia': 'PT', 'Pordenone': 'PN', 'Potenza': 'PZ', 'Prato': 'PO',
  'Ragusa': 'RG', 'Ravenna': 'RA', 'Reggio Calabria': 'RC', 'Reggio Emilia': 'RE', 'Rieti': 'RI',
  'Rimini': 'RN', 'Roma': 'RM', 'Rovigo': 'RO', 'Salerno': 'SA', 'Sassari': 'SS',
  'Savona': 'SV', 'Siena': 'SI', 'Siracusa': 'SR', 'Sondrio': 'SO', 'Sud Sardegna': 'SU',
  'Taranto': 'TA', 'Teramo': 'TE', 'Terni': 'TR', 'Torino': 'TO', 'Trapani': 'TP',
  'Trento': 'TN', 'Treviso': 'TV', 'Trieste': 'TS', 'Udine': 'UD', 'Varese': 'VA',
  'Venezia': 'VE', 'Verbano-Cusio-Ossola': 'VB', 'Vercelli': 'VC', 'Verona': 'VR', 'Vibo Valentia': 'VV',
  'Vicenza': 'VI', 'Viterbo': 'VT',
  // Sicilia - nomi alternativi
  'Sicily': 'PA', 'Sicilia': 'PA'
};

// Cerca sigla provincia
function getProvinciaSigla(provinceName: string | undefined): string {
  if (!provinceName) return '';

  // Cerca match esatto
  if (PROVINCE_SIGLE[provinceName]) {
    return PROVINCE_SIGLE[provinceName];
  }

  // Cerca match parziale
  const normalized = provinceName.toLowerCase();
  for (const [name, sigla] of Object.entries(PROVINCE_SIGLE)) {
    if (name.toLowerCase().includes(normalized) || normalized.includes(name.toLowerCase())) {
      return sigla;
    }
  }

  // Ritorna le prime 2 lettere come fallback
  return provinceName.substring(0, 2).toUpperCase();
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Inizia a digitare l\'indirizzo...',
  className = '',
  maxLength = 200
}) => {
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Chiudi dropdown quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cerca indirizzi con debounce
  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&addressdetails=1&countrycodes=it&limit=5&q=${encodeURIComponent(query)}`,
        {
          headers: {
            'Accept-Language': 'it'
          }
        }
      );
      const data: AddressResult[] = await response.json();
      setSuggestions(data);
      setShowSuggestions(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Errore ricerca indirizzo:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Debounce della ricerca
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchAddress(newValue);
    }, 300);
  };

  const handleSelectAddress = (result: AddressResult) => {
    const addr = result.address;

    // Estrai via/piazza dalla risposta
    let street = addr.road || '';
    let houseNumber = addr.house_number || '';

    // Se non c'è il numero civico, prova a estrarlo dal display_name o dalla road
    if (!houseNumber) {
      // Pattern per trovare numeri civici (es: "Via Roma 15", "Via Roma, 15", "15 Via Roma")
      const displayParts = result.display_name.split(',');
      const firstPart = displayParts[0]?.trim() || '';

      // Cerca numero alla fine (es: "Via Roma 15" o "Via Roma 15/A")
      const endMatch = firstPart.match(/^(.+?)\s+(\d+\/?[A-Za-z]?)$/);
      if (endMatch) {
        street = endMatch[1].trim();
        houseNumber = endMatch[2];
      } else {
        // Cerca numero all'inizio (es: "15 Via Roma")
        const startMatch = firstPart.match(/^(\d+\/?[A-Za-z]?)\s+(.+)$/);
        if (startMatch) {
          houseNumber = startMatch[1];
          street = startMatch[2].trim();
        } else {
          // Cerca numero dopo virgola (es: "Via Roma, 15")
          const commaMatch = firstPart.match(/^(.+?),\s*(\d+\/?[A-Za-z]?)$/);
          if (commaMatch) {
            street = commaMatch[1].trim();
            houseNumber = commaMatch[2];
          } else if (!street) {
            // Fallback: usa la prima parte senza numero
            street = firstPart.replace(/\s*\d+\/?[A-Za-z]?\s*$/, '').trim();
          }
        }
      }
    }

    // Se ancora non abbiamo la via, usa quella dall'address
    if (!street) {
      street = addr.road || result.display_name.split(',')[0] || '';
    }

    // Trova la città (può essere in diversi campi)
    const city = addr.city || addr.town || addr.village || addr.municipality || '';

    // Trova la provincia
    const province = getProvinciaSigla(addr.county || addr.state);

    const parsed: ParsedAddress = {
      street,
      houseNumber,
      zipCode: addr.postcode || '',
      city,
      province
    };

    onChange(parsed.street);
    onAddressSelect(parsed);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelectAddress(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full pl-10 pr-10 p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none ${className}`}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 animate-spin" size={18} />
        )}
        {!isLoading && value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setSuggestions([]);
            }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Dropdown suggerimenti */}
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
          {suggestions.map((result, index) => (
            <li
              key={index}
              onClick={() => handleSelectAddress(result)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors ${
                index === selectedIndex
                  ? 'bg-primary/10 dark:bg-primary/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <div className="flex items-start gap-2">
                <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{result.display_name}</p>
                  {result.address.postcode && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      CAP: {result.address.postcode}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Nessun risultato */}
      {showSuggestions && suggestions.length === 0 && value.length >= 3 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Nessun indirizzo trovato
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
