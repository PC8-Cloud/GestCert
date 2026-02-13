import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { User, UserStatus, Role, Certificate, ImpresaEdile } from '../types';
import { Search, Plus, Upload, Lock, Unlock, Edit, Trash2, Save, X, Eye, Download, ChevronDown, ChevronUp, AlertCircle, FileText, CheckCircle, XCircle, Building2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { CertificateFilter } from './Dashboard';
import {
  validaCodiceFiscale,
  verificaCoerenza,
  generaCFParziale,
  estraiTuttiDatiDaCF,
  CoerenzaResult
} from '../lib/codiceFiscale';
import { useCertificateTypes } from '../lib/hooks';
import { formatDate } from '../lib/date';
import { STORAGE_MODE } from '../lib/config';
import { createSignedUrl, parseStorageUrl } from '../lib/storage';

// Helper per verificare certificati in base al filtro
// Logica CUMULATIVA: "entro 7 giorni" include oggi, "entro 30 giorni" include la settimana
function getUsersWithCertificateFilter(users: User[], filter: CertificateFilter): User[] {
  if (!filter) return users;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekFromNow = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthFromNow = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  return users.filter(user => {
    const certs = user.certificates || [];
    return certs.some(cert => {
      if (!cert.expiryDate) return false;
      const exp = new Date(cert.expiryDate);
      const expStart = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());

      switch (filter) {
        case 'today':
          // Solo oggi
          return expStart.getTime() === todayStart.getTime();
        case 'week':
          // Entro 7 giorni (include oggi) - CUMULATIVO
          return expStart >= todayStart && expStart <= weekFromNow;
        case 'month':
          // Entro 30 giorni (include settimana) - CUMULATIVO
          return expStart >= todayStart && expStart <= monthFromNow;
        case 'expired':
          // Già scaduti
          return expStart < todayStart;
        default:
          return true;
      }
    });
  });
}

// Label per i filtri certificati (logica cumulativa)
const certFilterLabels: Record<string, string> = {
  today: 'Scadono Oggi',
  week: 'Scadono Entro 7 Giorni',
  month: 'Scadono Entro 30 Giorni',
  expired: 'Già Scaduti'
};

// ============ CSV IMPORT UTILITIES ============

interface ImportResult {
  success: boolean;
  imported: number;
  errors: { row: number; field: string; message: string }[];
  skipped: number;
}

// Mappa intestazioni CSV -> campi User
const CSV_HEADER_MAP: Record<string, keyof User | 'ignore'> = {
  'cognome': 'lastName',
  'nome': 'firstName',
  'email': 'email',
  'codice fiscale': 'fiscalCode',
  'sesso': 'gender',
  'data nascita': 'birthDate',
  'luogo nascita': 'birthPlace',
  'paese nascita': 'birthCountry',
  'nazionalita': 'nationality',
  'indirizzo': 'address',
  'n. civico': 'houseNumber',
  'cap': 'zipCode',
  'citta': 'city',
  'provincia': 'province',
  'telefono': 'phone',
  'cellulare': 'mobile',
  'gruppo': 'group',
  'note': 'notes',
  'stato': 'status',
};

// Parse status string to UserStatus enum
function parseStatus(status: string): UserStatus {
  const normalized = status.toLowerCase().trim();
  if (normalized === 'sospeso') return UserStatus.SUSPENDED;
  if (normalized === 'bloccato') return UserStatus.LOCKED;
  return UserStatus.ACTIVE;
}

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate date format (YYYY-MM-DD or DD/MM/YYYY)
function isValidDate(date: string): boolean {
  // Formato ISO: AAAA-MM-GG
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const d = new Date(date);
    return !isNaN(d.getTime());
  }
  // Formato italiano: GG/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [day, month, year] = date.split('/');
    const d = new Date(`${year}-${month}-${day}`);
    return !isNaN(d.getTime());
  }
  return false;
}

// Convert date from DD/MM/YYYY to YYYY-MM-DD (if needed)
function normalizeDate(date: string): string {
  if (!date) return '';
  // Se è già in formato ISO, ritorna così
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  // Converti da formato italiano GG/MM/AAAA a AAAA-MM-GG
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [day, month, year] = date.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  // Prova anche con GG-MM-AAAA (trattini invece di slash)
  if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
    const [day, month, year] = date.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return date; // Ritorna il valore originale se non riconosciuto
}

// Parse CSV content
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect separator (semicolon or comma)
  const firstLine = lines[0];
  const separator = firstLine.includes(';') ? ';' : ',';

  const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    // Handle quoted fields
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === separator && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });

  return { headers, rows };
}

interface UsersProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  createUser: (user: Omit<User, 'id'>, skipEmailCheck?: boolean) => Promise<User>;
  updateUser: (id: string, user: Partial<User>) => Promise<User>;
  deleteUser: (id: string) => Promise<void>;
  deleteUsers: (ids: string[]) => Promise<void>;
  currentUserRole: Role;
  companies: ImpresaEdile[];
}

const Users: React.FC<UsersProps> = ({ users, setUsers, createUser, updateUser, deleteUser, deleteUsers, currentUserRole, companies }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [view, setView] = useState<'list' | 'edit' | 'create'>('list');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const hasUnsavedRef = useRef(false);
  const viewRef = useRef<'list' | 'edit' | 'create'>('list');

  // Stato per tracciare modifiche non salvate
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [sortOrder, setSortOrder] = useState<'lastName-asc' | 'lastName-desc' | 'createdAt-asc' | 'createdAt-desc'>('lastName-asc');
  const pendingLocationKey = useRef<string | null>(null);

  // Keep refs in sync for navigation guard
  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Torna alla lista quando si clicca sul menu Utenti
  useEffect(() => {
    // Reset alla lista quando si naviga a /users senza parametri specifici
    if (location.pathname === '/users' && !location.search.includes('edit=')) {
      // Se ci sono modifiche non salvate, mostra dialog
      if (!savingRef.current && hasUnsavedRef.current && (viewRef.current === 'edit' || viewRef.current === 'create') && pendingLocationKey.current !== location.key) {
        pendingLocationKey.current = location.key;
        setShowUnsavedDialog(true);
        return;
      }
      setView('list');
      setSelectedUser(null);
      setHasUnsavedChanges(false);
    }
  }, [location.key, location.pathname, location.search]); // trigger only on navigation

  // Import CSV state
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Filtro certificati da URL
  const certFilter = searchParams.get('certFilter') as CertificateFilter;

  // Rimuovi filtro certificati
  const clearCertFilter = () => {
    searchParams.delete('certFilter');
    setSearchParams(searchParams);
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const toggleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedIds(newSelected);
  };

  // Filter logic (moved up for toggleSelectAll to work)
  const filteredUsers = useMemo(() => {
    // Prima applica filtro certificati se presente
    let result = certFilter ? getUsersWithCertificateFilter(users, certFilter) : users;

    // Poi applica filtro ricerca testuale
    if (searchTerm) {
      result = result.filter(user =>
        user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.fiscalCode.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Applica ordinamento
    result = [...result].sort((a, b) => {
      switch (sortOrder) {
        case 'lastName-asc':
          return a.lastName.localeCompare(b.lastName, 'it');
        case 'lastName-desc':
          return b.lastName.localeCompare(a.lastName, 'it');
        case 'createdAt-asc':
          // Più vecchi prima
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        case 'createdAt-desc':
          // Più recenti prima
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        default:
          return 0;
      }
    });

    return result;
  }, [users, certFilter, searchTerm, sortOrder]);
  
  // Handlers
  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setView('edit');
  };

  const handleCreate = () => {
    setSelectedUser({
      id: Math.random().toString(36).substring(2, 11),
      firstName: '',
      lastName: '',
      email: '',
      fiscalCode: '',
      gender: 'M',
      birthDate: '',
      birthPlace: '',
      birthCountry: 'IT',
      nationality: 'IT',
      address: '',
      houseNumber: '',
      zipCode: '',
      city: '',
      province: '',
      status: UserStatus.ACTIVE,
      certificates: []
    });
    setView('create');
  };

  // Ref per accedere ai dati del form e alla funzione di salvataggio
  const formDataRef = useRef<User | null>(null);
  const saveFormRef = useRef<(() => Promise<boolean>) | null>(null);

  const handleSave = async (user: User, stayOnPage: boolean = false): Promise<User | null> => {
    if (savingRef.current) return null;
    savingRef.current = true;
    setIsSaving(true);
    try {
      let savedUser: User | null = null;
      if (view === 'create') {
        // Crea nuovo utente su Supabase
        const { id, ...userData } = user;
        savedUser = await createUser(userData);
      } else {
        // Aggiorna utente esistente su Supabase
        savedUser = await updateUser(user.id, user);
      }

      // Se stayOnPage è true (es. auto-save certificato), non cambiare view
      if (!stayOnPage) {
        setView('list');
        setSelectedUser(null);
      }
      setHasUnsavedChanges(false);
      return savedUser;
    } catch (error: unknown) {
      console.error('Errore durante il salvataggio:', error);
      let errorMsg = 'Errore sconosciuto';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (error && typeof error === 'object') {
        // Supabase error format
        const supaError = error as { message?: string; details?: string; hint?: string; code?: string };
        errorMsg = supaError.message || supaError.details || JSON.stringify(error);
      }
      if (/troppo grande|too large|54000/i.test(errorMsg)) {
        errorMsg = `File troppo grande. Riduci la dimensione (max 5 MB) o rimuovi l'allegato e riprova. Dettaglio: ${errorMsg}`;
      }
      alert(`Errore durante il salvataggio: ${errorMsg}`);
      return null;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Handler per salvare dal dialog
  const handleSaveFromDialog = async () => {
    if (isSaving) return;
    // Usa la funzione di salvataggio del form (include validazione)
    if (saveFormRef.current) {
      const success = await saveFormRef.current();
      if (success) {
        setShowUnsavedDialog(false);
        pendingLocationKey.current = null;
      } else {
        // Chiudi il dialog per mostrare gli errori di validazione
        setShowUnsavedDialog(false);
        pendingLocationKey.current = null;
      }
    }
  };

  // Handler per scartare le modifiche
  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    setHasUnsavedChanges(false);
    setView('list');
    setSelectedUser(null);
    pendingLocationKey.current = null;
  };

  // Handler per annullare (resta nel form)
  const handleCancelDialog = () => {
    setShowUnsavedDialog(false);
    pendingLocationKey.current = null;
  };
  
  const handleDelete = async (id: string) => {
    if (window.confirm('Sei sicuro di voler eliminare questo lavoratore?')) {
      try {
        await deleteUser(id);
      } catch (error) {
        console.error('Errore durante l\'eliminazione:', error);
        alert(`Errore durante l'eliminazione: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
      }
    }
  };

  const toggleStatus = async (user: User) => {
    const newStatus = user.status === UserStatus.LOCKED ? UserStatus.ACTIVE : UserStatus.LOCKED;
    try {
      await updateUser(user.id, { status: newStatus });
    } catch (error) {
      console.error('Errore durante il cambio stato:', error);
      alert(`Errore durante il cambio stato: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
    }
  };

  // ============ IMPORT CSV HANDLER ============
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    if (importFileRef.current) {
      importFileRef.current.value = '';
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const content = await file.text();
      const { headers, rows } = parseCSV(content);

      if (headers.length === 0 || rows.length === 0) {
        setImportResult({
          success: false,
          imported: 0,
          errors: [{ row: 0, field: 'file', message: 'File vuoto o formato non valido' }],
          skipped: 0
        });
        return;
      }

      // Map headers to field names
      const fieldMap: (keyof User | 'ignore' | null)[] = headers.map(h => CSV_HEADER_MAP[h] || null);

      // Verifica che ci sia almeno una colonna riconosciuta
      const recognizedFields = fieldMap.filter(f => f !== null);
      if (recognizedFields.length === 0) {
        setImportResult({
          success: false,
          imported: 0,
          errors: [{ row: 0, field: 'headers', message: 'Nessuna colonna riconosciuta. Verifica le intestazioni del file.' }],
          skipped: 0
        });
        return;
      }

      const newUsers: User[] = [];
      const errors: { row: number; field: string; message: string }[] = [];
      let skipped = 0;

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because row 1 is header, and we're 0-indexed

        // Skip empty rows
        if (row.every(cell => !cell.trim())) {
          skipped++;
          continue;
        }

        // Build user object
        const userData: Partial<User> = {
          id: `import-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          certificates: []
        };

        let rowHasError = false;

        for (let j = 0; j < fieldMap.length; j++) {
          const field = fieldMap[j];
          const value = row[j]?.trim() || '';

          if (!field || field === 'ignore') continue;

          if (field === 'status') {
            userData.status = parseStatus(value);
          } else if (field === 'gender') {
            const g = value.toUpperCase();
            if (g !== 'M' && g !== 'F') {
              errors.push({ row: rowNum, field: 'Sesso', message: `Valore non valido: "${value}" (usa M o F)` });
              rowHasError = true;
            } else {
              userData.gender = g as 'M' | 'F';
            }
          } else {
            (userData as Record<string, string>)[field] = value;
          }
        }

        // Validazione formato (non obbligatorietà per import)
        if (userData.email && !isValidEmail(userData.email)) {
          errors.push({ row: rowNum, field: 'Email', message: `Formato email non valido: "${userData.email}"` });
          rowHasError = true;
        }
        if (userData.birthDate && !isValidDate(userData.birthDate)) {
          errors.push({ row: rowNum, field: 'Data Nascita', message: `Formato data non valido: "${userData.birthDate}" (usa GG/MM/AAAA o AAAA-MM-GG)` });
          rowHasError = true;
        }

        // Check for duplicate email nel file stesso (non blocca, solo warning)
        if (userData.email) {
          const emailExistsInFile = newUsers.some(u => u.email && u.email.toLowerCase() === userData.email?.toLowerCase());
          if (emailExistsInFile) {
            // Solo warning, non blocca l'importazione
            console.warn(`Riga ${rowNum}: Email duplicata nel file: "${userData.email}"`);
          }
          // Email esistente nel DB: NON blocca più l'importazione
        }

        // Check for duplicate fiscal code (BLOCCA l'importazione SOLO se CF non vuoto)
        const cf = userData.fiscalCode?.trim().toUpperCase();
        if (cf && cf !== '' && cf !== '0') {
          const cfExistsInDb = users.some(u => u.fiscalCode && u.fiscalCode.toUpperCase() === cf);
          const cfExistsInFile = newUsers.some(u => u.fiscalCode && u.fiscalCode.toUpperCase() === cf);

          if (cfExistsInDb) {
            errors.push({ row: rowNum, field: 'Codice Fiscale', message: `Codice fiscale già esistente nel database: "${cf}" - riga saltata` });
            rowHasError = true;
          } else if (cfExistsInFile) {
            errors.push({ row: rowNum, field: 'Codice Fiscale', message: `Codice fiscale duplicato nel file: "${cf}" - riga saltata` });
            rowHasError = true;
          }
        }
        // Se CF è vuoto o "0", permetti l'importazione (non bloccare)

        if (!rowHasError) {
          // Set defaults for missing fields (tutti opzionali in import)
          const completeUser: User = {
            id: userData.id!,
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            email: userData.email || '',
            fiscalCode: userData.fiscalCode?.toUpperCase() || '',
            gender: userData.gender || 'M',
            birthDate: normalizeDate(userData.birthDate || ''),
            birthPlace: userData.birthPlace || '',
            birthCountry: userData.birthCountry || 'IT',
            nationality: userData.nationality || 'IT',
            address: userData.address || '',
            houseNumber: userData.houseNumber || '',
            zipCode: userData.zipCode || '',
            city: userData.city || '',
            province: userData.province?.toUpperCase() || '',
            phone: userData.phone || '',
            mobile: userData.mobile || '',
            group: userData.group || '',
            notes: userData.notes || '',
            status: userData.status || UserStatus.ACTIVE,
            certificates: []
          };
          newUsers.push(completeUser);
        }
      }

      // Add imported users to Supabase
      let importedCount = 0;
      if (newUsers.length > 0) {
        for (const user of newUsers) {
          try {
            const { id, ...userData } = user;
            // Usa createUser con skipEmailCheck=true per import
            const newUser = await createUser(userData, true);
            importedCount++;
          } catch (err) {
            errors.push({ row: 0, field: 'import', message: `Errore creazione ${user.lastName} ${user.firstName}: ${err instanceof Error ? err.message : 'Errore'}` });
          }
        }
      }

      setImportResult({
        success: errors.length === 0,
        imported: importedCount,
        errors: errors.slice(0, 20), // Limit to first 20 errors
        skipped
      });

    } catch (err) {
      console.error('Import error:', err);
      setImportResult({
        success: false,
        imported: 0,
        errors: [{ row: 0, field: 'file', message: `Errore nella lettura del file: ${err instanceof Error ? err.message : 'Errore sconosciuto'}` }],
        skipped: 0
      });
    } finally {
      setIsImporting(false);
      // Reset stato modifiche non salvate dopo importazione
      setHasUnsavedChanges(false);
    }
  };

  if (view === 'list') {
    return (
      <div className="space-y-4">
        {/* Filtro certificati attivo */}
        {certFilter && (
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertCircle size={20} />
              <span className="font-medium">
                Filtro attivo: <span className="font-bold">{certFilterLabels[certFilter]}</span>
              </span>
              <span className="text-amber-600 dark:text-amber-300">
                ({filteredUsers.length} lavoratori trovati)
              </span>
            </div>
            <button
              onClick={clearCertFilter}
              className="flex items-center gap-1 bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-800 dark:text-amber-200 px-3 py-1 rounded-md transition-colors text-sm font-medium"
            >
              <X size={16} /> Rimuovi filtro
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex gap-2 items-center">
            {selectedIds.size > 0 ? (
              <>
                <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                  {selectedIds.size} selezionati
                </span>
                {currentUserRole === Role.ADMIN && (
                  <button
                    onClick={async () => {
                      if (window.confirm(`Eliminare ${selectedIds.size} lavoratori selezionati?`)) {
                        try {
                          await deleteUsers(Array.from(selectedIds));
                          setSelectedIds(new Set());
                        } catch (error) {
                          console.error('Errore eliminazione multipla:', error);
                          alert(`Errore durante l'eliminazione: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
                        }
                      }
                    }}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
                  >
                    <Trash2 size={18} /> Elimina
                  </button>
                )}
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-2 bg-gray-500 hover:bg-gray-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
                >
                  <X size={18} /> Deseleziona
                </button>
              </>
            ) : (
              <>
                <button onClick={handleCreate} className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-4 py-2 rounded-md transition-colors text-sm font-medium">
                  <Plus size={18} /> Nuovo
                </button>
                {/* Hidden file input for CSV import */}
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleImportCSV}
                  className="hidden"
                />
                <button
                  onClick={() => importFileRef.current?.click()}
                  disabled={isImporting}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-green-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium relative group"
                  title="Importa lavoratori da file Excel (.xlsx o .csv). Scarica il modello dalla sezione Impostazioni."
                >
                  <Upload size={18} className={isImporting ? 'animate-pulse' : ''} />
                  {isImporting ? 'Importazione...' : 'Importa'}
                  {/* Tooltip informativo */}
                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                    Importa da Excel/CSV
                    <br />
                    <span className="text-gray-300">Scarica il modello da Impostazioni</span>
                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></span>
                  </span>
                </button>
              </>
            )}
          </div>
          
          <div className="flex gap-3 items-center flex-1 max-w-2xl">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
               <input
                 type="text"
                 placeholder="Cerca per nome, CF..."
                 className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
             <select
               value={sortOrder}
               onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
               className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 text-sm"
             >
               <option value="lastName-asc">Cognome A-Z</option>
               <option value="lastName-desc">Cognome Z-A</option>
               <option value="createdAt-desc">Più recenti</option>
               <option value="createdAt-asc">Più vecchi</option>
             </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs uppercase font-semibold">
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && selectedIds.size === filteredUsers.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
                <th className="p-4">Stato</th>
                <th className="p-4">Lavoratore</th>
                <th className="p-4">Codice Fiscale</th>
                <th className="p-4">Città</th>
                <th className="p-4">Email</th>
                <th className="p-4 text-center">Certificati</th>
                <th className="p-4 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(user.id)}
                      onChange={() => toggleSelectUser(user.id)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="p-4">
                     {user.status === UserStatus.LOCKED ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                           <Lock size={12} className="mr-1" /> Bloccato
                        </span>
                     ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                           Attivo
                        </span>
                     )}
                  </td>
                  <td className="p-4 font-medium text-gray-900 dark:text-white">
                    <button onClick={() => handleEdit(user)} className="hover:text-primary hover:underline">
                      {user.lastName} {user.firstName}
                    </button>
                  </td>
                  <td className="p-4 text-gray-500 dark:text-gray-400 font-mono">{user.fiscalCode}</td>
                  <td className="p-4 text-gray-500 dark:text-gray-400">{user.city} ({user.province})</td>
                  <td className="p-4 text-gray-500 dark:text-gray-400">{user.email}</td>
                  <td className="p-4 text-center">
                    <div className="relative inline-block group">
                      <button
                        type="button"
                        className="text-gray-700 dark:text-gray-200 font-medium"
                      >
                        {user.certificates?.length || 0}
                      </button>
                      <div className="absolute z-20 hidden group-hover:block group-focus-within:block left-1/2 -translate-x-1/2 mt-2 w-64 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 text-left">
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">
                          Certificati
                        </div>
                        {user.certificates && user.certificates.length > 0 ? (
                          <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                            {user.certificates.map(cert => (
                              <li key={cert.id} className="flex justify-between gap-2">
                                <span className="truncate">{cert.name}</span>
                                <span className="text-gray-500 dark:text-gray-400">
                                  {cert.expiryDate ? formatDate(cert.expiryDate) : '-'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Nessun certificato
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button onClick={() => toggleStatus(user)} className="text-gray-400 hover:text-yellow-600" title={user.status === UserStatus.LOCKED ? "Sblocca" : "Blocca"}>
                       {user.status === UserStatus.LOCKED ? <Unlock size={18}/> : <Lock size={18}/>}
                    </button>
                    <button onClick={() => handleEdit(user)} className="text-gray-400 hover:text-blue-600" title="Modifica">
                      <Edit size={18} />
                    </button>
                    {currentUserRole === Role.ADMIN && (
                      <button onClick={() => handleDelete(user.id)} className="text-gray-400 hover:text-red-600" title="Elimina">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                 <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400 dark:text-gray-500">Nessun lavoratore trovato</td>
                 </tr>
              )}
            </tbody>
          </table>
          <div className="bg-gray-50 dark:bg-gray-700 p-3 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center">
             <span>Visualizzati {filteredUsers.length} lavoratori</span>
             <div className="flex gap-1">
                <button className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50" disabled>Precedente</button>
                <button className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-300">1</button>
                <button className="px-2 py-1 border dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-gray-300">Successivo</button>
             </div>
          </div>
        </div>

        {/* Import Results Modal */}
        {importResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
              {/* Header */}
              <div className={`p-4 flex items-center gap-3 ${importResult.imported > 0 ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
                {importResult.imported > 0 ? (
                  <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
                ) : (
                  <XCircle className="text-red-600 dark:text-red-400" size={24} />
                )}
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white">
                    {importResult.imported > 0 ? 'Importazione Completata' : 'Importazione Fallita'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {importResult.imported} lavoratori importati
                    {importResult.skipped > 0 && `, ${importResult.skipped} righe vuote ignorate`}
                  </p>
                </div>
              </div>

              {/* Errors list */}
              {importResult.errors.length > 0 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-2">
                    <AlertCircle size={18} />
                    Errori riscontrati ({importResult.errors.length})
                  </h4>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                        {err.row > 0 && (
                          <span className="font-mono text-red-700 dark:text-red-300">Riga {err.row}: </span>
                        )}
                        <span className="font-medium text-red-800 dark:text-red-200">{err.field}</span>
                        <span className="text-red-600 dark:text-red-400"> - {err.message}</span>
                      </div>
                    ))}
                    {importResult.errors.length >= 20 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        Mostrati solo i primi 20 errori...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Success info */}
              {importResult.imported > 0 && importResult.errors.length === 0 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    Tutti i lavoratori sono stati importati correttamente.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => setImportResult(null)}
                  className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md font-medium transition-colors"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unsaved Changes Dialog */}
        {showUnsavedDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/30 flex items-center gap-3">
                <AlertCircle className="text-amber-600 dark:text-amber-400" size={24} />
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-white">Modifiche non salvate</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Ci sono modifiche non salvate. Cosa vuoi fare?
                  </p>
                </div>
              </div>
              <div className="p-4 flex gap-2 justify-end">
                <button
                  onClick={handleCancelDialog}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition-colors"
                >
                  Continua a modificare
                </button>
                <button
                  onClick={handleDiscardChanges}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-colors"
                >
                  Scarta modifiche
                </button>
                <button
                  onClick={handleSaveFromDialog}
                  disabled={isSaving}
                  className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md font-medium transition-colors flex items-center gap-2"
                >
                  <Save size={16} /> {isSaving ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Edit/Create Form
  return (
    <>
      <UserForm
        user={selectedUser!}
        onSave={handleSave}
        onCancel={() => {
          if (!isSaving && hasUnsavedChanges) {
            setShowUnsavedDialog(true);
          } else {
            setSelectedUser(null);
            setView('list');
          }
        }}
        isCreating={view === 'create'}
        isSaving={isSaving}
        onFormChange={(formData, hasChanges) => {
          formDataRef.current = formData;
          setHasUnsavedChanges(hasChanges);
        }}
        saveFormRef={saveFormRef}
        companies={companies}
      />

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/30 flex items-center gap-3">
              <AlertCircle className="text-amber-600 dark:text-amber-400" size={24} />
              <div>
                <h3 className="font-bold text-gray-800 dark:text-white">Modifiche non salvate</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Ci sono modifiche non salvate. Cosa vuoi fare?
                </p>
              </div>
            </div>
            <div className="p-4 flex gap-2 justify-end">
              <button
                onClick={handleCancelDialog}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition-colors"
              >
                Continua a modificare
              </button>
              <button
                onClick={handleDiscardChanges}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-colors"
              >
                Scarta modifiche
              </button>
              <button
                onClick={handleSaveFromDialog}
                className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md font-medium transition-colors flex items-center gap-2"
              >
                <Save size={16} /> Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Validation functions
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  fiscalCode?: string;
  birthDate?: string;
}

interface UserFormProps {
  user: User;
  onSave: (u: User, stayOnPage?: boolean) => Promise<User | null>;
  onCancel: () => void;
  isCreating: boolean;
  isSaving?: boolean;
  onFormChange?: (formData: User, hasChanges: boolean) => void;
  saveFormRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  companies: ImpresaEdile[];
}

const UserForm: React.FC<UserFormProps> = ({ user, onSave, onCancel, isCreating, isSaving = false, onFormChange, saveFormRef, companies }) => {
  // Carica i tipi di certificato dinamici da localStorage
  const { types: certificateTypes, loading: loadingCertTypes } = useCertificateTypes();
  const [formData, setFormData] = useState<User>(user);
  const originalUserRef = useRef<string>(JSON.stringify(user));
  const [activeSection, setActiveSection] = useState<string>('basic');

  // Notifica il parent quando i dati cambiano
  useEffect(() => {
    const hasChanges = JSON.stringify(formData) !== originalUserRef.current;
    onFormChange?.(formData, hasChanges);
  }, [formData, onFormChange]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [cfCoerenza, setCfCoerenza] = useState<CoerenzaResult | null>(null);
  const [cfManualEdit, setCfManualEdit] = useState(false); // True quando l'utente modifica manualmente il CF
  const [lastAutoGenCF, setLastAutoGenCF] = useState(''); // Ultimo CF auto-generato

  // Auto-genera CF progressivamente quando cambiano i dati (solo se non in modifica manuale)
  useEffect(() => {
    if (cfManualEdit) return; // Non auto-generare se l'utente sta modificando manualmente

    // Solo per paese Italia (i CF stranieri hanno formato diverso)
    if (formData.birthCountry !== 'IT') return;

    // Funzione async per generare CF
    const generateCF = async () => {
      const cfParziale = await generaCFParziale({
        nome: formData.firstName,
        cognome: formData.lastName,
        dataNascita: formData.birthDate,
        genere: formData.gender,
        luogoNascita: formData.birthPlace
      });

      if (cfParziale && cfParziale !== formData.fiscalCode) {
        setFormData(prev => ({ ...prev, fiscalCode: cfParziale }));
        setLastAutoGenCF(cfParziale);
      }
    };

    generateCF();
  }, [formData.firstName, formData.lastName, formData.birthDate, formData.gender, formData.birthPlace, formData.birthCountry, cfManualEdit]);

  // Verifica coerenza CF quando cambiano i dati rilevanti
  useEffect(() => {
    if (formData.fiscalCode && formData.fiscalCode.length === 16) {
      // Funzione async per verificare coerenza
      const checkCoerenza = async () => {
        const result = await verificaCoerenza(formData.fiscalCode, {
          nome: formData.firstName,
          cognome: formData.lastName,
          dataNascita: formData.birthDate,
          genere: formData.gender,
          luogoNascita: formData.birthPlace
        });
        setCfCoerenza(result);
      };
      checkCoerenza();
    } else {
      setCfCoerenza(null);
    }
  }, [formData.fiscalCode, formData.firstName, formData.lastName, formData.birthDate, formData.gender, formData.birthPlace]);

  // Handler per modifica manuale del CF
  const handleCFChange = async (value: string) => {
    const upperValue = value.toUpperCase();

    // Rileva se l'utente sta modificando manualmente (diverso dall'auto-generato)
    if (upperValue !== lastAutoGenCF) {
      setCfManualEdit(true);
    }

    // Se CF completo (16 caratteri), estrai i dati e compila automaticamente
    if (upperValue.length === 16) {
      const datiEstratti = await estraiTuttiDatiDaCF(upperValue);
      if (datiEstratti.valido) {
        setFormData(prev => ({
          ...prev,
          fiscalCode: upperValue,
          birthDate: datiEstratti.dataNascita || prev.birthDate,
          gender: datiEstratti.genere || prev.gender,
          birthPlace: datiEstratti.luogoNascita || prev.birthPlace,
          birthCountry: datiEstratti.luogoNascita ? 'IT' : prev.birthCountry
        }));
        return;
      }
    }

    setFormData(prev => ({ ...prev, fiscalCode: upperValue }));
  };

  // Reset modifica manuale quando i dati anagrafici cambiano significativamente
  const resetCFAutoGen = () => {
    setCfManualEdit(false);
    setLastAutoGenCF('');
  };

  const SectionHeader = ({ id, title }: { id: string, title: string }) => (
    <button
      type="button"
      onClick={() => setActiveSection(activeSection === id ? '' : id)}
      className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-b border-gray-200 dark:border-gray-600 font-semibold text-gray-700 dark:text-gray-200 text-left transition-colors"
    >
      {title}
      {activeSection === id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
  );

  // Formatta nome/cognome con iniziali maiuscole
  const formatName = (name: string): string => {
    if (!name) return name;
    // Se tutto maiuscolo o tutto minuscolo, formatta
    const isAllUpper = name === name.toUpperCase();
    const isAllLower = name === name.toLowerCase();

    if (isAllUpper || isAllLower) {
      return name
        .toLowerCase()
        .split(/(\s+|')/) // Splitta per spazi o apostrofi
        .map(part => {
          if (part.trim() === '' || part === "'") return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('');
    }
    return name;
  };

  const handleInputChange = (field: keyof User, value: string | Certificate[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Formatta e passa al campo successivo con Enter
  const handleNameBlur = (field: 'firstName' | 'lastName') => {
    const formatted = formatName(formData[field]);
    if (formatted !== formData[field]) {
      setFormData(prev => ({ ...prev, [field]: formatted }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, nextFieldId?: string, nextSection?: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Formatta se e' un campo nome
      const target = e.target as HTMLInputElement;
      const fieldName = target.name as 'firstName' | 'lastName';
      if (fieldName === 'firstName' || fieldName === 'lastName') {
        handleNameBlur(fieldName);
      }
      // Cambia sezione se necessario
      if (nextSection && nextSection !== activeSection) {
        setActiveSection(nextSection);
        // Focus dopo che la sezione si è aperta
        setTimeout(() => {
          if (nextFieldId) {
            const nextField = document.getElementById(nextFieldId);
            if (nextField) nextField.focus();
          }
        }, 50);
      } else if (nextFieldId) {
        const nextField = document.getElementById(nextFieldId);
        if (nextField) nextField.focus();
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Il nome è obbligatorio';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Il cognome è obbligatorio';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'L\'email è obbligatoria';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Inserisci un\'email valida';
    }

    if (!formData.fiscalCode.trim()) {
      newErrors.fiscalCode = 'Il codice fiscale è obbligatorio';
    } else {
      const cfValidation = validaCodiceFiscale(formData.fiscalCode);
      if (!cfValidation.valido) {
        newErrors.fiscalCode = cfValidation.errori[0] || 'Codice fiscale non valido';
      }
    }

    // Validazione data di nascita
    if (formData.birthDate) {
      const birthDate = new Date(formData.birthDate);
      const today = new Date();
      const birthYear = birthDate.getFullYear();

      // Verifica che la data sia valida
      if (isNaN(birthDate.getTime())) {
        newErrors.birthDate = 'Data di nascita non valida';
      }
      // Anno deve essere tra 1900 e anno corrente
      else if (birthYear < 1900 || birthYear > today.getFullYear()) {
        newErrors.birthDate = `Anno di nascita non valido. Inserisci un anno compreso tra 1900 e ${today.getFullYear()}`;
      }
      // Non può essere nato nel futuro
      else if (birthDate > today) {
        newErrors.birthDate = 'La data di nascita non può essere nel futuro';
      }
      // Deve avere almeno 14 anni (età minima lavorativa)
      else {
        const age = today.getFullYear() - birthYear;
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;

        if (actualAge < 14) {
          newErrors.birthDate = 'Il lavoratore deve avere almeno 14 anni';
        } else if (actualAge > 120) {
          newErrors.birthDate = 'Età non plausibile (oltre 120 anni)';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (): Promise<boolean> => {
    if (validateForm()) {
      const savedUser = await onSave(formData);
      if (savedUser) {
        setFormData(savedUser);
        originalUserRef.current = JSON.stringify(savedUser);
        onFormChange?.(savedUser, false);
        return true;
      }
      return false;
    } else {
      // Open the section with errors
      if (errors.firstName || errors.lastName || errors.email) {
        setActiveSection('basic');
      } else if (errors.birthDate || errors.fiscalCode) {
        setActiveSection('personal');
      }
      return false;
    }
  };

  // Esponi la funzione di salvataggio al parent tramite ref
  useEffect(() => {
    if (saveFormRef) {
      saveFormRef.current = handleSave;
    }
    return () => {
      if (saveFormRef) {
        saveFormRef.current = null;
      }
    };
  }, [formData, saveFormRef]);

  // Certificate Management State
  const [newCert, setNewCert] = useState<Partial<Certificate>>({ name: '', issueDate: '', expiryDate: '' });
  const [selectedCertType, setSelectedCertType] = useState(''); // Tipo selezionato dal dropdown
  const [customCertName, setCustomCertName] = useState(''); // Nome personalizzato per "Altro"
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAddingCert, setIsAddingCert] = useState(false); // Previene doppi click
  const [certError, setCertError] = useState<string | null>(null); // Errori certificati
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Genera ID univoco robusto per certificati
  const generateCertId = (): string => {
    // Usa crypto.randomUUID se disponibile, altrimenti fallback robusto
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback: timestamp + random più lungo
    return `cert-${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
  };

  // Gestisce la selezione del tipo di certificato
  const handleCertTypeChange = (value: string) => {
    setSelectedCertType(value);
    if (value && value !== 'altro') {
      setNewCert(prev => ({ ...prev, name: value }));
      setCustomCertName('');
    } else if (value === 'altro') {
      setNewCert(prev => ({ ...prev, name: customCertName }));
    } else {
      setNewCert(prev => ({ ...prev, name: '' }));
    }
  };

  // Gestisce il nome personalizzato
  const handleCustomCertNameChange = (value: string) => {
    setCustomCertName(value);
    setNewCert(prev => ({ ...prev, name: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type (PDF, images)
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        alert('Formato file non supportato. Usa PDF, JPG o PNG.');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        alert(`File troppo grande (${sizeMb} MB). Dimensione massima: 5 MB. Comprime il PDF o carica un file più leggero.`);
        return;
      }
      setSelectedFile(file);
    }
  };

  // Converte immagine in PDF
  const convertImageToPDF = (imageDataUrl: string, fileName: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Calcola dimensioni per A4
        const pdf = new jsPDF({
          orientation: img.width > img.height ? 'landscape' : 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;

        // Scala l'immagine per entrare nella pagina
        const maxWidth = pageWidth - (margin * 2);
        const maxHeight = pageHeight - (margin * 2);

        let imgWidth = img.width;
        let imgHeight = img.height;

        // Calcola il rapporto di scala
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        imgWidth = imgWidth * ratio;
        imgHeight = imgHeight * ratio;

        // Centra l'immagine
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        pdf.addImage(imageDataUrl, 'JPEG', x, y, imgWidth, imgHeight);

        // Converti in base64
        const pdfDataUrl = pdf.output('dataurlstring');
        resolve(pdfDataUrl);
      };
      img.src = imageDataUrl;
    });
  };

  const addCertificate = async () => {
    // Previeni doppi click - controllo rigoroso
    if (isAddingCert) {
      console.log('Aggiunta certificato già in corso, ignorato');
      return;
    }

    // Reset errori precedenti
    setCertError(null);

    if (!newCert.name || !newCert.expiryDate) {
      setCertError('Nome e data di scadenza sono obbligatori');
      return;
    }

    // Controllo duplicati: verifica se esiste già un certificato con lo stesso nome
    const existingCert = formData.certificates.find(
      c => c.name.toLowerCase().trim() === newCert.name!.toLowerCase().trim()
    );
    if (existingCert) {
      setCertError(`Esiste già un certificato "${newCert.name}". Rimuovilo prima di aggiungerne uno nuovo.`);
      return;
    }

    // Validazione data scadenza
    const expiryDate = new Date(newCert.expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Verifica che la data sia valida
    if (isNaN(expiryDate.getTime())) {
      setCertError('Data di scadenza non valida');
      return;
    }

    // Verifica che l'anno sia ragionevole (tra 1900 e 2100)
    const year = expiryDate.getFullYear();
    if (year < 1900 || year > 2100) {
      setCertError('Anno di scadenza non valido. Inserisci un anno compreso tra 1900 e 2100.');
      return;
    }

    // Verifica che il certificato non sia già scaduto
    if (expiryDate < today) {
      setCertError('Non è possibile inserire un certificato già scaduto.');
      return;
    }

    // Blocca immediatamente ulteriori click
    if (isAddingCert) {
      console.warn('Aggiunta già in corso, richiesta ignorata');
      return;
    }
    setIsAddingCert(true);

    // Salva il nome del certificato per il controllo duplicati
    const certName = newCert.name!.trim();

    // Funzione helper per finalizzare l'aggiunta (SOLO LOCALE, niente auto-save)
    const finalizeCertificate = (fileUrl?: string) => {
      // Controllo duplicati
      const alreadyExists = formData.certificates.some(
        c => c.name.toLowerCase() === certName.toLowerCase()
      );
      if (alreadyExists) {
        setCertError(`Certificato "${certName}" già presente.`);
        setIsAddingCert(false);
        return;
      }

      const cert: Certificate = {
        id: generateCertId(),
        name: certName,
        issueDate: newCert.issueDate || new Date().toISOString().split('T')[0],
        expiryDate: newCert.expiryDate!,
        fileUrl: fileUrl,
      };

      // Aggiorna SOLO lo stato locale (l'utente deve cliccare Salva)
      setFormData(prev => ({
        ...prev,
        certificates: [...prev.certificates, cert]
      }));

      // Reset form certificato
      setNewCert({ name: '', issueDate: '', expiryDate: '' });
      setSelectedCertType('');
      setCustomCertName('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsAddingCert(false);
    };

    if (selectedFile) {
      const reader = new FileReader();

      reader.onerror = () => {
        console.error('Errore lettura file');
        setCertError('Errore nella lettura del file');
        setIsAddingCert(false);
      };

      reader.onload = async () => {
        try {
          let fileUrl = reader.result as string;

          // Se è un'immagine, convertila in PDF
          if (selectedFile.type.startsWith('image/')) {
            fileUrl = await convertImageToPDF(fileUrl, newCert.name!);
          }

          finalizeCertificate(fileUrl);
        } catch (err) {
          console.error('Errore conversione PDF:', err);
          setCertError('Errore nella conversione del file in PDF');
          setIsAddingCert(false);
        }
      };

      reader.readAsDataURL(selectedFile);
    } else {
      // Senza file, aggiungi direttamente
      finalizeCertificate();
    }
  };

  // Converte data URL base64 in Blob
  const dataUrlToBlob = (dataUrl: string): Blob | null => {
    try {
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return null;

      const mimeType = matches[1];
      const base64Data = matches[2];

      // Converti base64 in Blob
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: mimeType });
    } catch {
      return null;
    }
  };

  const normalizeFileUrl = (fileUrl?: string | null): string | null => {
    if (!fileUrl) return null;
    const trimmed = fileUrl.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) {
      return trimmed;
    }

    // Heuristics for raw base64 (legacy data)
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      const base64 = trimmed.replace(/\s+/g, '');
      if (base64.startsWith('JVBER')) return `data:application/pdf;base64,${base64}`;
      if (base64.startsWith('/9j/')) return `data:image/jpeg;base64,${base64}`;
      if (base64.startsWith('iVBOR')) return `data:image/png;base64,${base64}`;
      return `data:application/octet-stream;base64,${base64}`;
    }

    return null;
  };

  // Visualizza PDF in nuova finestra
  const viewCertificate = async (cert: Certificate) => {
    let fileUrl = cert.fileUrl || '';
    const storageRef = parseStorageUrl(fileUrl);
    if (storageRef && STORAGE_MODE !== 'local') {
      try {
        fileUrl = await createSignedUrl(storageRef.bucket, storageRef.path);
      } catch (error) {
        console.error('Errore firma URL:', error);
        setCertError('Impossibile ottenere il link del certificato. Riprova.');
        return;
      }
    }

    const normalizedUrl = normalizeFileUrl(fileUrl);
    if (!normalizedUrl) {
      setCertError('Nessun file allegato a questo certificato');
      return;
    }

    try {
      let blob = dataUrlToBlob(normalizedUrl);
      if (!blob) {
        const response = await fetch(normalizedUrl);
        if (!response.ok) {
          throw new Error('Anteprima fallita');
        }
        blob = await response.blob();
      }

      // Crea Blob URL e apri in nuova finestra (nasconde il dominio)
      const blobUrl = URL.createObjectURL(blob);
      const newWindow = window.open(blobUrl, '_blank');

      // Revoca il Blob URL solo quando la finestra viene chiusa
      // o dopo un tempo ragionevole per file molto grandi
      if (newWindow) {
        // Prova a revocare quando la finestra si chiude
        const checkClosed = setInterval(() => {
          if (newWindow.closed) {
            clearInterval(checkClosed);
            URL.revokeObjectURL(blobUrl);
          }
        }, 1000);

        // Fallback: revoca dopo 5 minuti se la finestra è ancora aperta
        setTimeout(() => {
          clearInterval(checkClosed);
          URL.revokeObjectURL(blobUrl);
        }, 5 * 60 * 1000);
      } else {
        // Popup bloccato - revoca subito e informa l'utente
        URL.revokeObjectURL(blobUrl);
        setCertError('Popup bloccato. Consenti i popup per visualizzare il certificato.');
      }
    } catch (error) {
      console.error('Errore apertura certificato:', error);
      setCertError('Impossibile visualizzare il certificato. Prova a scaricarlo.');
    }
  };

  // Scarica certificato
  const downloadCertificate = async (cert: Certificate) => {
    let fileUrl = cert.fileUrl || '';
    const storageRef = parseStorageUrl(fileUrl);
    if (storageRef && STORAGE_MODE !== 'local') {
      try {
        fileUrl = await createSignedUrl(storageRef.bucket, storageRef.path);
      } catch (error) {
        console.error('Errore firma URL:', error);
        setCertError('Impossibile ottenere il link del certificato. Riprova.');
        return;
      }
    }

    const normalizedUrl = normalizeFileUrl(fileUrl);
    if (!normalizedUrl) {
      setCertError('Nessun file allegato a questo certificato');
      return;
    }

    try {
      // Determina l'estensione del file dal MIME type
      let extension = 'pdf';
      if (normalizedUrl.startsWith('data:')) {
        const mimeMatch = normalizedUrl.match(/^data:([^;]+)/);
        if (mimeMatch) {
          const mimeType = mimeMatch[1];
          if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') extension = 'jpg';
          else if (mimeType === 'image/png') extension = 'png';
          else if (mimeType === 'application/pdf') extension = 'pdf';
        }
      }

      // Crea nome file sicuro
      const safeFileName = cert.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ\s-_]/g, '').trim() || 'certificato';

      // Converti/recupera Blob per download affidabile (senza mostrare l'URL del DB)
      let blob = dataUrlToBlob(normalizedUrl);
      if (!blob) {
        const response = await fetch(normalizedUrl);
        if (!response.ok) {
          throw new Error('Download fallito');
        }
        blob = await response.blob();
      }

      // Usa Blob URL per download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${safeFileName}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Revoca Blob URL subito dopo il download
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error('Errore download certificato:', error);
      setCertError('Errore durante il download del certificato');
    }
  };

  const removeCertificate = (id: string) => {
    setFormData(prev => ({ ...prev, certificates: prev.certificates.filter(c => c.id !== id) }));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 max-w-4xl mx-auto overflow-hidden">
       <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">{isCreating ? 'Nuovo Lavoratore' : `Modifica ${formData.firstName} ${formData.lastName}`}</h2>
          <div className="flex gap-2">
             <button onClick={onCancel} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md text-sm font-medium">Annulla</button>
             <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                <Save size={18} /> {isSaving ? 'Salvataggio...' : 'Salva'}
             </button>
          </div>
       </div>

       <form onSubmit={(e) => e.preventDefault()} className="divide-y divide-gray-200">
          
          {/* Basic Info */}
          <div>
             <SectionHeader id="basic" title="Informazioni di Base" />
             {activeSection === 'basic' && (
               <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome*</label>
                    <input
                      id="field-firstName"
                      name="firstName"
                      type="text"
                      value={formData.firstName}
                      onChange={e => handleInputChange('firstName', e.target.value)}
                      onBlur={() => handleNameBlur('firstName')}
                      onKeyDown={e => handleKeyDown(e, 'field-lastName')}
                      maxLength={50}
                      className={`w-full p-2 border ${errors.firstName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
                    />
                    {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cognome*</label>
                    <input
                      id="field-lastName"
                      name="lastName"
                      type="text"
                      value={formData.lastName}
                      onChange={e => handleInputChange('lastName', e.target.value)}
                      onBlur={() => handleNameBlur('lastName')}
                      onKeyDown={e => handleKeyDown(e, 'field-email')}
                      maxLength={50}
                      className={`w-full p-2 border ${errors.lastName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
                    />
                    {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email*</label>
                    <input
                      id="field-email"
                      type="email"
                      value={formData.email}
                      onChange={e => handleInputChange('email', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, 'field-phone')}
                      maxLength={100}
                      className={`w-full p-2 border ${errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefono</label>
                    <input
                      id="field-phone"
                      type="tel"
                      value={formData.phone || ''}
                      onChange={e => handleInputChange('phone', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, 'field-birthDate', 'personal')}
                      maxLength={20}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                  </div>
               </div>
             )}
          </div>

          {/* Personal Info */}
           <div>
             <SectionHeader id="personal" title="Dati Personali" />
             {activeSection === 'personal' && (
               <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sesso</label>
                    <select value={formData.gender} onChange={e => handleInputChange('gender', e.target.value)} className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                       <option value="M">Maschio</option>
                       <option value="F">Femmina</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data di Nascita</label>
                    <input
                      id="field-birthDate"
                      type="date"
                      value={formData.birthDate}
                      onChange={e => handleInputChange('birthDate', e.target.value)}
                      min="1900-01-01"
                      max={new Date().toISOString().split('T')[0]}
                      className={`w-full p-2 border ${errors.birthDate ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
                    />
                    {errors.birthDate && <p className="text-red-500 text-xs mt-1">{errors.birthDate}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Paese di Nascita</label>
                    <select
                      value={formData.birthCountry}
                      onChange={e => {
                        handleInputChange('birthCountry', e.target.value);
                        if (e.target.value !== 'IT') {
                          setCfManualEdit(true); // Per nati all'estero, CF manuale
                        } else {
                          resetCFAutoGen(); // Per italiani, rigenera
                        }
                      }}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    >
                      <option value="IT">Italia</option>
                      <option value="DE">Germania</option>
                      <option value="FR">Francia</option>
                      <option value="GB">Regno Unito</option>
                      <option value="ES">Spagna</option>
                      <option value="CH">Svizzera</option>
                      <option value="BE">Belgio</option>
                      <option value="AT">Austria</option>
                      <option value="RO">Romania</option>
                      <option value="PL">Polonia</option>
                      <option value="MA">Marocco</option>
                      <option value="AL">Albania</option>
                      <option value="TN">Tunisia</option>
                      <option value="US">Stati Uniti</option>
                      <option value="OTHER">Altro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {formData.birthCountry === 'IT' ? 'Comune di Nascita' : 'Città di Nascita'}
                    </label>
                    <input
                      type="text"
                      value={formData.birthPlace}
                      onChange={e => handleInputChange('birthPlace', e.target.value)}
                      maxLength={100}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder={formData.birthCountry === 'IT' ? 'Es. Agrigento' : 'Es. Berlino'}
                    />
                    {cfManualEdit && formData.fiscalCode.length === 16 && !formData.birthPlace && formData.birthCountry === 'IT' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Comune non trovato nel database. Inseriscilo manualmente.
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Codice Fiscale*
                      {formData.birthCountry === 'IT' && !cfManualEdit && formData.fiscalCode && (
                        <span className="ml-2 text-xs font-normal text-blue-500">(auto-generato)</span>
                      )}
                      {cfManualEdit && (
                        <button
                          type="button"
                          onClick={resetCFAutoGen}
                          className="ml-2 text-xs font-normal text-gray-400 hover:text-primary underline"
                        >
                          rigenera automaticamente
                        </button>
                      )}
                    </label>
                    <input
                      id="field-fiscalCode"
                      type="text"
                      value={formData.fiscalCode}
                      onChange={e => handleCFChange(e.target.value)}
                      maxLength={16}
                      className={`w-full p-2 border ${errors.fiscalCode || (cfCoerenza && !cfCoerenza.coerente) ? 'border-red-500' : cfCoerenza?.coerente ? 'border-green-500' : 'border-gray-300 dark:border-gray-600'} dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none uppercase font-mono tracking-wider`}
                      placeholder={formData.birthCountry !== 'IT' ? 'Inserisci manualmente per nati all\'estero' : ''}
                    />
                    {errors.fiscalCode && <p className="text-red-500 text-xs mt-1">{errors.fiscalCode}</p>}
                    {formData.birthCountry === 'IT' && !cfManualEdit && (
                      <p className="text-xs text-gray-400 mt-1">Il CF si compila automaticamente con nome, cognome, data e luogo di nascita</p>
                    )}
                    {/* Mostra errori di coerenza */}
                    {cfCoerenza && !cfCoerenza.coerente && cfCoerenza.errori.length > 0 && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-xs">
                        <p className="font-semibold text-red-700 dark:text-red-300 mb-1">Incongruenze rilevate:</p>
                        <ul className="list-disc list-inside text-red-600 dark:text-red-400 space-y-0.5">
                          {cfCoerenza.errori.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      </div>
                    )}
                    {/* Mostra warnings */}
                    {cfCoerenza && cfCoerenza.warnings.length > 0 && (
                      <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded text-xs">
                        <ul className="list-disc list-inside text-amber-600 dark:text-amber-400">
                          {cfCoerenza.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                        </ul>
                      </div>
                    )}
                    {/* Indicatore CF valido e coerente */}
                    {cfCoerenza?.coerente && (
                      <p className="text-green-600 dark:text-green-400 text-xs mt-1 flex items-center gap-1">
                        <span>✓</span> Codice fiscale valido e coerente con i dati inseriti
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Indirizzo di Residenza</label>
                     <AddressAutocomplete
                       value={formData.address}
                       onChange={(value) => handleInputChange('address', value)}
                       onAddressSelect={(parsed) => {
                         setFormData(prev => ({
                           ...prev,
                           address: parsed.street,
                           houseNumber: parsed.houseNumber || prev.houseNumber,
                           zipCode: parsed.zipCode || prev.zipCode,
                           city: parsed.city || prev.city,
                           province: parsed.province || prev.province
                         }));
                       }}
                       placeholder="Cerca indirizzo (es. Via Roma, Agrigento)"
                     />
                     <p className="text-xs text-gray-400 mt-1">Inizia a digitare per cercare e auto-compilare i campi</p>
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N. Civico</label>
                     <input
                       type="text"
                       value={formData.houseNumber || ''}
                       onChange={e => handleInputChange('houseNumber', e.target.value)}
                       maxLength={10}
                       className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                       placeholder="123/A"
                     />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CAP</label>
                     <input type="text" value={formData.zipCode} onChange={e => handleInputChange('zipCode', e.target.value)} maxLength={5} className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono" placeholder="00000" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Città</label>
                     <input type="text" value={formData.city} onChange={e => handleInputChange('city', e.target.value)} maxLength={100} className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provincia</label>
                     <input type="text" value={formData.province} onChange={e => handleInputChange('province', e.target.value.toUpperCase())} maxLength={2} className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none uppercase font-mono" placeholder="AG" />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stato</label>
                     <select
                       value={formData.status}
                       onChange={e => handleInputChange('status', e.target.value)}
                       className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                     >
                       <option value={UserStatus.ACTIVE}>Attivo</option>
                       <option value={UserStatus.SUSPENDED}>Sospeso</option>
                       <option value={UserStatus.LOCKED}>Bloccato</option>
                     </select>
                  </div>
               </div>
             )}
          </div>

          {/* Certificates */}
          <div>
             <SectionHeader id="certs" title="Certificati e Attestazioni" />
             {activeSection === 'certs' && (
               <div className="p-6 animate-in slide-in-from-top-2 duration-200">

                  {/* Add New Cert */}
                  <div className={`bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600 mb-6 relative ${isAddingCert ? 'pointer-events-none' : ''}`}>
                     {/* Overlay durante il caricamento file */}
                     {isAddingCert && (
                       <div className="absolute inset-0 bg-white/70 dark:bg-gray-800/70 rounded-lg flex items-center justify-center z-10">
                         <div className="flex flex-col items-center gap-2">
                           <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                           <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Caricamento file...</span>
                         </div>
                       </div>
                     )}

                     <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Aggiungi Certificato</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div>
                           <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo Certificato</label>
                           <select
                              value={selectedCertType}
                              onChange={e => handleCertTypeChange(e.target.value)}
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                              disabled={loadingCertTypes || isAddingCert}
                           >
                              <option value="">Seleziona tipo...</option>
                              {certificateTypes.map(ct => (
                                <option key={ct.id} value={ct.name}>
                                  {ct.name}{ct.description ? ` (${ct.description})` : ''}
                                </option>
                              ))}
                              <option value="altro">Altro...</option>
                           </select>
                        </div>
                        {selectedCertType === 'altro' && (
                          <div>
                             <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nome Certificato Personalizzato</label>
                             <input
                                type="text"
                                value={customCertName}
                                onChange={e => handleCustomCertNameChange(e.target.value)}
                                maxLength={100}
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                                placeholder="Es. Attestato Formazione Specifica"
                                disabled={isAddingCert}
                             />
                          </div>
                        )}
                        <div>
                           <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Data Scadenza</label>
                           <input type="date" value={newCert.expiryDate} onChange={e => setNewCert({...newCert, expiryDate: e.target.value})} className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm" disabled={isAddingCert} />
                        </div>
                     </div>
                     <div className="flex gap-2 items-end">
                        <input
                           type="file"
                           ref={fileInputRef}
                           onChange={handleFileSelect}
                           accept=".pdf,.jpg,.jpeg,.png"
                           className="hidden"
                           disabled={isAddingCert}
                        />
                        <button
                           type="button"
                           onClick={() => fileInputRef.current?.click()}
                           disabled={isAddingCert}
                           className={`flex-1 px-3 py-2 border ${selectedFile ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'} rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed`}
                           title={selectedFile ? selectedFile.name : 'Seleziona file (opzionale)'}
                        >
                           <Upload size={14} /> {selectedFile ? selectedFile.name.substring(0, 15) + '...' : 'Allega File'}
                        </button>
                        <button
                           onClick={addCertificate}
                           disabled={!newCert.name || !newCert.expiryDate || isAddingCert}
                           className="px-4 py-2 bg-secondary text-white rounded hover:bg-primary transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           {isAddingCert ? 'Caricamento...' : 'Aggiungi Certificato'}
                        </button>
                     </div>

                     {/* Messaggio di errore certificati */}
                     {certError && (
                       <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-2">
                         <AlertCircle className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" size={16} />
                         <div className="flex-1">
                           <p className="text-red-700 dark:text-red-300 text-sm">{certError}</p>
                         </div>
                         <button
                           onClick={() => setCertError(null)}
                           className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
                         >
                           <X size={16} />
                         </button>
                       </div>
                     )}
                  </div>

                  {/* List */}
                  {formData.certificates.length > 0 ? (
                     <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                           <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium border-b dark:border-gray-600">
                              <tr>
                                 <th className="p-3">Nome</th>
                                <th className="p-3">Registrati</th>
                                 <th className="p-3">Scadenza</th>
                                 <th className="p-3 text-right">Azioni</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y dark:divide-gray-600">
                              {formData.certificates.map(cert => (
                                 <tr key={cert.id}>
                                    <td className="p-3 font-medium dark:text-white">{cert.name}</td>
                                    <td className="p-3 text-gray-500 dark:text-gray-400">{cert.issueDate ? formatDate(cert.issueDate) : '-'}</td>
                                    <td className="p-3">
                                       {cert.expiryDate ? (
                                         <span className={`px-2 py-1 rounded text-xs font-semibold ${(() => {
                                           const expiry = new Date(cert.expiryDate);
                                           const today = new Date();
                                           expiry.setHours(23, 59, 59, 999);
                                           today.setHours(0, 0, 0, 0);
                                           return expiry < today;
                                         })() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                            {formatDate(cert.expiryDate)}
                                         </span>
                                       ) : (
                                         <span className="text-gray-400 text-xs">N/D</span>
                                       )}
                                    </td>
                                    <td className="p-3 text-right space-x-2">
                                       {cert.fileUrl ? (
                                         <>
                                           <button
                                             onClick={() => viewCertificate(cert)}
                                             className="text-gray-400 hover:text-blue-600"
                                             title="Visualizza PDF"
                                           >
                                             <Eye size={16} />
                                           </button>
                                           <button
                                             onClick={() => downloadCertificate(cert)}
                                             className="text-gray-400 hover:text-green-600"
                                             title="Scarica PDF"
                                           >
                                             <Download size={16} />
                                           </button>
                                         </>
                                       ) : (
                                         <>
                                           <button className="text-gray-300 cursor-not-allowed" title="Nessun file"><Eye size={16} /></button>
                                           <button className="text-gray-300 cursor-not-allowed" title="Nessun file"><Download size={16} /></button>
                                         </>
                                       )}
                                       <button onClick={() => removeCertificate(cert.id)} className="text-gray-400 hover:text-red-600" title="Elimina"><Trash2 size={16} /></button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  ) : (
                     <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">Nessun certificato caricato.</p>
                  )}
               </div>
             )}

             {/* Sezione Azienda */}
             <SectionHeader id="company" title="Azienda" />
             {activeSection === 'company' && (
               <div className="p-6 animate-in slide-in-from-top-2 duration-200">
                 <div className="mb-4">
                   <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                     <Building2 size={16} className="inline mr-1 mb-0.5" />
                     Impresa Edile
                   </label>
                   <select
                     value={formData.companyId || ''}
                     onChange={(e) => setFormData(prev => ({ ...prev, companyId: e.target.value || undefined }))}
                     className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
                   >
                     <option value="">-- Nessuna azienda --</option>
                     {companies
                       .filter(c => c.status === 'Attivo')
                       .sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale, 'it'))
                       .map(c => (
                         <option key={c.id} value={c.id}>
                           {c.ragioneSociale} — P.IVA {c.partitaIva}
                         </option>
                       ))
                     }
                   </select>
                 </div>

                 {/* Riepilogo impresa selezionata */}
                 {formData.companyId && (() => {
                   const selected = companies.find(c => c.id === formData.companyId);
                   if (!selected) return null;
                   return (
                     <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-sm">
                       <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                         <Building2 size={16} />
                         {selected.ragioneSociale}
                       </h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                         <div>
                           <span className="text-xs text-gray-500 dark:text-gray-400">Indirizzo:</span>
                           <p>{selected.address}{selected.houseNumber ? `, ${selected.houseNumber}` : ''} — {selected.zipCode} {selected.city} ({selected.province})</p>
                         </div>
                         {selected.pec && (
                           <div>
                             <span className="text-xs text-gray-500 dark:text-gray-400">PEC:</span>
                             <p>{selected.pec}</p>
                           </div>
                         )}
                         {selected.phone && (
                           <div>
                             <span className="text-xs text-gray-500 dark:text-gray-400">Telefono:</span>
                             <p>{selected.phone}</p>
                           </div>
                         )}
                       </div>
                     </div>
                   );
                 })()}
               </div>
             )}
          </div>
       </form>
    </div>
  );
};

export default Users;
