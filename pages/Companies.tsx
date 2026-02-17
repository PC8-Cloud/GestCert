import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ImpresaEdile, CompanyDocument, UserStatus, Role, User } from '../types';
import { Search, Plus, Upload, Edit, Trash2, Save, X, AlertCircle, FileText, Loader2, CheckCircle, Globe, Eye, Download, Users as UsersIcon, UserPlus, UserMinus, Lock, Unlock, XCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { formatDate } from '../lib/date';
import { lookupPartitaIva } from '../lib/viesService';
import { createSignedUrl, parseStorageUrl } from '../lib/storage';
import { STORAGE_MODE } from '../lib/config';

interface CompaniesProps {
  companies: ImpresaEdile[];
  createCompany: (company: Omit<ImpresaEdile, 'id'>) => Promise<ImpresaEdile>;
  updateCompany: (id: string, company: Partial<ImpresaEdile>) => Promise<ImpresaEdile>;
  deleteCompany: (id: string) => Promise<void>;
  deleteCompanies: (ids: string[]) => Promise<void>;
  currentUserRole: Role;
  users: User[];
  updateUser: (id: string, user: Partial<User>) => Promise<User>;
}

// Document types for companies
const COMPANY_DOC_TYPES = [
  'DURC',
  'Visura Camerale',
  'MUT',
  'PSC',
  'Domanda di Iscrizione',
  'Certificato SOA',
  'Polizza Assicurativa',
  'Altro',
];

const FORME_GIURIDICHE = [
  '', 'SRL', 'SRLS', 'SPA', 'SAPA', 'SNC', 'SAS', 'SS',
  'Ditta Individuale', 'Cooperativa', 'Consorzio', 'Altro'
];

// ============ CSV IMPORT/EXPORT UTILITIES ============

interface ImportResult {
  success: boolean;
  imported: number;
  errors: { row: number; field: string; message: string }[];
  skipped: number;
}

const CSV_COMPANY_HEADER_MAP: Record<string, keyof ImpresaEdile | 'ignore'> = {
  'partita iva': 'partitaIva',
  'ragione sociale': 'ragioneSociale',
  'forma giuridica': 'formaGiuridica',
  'codice fiscale': 'codiceFiscale',
  'codice rea': 'codiceREA',
  'pec': 'pec',
  'email': 'email',
  'telefono': 'phone',
  'cellulare': 'mobile',
  'indirizzo': 'address',
  'n. civico': 'houseNumber',
  'cap': 'zipCode',
  'citta': 'city',
  'provincia': 'province',
  'codice ateco': 'codiceAteco',
  'note': 'notes',
  'stato': 'status',
};

const CSV_EXPORT_HEADERS = [
  'Partita IVA', 'Ragione Sociale', 'Forma Giuridica', 'Codice Fiscale', 'Codice REA',
  'PEC', 'Email', 'Telefono', 'Cellulare', 'Indirizzo', 'N. Civico', 'CAP', 'Citta',
  'Provincia', 'Codice ATECO', 'Note',
];

const CSV_EXPORT_FIELDS: (keyof ImpresaEdile)[] = [
  'partitaIva', 'ragioneSociale', 'formaGiuridica', 'codiceFiscale', 'codiceREA',
  'pec', 'email', 'phone', 'mobile', 'address', 'houseNumber', 'zipCode', 'city',
  'province', 'codiceAteco', 'notes',
];

function parseCompanyStatus(status: string): UserStatus {
  const normalized = status.toLowerCase().trim();
  if (normalized === 'sospeso') return UserStatus.SUSPENDED;
  if (normalized === 'bloccato') return UserStatus.LOCKED;
  return UserStatus.ACTIVE;
}

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const firstLine = lines[0];
  const separator = firstLine.includes(';') ? ';' : ',';

  const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
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

function getDocumentExpiryStatus(expiryDate: string): { color: string; label: string } {
  if (!expiryDate) return { color: 'gray', label: 'N/D' };

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const exp = new Date(expiryDate);
  const expStart = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const daysUntilExpiry = Math.ceil((expStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiry < 0) return { color: 'red', label: 'Scaduto' };
  if (daysUntilExpiry === 0) return { color: 'red', label: 'Scade oggi' };
  if (daysUntilExpiry <= 7) return { color: 'orange', label: `Scade tra ${daysUntilExpiry}g` };
  if (daysUntilExpiry <= 30) return { color: 'yellow', label: `Scade tra ${daysUntilExpiry}g` };
  return { color: 'green', label: 'Valido' };
}

const statusColorMap: Record<string, string> = {
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

const Companies: React.FC<CompaniesProps> = ({ companies, createCompany, updateCompany, deleteCompany, deleteCompanies, currentUserRole, users, updateUser }) => {
  const location = useLocation();
  const [view, setView] = useState<'list' | 'edit' | 'create'>('list');
  const [selectedCompany, setSelectedCompany] = useState<ImpresaEdile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'ragioneSociale-asc' | 'ragioneSociale-desc' | 'createdAt-asc' | 'createdAt-desc'>('ragioneSociale-asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const hasUnsavedRef = useRef(false);
  const viewRef = useRef<'list' | 'edit' | 'create'>('list');
  const saveFormRef = useRef<(() => Promise<boolean>) | null>(null);

  // Import CSV state
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Stato per tracciare modifiche non salvate
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingLocationKey = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { hasUnsavedRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { savingRef.current = isSaving; }, [isSaving]);

  // Torna alla lista quando si clicca sul menu Imprese Edili
  useEffect(() => {
    if (location.pathname === '/companies') {
      if (!savingRef.current && hasUnsavedRef.current && (viewRef.current === 'edit' || viewRef.current === 'create') && pendingLocationKey.current !== location.key) {
        pendingLocationKey.current = location.key;
        setShowUnsavedDialog(true);
        return;
      }
      if (viewRef.current !== 'list' && !hasUnsavedRef.current) {
        setView('list');
        setSelectedCompany(null);
        setHasUnsavedChanges(false);
      }
    }
  }, [location.key, location.pathname]);

  // Filter & sort
  const filteredCompanies = useMemo(() => {
    let result = companies;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.ragioneSociale.toLowerCase().includes(term) ||
        c.partitaIva.includes(term) ||
        c.city.toLowerCase().includes(term) ||
        (c.pec || '').toLowerCase().includes(term)
      );
    }
    return [...result].sort((a, b) => {
      switch (sortOrder) {
        case 'ragioneSociale-asc':
          return a.ragioneSociale.localeCompare(b.ragioneSociale, 'it');
        case 'ragioneSociale-desc':
          return b.ragioneSociale.localeCompare(a.ragioneSociale, 'it');
        case 'createdAt-desc':
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        case 'createdAt-asc':
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        default:
          return 0;
      }
    });
  }, [companies, searchTerm, sortOrder]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCompanies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCompanies.map(c => c.id)));
    }
  };

  const toggleSelectCompany = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleEdit = (company: ImpresaEdile) => {
    setSelectedCompany(company);
    setView('edit');
  };

  const handleCreate = () => {
    setSelectedCompany({
      id: '',
      partitaIva: '',
      ragioneSociale: '',
      address: '',
      zipCode: '',
      city: '',
      province: '',
      status: UserStatus.ACTIVE,
      documents: [],
    });
    setView('create');
  };

  const handleSave = async (company: ImpresaEdile) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (view === 'create') {
        const { id, ...data } = company;
        await createCompany(data);
      } else {
        await updateCompany(company.id, company);
      }
      setHasUnsavedChanges(false);
      setView('list');
      setSelectedCompany(null);
    } catch (error: unknown) {
      console.error('Errore durante il salvataggio:', error);
      const msg = error instanceof Error ? error.message
        : (typeof error === 'object' && error !== null && 'message' in error) ? String((error as Record<string, unknown>).message)
        : 'Errore sconosciuto';
      alert(`Errore durante il salvataggio: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler per salvare dal dialog modifiche non salvate
  const handleSaveFromDialog = async () => {
    if (isSaving) return;
    if (saveFormRef.current) {
      const success = await saveFormRef.current();
      if (success) {
        setShowUnsavedDialog(false);
        pendingLocationKey.current = null;
      } else {
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
    setSelectedCompany(null);
    pendingLocationKey.current = null;
  };

  // Handler per annullare (resta nel form)
  const handleCancelDialog = () => {
    setShowUnsavedDialog(false);
    pendingLocationKey.current = null;
  };

  // ============ IMPORT CSV HANDLER ============
  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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
          success: false, imported: 0, skipped: 0,
          errors: [{ row: 0, field: 'file', message: 'File vuoto o formato non valido' }],
        });
        return;
      }

      const fieldMap: (keyof ImpresaEdile | 'ignore' | null)[] = headers.map(h => CSV_COMPANY_HEADER_MAP[h] || null);
      const recognizedFields = fieldMap.filter(f => f !== null);
      if (recognizedFields.length === 0) {
        setImportResult({
          success: false, imported: 0, skipped: 0,
          errors: [{ row: 0, field: 'headers', message: 'Nessuna colonna riconosciuta. Verifica le intestazioni del file.' }],
        });
        return;
      }

      const newCompanies: Omit<ImpresaEdile, 'id'>[] = [];
      const errors: { row: number; field: string; message: string }[] = [];
      let skipped = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        if (row.every(cell => !cell.trim())) {
          skipped++;
          continue;
        }

        const companyData: Record<string, string> = {};
        let statusValue: UserStatus = UserStatus.ACTIVE;

        for (let j = 0; j < fieldMap.length; j++) {
          const field = fieldMap[j];
          const value = row[j]?.trim() || '';
          if (!field || field === 'ignore') continue;

          if (field === 'status') {
            statusValue = parseCompanyStatus(value);
          } else {
            companyData[field] = value;
          }
        }

        let rowHasError = false;

        // Validazione P.IVA: 11 cifre
        const piva = companyData.partitaIva || '';
        if (!piva || !/^\d{11}$/.test(piva)) {
          errors.push({ row: rowNum, field: 'Partita IVA', message: `P.IVA non valida: "${piva}" (deve essere di 11 cifre)` });
          rowHasError = true;
        } else {
          // Duplicato nel file
          const pivaInFile = newCompanies.some(c => c.partitaIva === piva);
          if (pivaInFile) {
            errors.push({ row: rowNum, field: 'Partita IVA', message: `P.IVA duplicata nel file: "${piva}" - riga saltata` });
            rowHasError = true;
          }
          // Duplicato nel DB
          const pivaInDb = companies.some(c => c.partitaIva === piva);
          if (pivaInDb) {
            errors.push({ row: rowNum, field: 'Partita IVA', message: `P.IVA già esistente nel database: "${piva}" - riga saltata` });
            rowHasError = true;
          }
        }

        // Ragione Sociale obbligatoria
        if (!companyData.ragioneSociale || !companyData.ragioneSociale.trim()) {
          errors.push({ row: rowNum, field: 'Ragione Sociale', message: 'Ragione Sociale obbligatoria' });
          rowHasError = true;
        }

        if (!rowHasError) {
          newCompanies.push({
            partitaIva: companyData.partitaIva || '',
            ragioneSociale: companyData.ragioneSociale || '',
            formaGiuridica: companyData.formaGiuridica || '',
            codiceFiscale: companyData.codiceFiscale || '',
            codiceREA: companyData.codiceREA || '',
            pec: companyData.pec || '',
            email: companyData.email || '',
            phone: companyData.phone || '',
            mobile: companyData.mobile || '',
            address: companyData.address || '',
            houseNumber: companyData.houseNumber || '',
            zipCode: companyData.zipCode || '',
            city: companyData.city || '',
            province: (companyData.province || '').toUpperCase().slice(0, 2),
            codiceAteco: companyData.codiceAteco || '',
            notes: companyData.notes || '',
            status: statusValue,
            documents: [],
          });
        }
      }

      let importedCount = 0;
      for (const companyObj of newCompanies) {
        try {
          await createCompany(companyObj);
          importedCount++;
        } catch (err) {
          errors.push({ row: 0, field: 'import', message: `Errore creazione "${companyObj.ragioneSociale}": ${err instanceof Error ? err.message : 'Errore'}` });
        }
      }

      setImportResult({
        success: errors.length === 0,
        imported: importedCount,
        errors: errors.slice(0, 20),
        skipped,
      });

    } catch (err) {
      console.error('Import error:', err);
      setImportResult({
        success: false, imported: 0, skipped: 0,
        errors: [{ row: 0, field: 'file', message: `Errore nella lettura del file: ${err instanceof Error ? err.message : 'Errore sconosciuto'}` }],
      });
    } finally {
      setIsImporting(false);
    }
  };

  // ============ EXPORT CSV HANDLER ============
  const handleExportCSV = () => {
    const dataToExport = filteredCompanies;
    if (dataToExport.length === 0) {
      alert('Nessuna impresa da esportare.');
      return;
    }

    const csvRows: string[] = [];
    csvRows.push(CSV_EXPORT_HEADERS.join(';'));

    for (const company of dataToExport) {
      const row = CSV_EXPORT_FIELDS.map(field => {
        const value = (company[field] as string) || '';
        // Escape semicolons and quotes
        if (value.includes(';') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(row.join(';'));
    }

    const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM for Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `imprese_edili_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Sei sicuro di voler eliminare questa impresa?')) {
      try {
        await deleteCompany(id);
      } catch (error) {
        const msg = error instanceof Error ? error.message
              : (typeof error === 'object' && error !== null && 'message' in error) ? String((error as Record<string, unknown>).message)
              : 'Errore sconosciuto';
            alert(`Errore durante l'eliminazione: ${msg}`);
      }
    }
  };

  // ==================== LIST VIEW ====================
  if (view === 'list') {
    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex gap-2 items-center">
            {selectedIds.size > 0 ? (
              <>
                <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                  {selectedIds.size} selezionate
                </span>
                {currentUserRole === Role.ADMIN && (
                  <button
                    onClick={async () => {
                      if (window.confirm(`Eliminare ${selectedIds.size} imprese selezionate?`)) {
                        try {
                          await deleteCompanies(Array.from(selectedIds));
                          setSelectedIds(new Set());
                        } catch (error) {
                          const msg = error instanceof Error ? error.message
                            : (typeof error === 'object' && error !== null && 'message' in error) ? String((error as Record<string, unknown>).message)
                            : 'Errore sconosciuto';
                          alert(`Errore durante l'eliminazione: ${msg}`);
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
                  <Plus size={18} /> Nuova Impresa
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
                  title="Importa imprese da file CSV"
                >
                  <Upload size={18} className={isImporting ? 'animate-pulse' : ''} />
                  {isImporting ? 'Importazione...' : 'Importa'}
                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                    Importa da CSV
                    <br />
                    <span className="text-gray-300">Scarica il modello da Impostazioni</span>
                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></span>
                  </span>
                </button>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
                  title="Esporta imprese in CSV"
                >
                  <Download size={18} /> Esporta
                </button>
              </>
            )}
          </div>

          <div className="flex gap-3 items-center flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Cerca per ragione sociale, P.IVA, citta, PEC..."
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
              <option value="ragioneSociale-asc">Ragione Sociale A-Z</option>
              <option value="ragioneSociale-desc">Ragione Sociale Z-A</option>
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
                    checked={filteredCompanies.length > 0 && selectedIds.size === filteredCompanies.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
                <th className="p-4">Stato</th>
                <th className="p-4">Ragione Sociale</th>
                <th className="p-4">P.IVA</th>
                <th className="p-4">Citta</th>
                <th className="p-4">PEC</th>
                <th className="p-4 text-center">Documenti</th>
                <th className="p-4 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
              {filteredCompanies.map(company => (
                <tr key={company.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(company.id)}
                      onChange={() => toggleSelectCompany(company.id)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="p-4">
                    {company.status === UserStatus.ACTIVE ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Attivo
                      </span>
                    ) : company.status === UserStatus.SUSPENDED ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Sospeso
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Bloccato
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-medium text-gray-900 dark:text-white">
                    <button onClick={() => handleEdit(company)} className="hover:text-primary hover:underline">
                      {company.ragioneSociale}
                    </button>
                  </td>
                  <td className="p-4 text-gray-500 dark:text-gray-400 font-mono">{company.partitaIva}</td>
                  <td className="p-4 text-gray-500 dark:text-gray-400">{company.city}{company.province ? ` (${company.province})` : ''}</td>
                  <td className="p-4 text-gray-500 dark:text-gray-400 text-xs">{company.pec || '-'}</td>
                  <td className="p-4 text-center">
                    <div className="relative inline-block group">
                      <button type="button" className="text-gray-700 dark:text-gray-200 font-medium">
                        {company.documents?.length || 0}
                      </button>
                      <div className="absolute z-20 hidden group-hover:block group-focus-within:block left-1/2 -translate-x-1/2 mt-2 w-64 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 text-left">
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Documenti</div>
                        {company.documents && company.documents.length > 0 ? (
                          <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                            {company.documents.map(doc => {
                              const status = getDocumentExpiryStatus(doc.expiryDate);
                              return (
                                <li key={doc.id} className="flex justify-between gap-2 items-center">
                                  <span className="truncate">{doc.name}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusColorMap[status.color]}`}>
                                    {status.label}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div className="text-xs text-gray-500 dark:text-gray-400">Nessun documento</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button onClick={() => handleEdit(company)} className="text-gray-400 hover:text-blue-600" title="Modifica">
                      <Edit size={18} />
                    </button>
                    {currentUserRole === Role.ADMIN && (
                      <button onClick={() => handleDelete(company.id)} className="text-gray-400 hover:text-red-600" title="Elimina">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredCompanies.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400 dark:text-gray-500">Nessuna impresa trovata</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="bg-gray-50 dark:bg-gray-700 p-3 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
            Visualizzate {filteredCompanies.length} imprese
          </div>
        </div>

        {/* Import Results Modal */}
        {importResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
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
                    {importResult.imported} imprese importate
                    {importResult.skipped > 0 && `, ${importResult.skipped} righe vuote ignorate`}
                  </p>
                </div>
              </div>

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

              {importResult.imported > 0 && importResult.errors.length === 0 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    Tutte le imprese sono state importate correttamente.
                  </p>
                </div>
              )}

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
      </div>
    );
  }

  // ==================== FORM VIEW (create/edit) ====================
  return (
    <>
      <CompanyForm
        company={selectedCompany!}
        isCreating={view === 'create'}
        isSaving={isSaving}
        onSave={handleSave}
        onCancel={() => {
          if (!isSaving && hasUnsavedChanges) {
            setShowUnsavedDialog(true);
          } else {
            setSelectedCompany(null);
            setView('list');
          }
        }}
        users={users}
        updateUser={updateUser}
        onFormChange={(_formData, hasChanges) => {
          setHasUnsavedChanges(hasChanges);
        }}
        saveFormRef={saveFormRef}
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
                disabled={isSaving}
                className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md font-medium transition-colors flex items-center gap-2"
              >
                <Save size={16} /> {isSaving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ==================== LINKED WORKERS SECTION ====================

interface LinkedWorkersSectionProps {
  formData: ImpresaEdile;
  isCreating: boolean;
  users: User[];
  updateUser: (id: string, user: Partial<User>) => Promise<User>;
}

const LinkedWorkersSection: React.FC<LinkedWorkersSectionProps> = ({ formData, isCreating, users, updateUser }) => {
  const [workerSearch, setWorkerSearch] = useState('');
  const [isLinking, setIsLinking] = useState<string | null>(null);

  const linkedUsers = useMemo(() =>
    users.filter(u => u.companyId === formData.id),
    [users, formData.id]
  );

  const searchResults = useMemo(() => {
    if (!workerSearch || workerSearch.length < 2) return [];
    const term = workerSearch.toLowerCase();
    return users
      .filter(u =>
        u.companyId !== formData.id && (
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(term) ||
          u.fiscalCode.toLowerCase().includes(term)
        )
      )
      .slice(0, 8);
  }, [users, workerSearch, formData.id]);

  const handleLink = async (userId: string) => {
    setIsLinking(userId);
    try {
      await updateUser(userId, { companyId: formData.id });
      setWorkerSearch('');
    } catch (err) {
      console.error('Errore associazione lavoratore:', err);
    } finally {
      setIsLinking(null);
    }
  };

  const handleUnlink = async (userId: string) => {
    setIsLinking(userId);
    try {
      await updateUser(userId, { companyId: undefined });
    } catch (err) {
      console.error('Errore rimozione associazione:', err);
    } finally {
      setIsLinking(null);
    }
  };

  const handleToggleStatus = async (user: User) => {
    setIsLinking(user.id);
    try {
      const newStatus = user.status === UserStatus.ACTIVE ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
      await updateUser(user.id, { status: newStatus });
    } catch (err) {
      console.error('Errore cambio stato lavoratore:', err);
    } finally {
      setIsLinking(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
        <UsersIcon size={20} />
        Lavoratori Associati
        {linkedUsers.length > 0 && (
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({linkedUsers.length})</span>
        )}
      </h3>

      {isCreating ? (
        <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">
          Salva l'impresa prima di associare i lavoratori.
        </p>
      ) : (
        <>
          {/* Search to add workers */}
          <div className="mb-4 relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cerca e aggiungi lavoratore
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
                placeholder="Cerca per nome, cognome o codice fiscale..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white text-sm"
              />
            </div>

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                {searchResults.map(u => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{u.fiscalCode}</p>
                      {u.companyId && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Già associato ad altra impresa</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleLink(u.id)}
                      disabled={isLinking === u.id}
                      className="ml-3 flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-secondary text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {isLinking === u.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <UserPlus size={14} />
                      )}
                      Aggiungi
                    </button>
                  </div>
                ))}
              </div>
            )}

            {workerSearch.length >= 2 && searchResults.length === 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-3">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Nessun lavoratore trovato</p>
              </div>
            )}
          </div>

          {/* Linked workers table */}
          {linkedUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium border-b dark:border-gray-600">
                  <tr>
                    <th className="p-3">Nome Cognome</th>
                    <th className="p-3">Codice Fiscale</th>
                    <th className="p-3">Telefono</th>
                    <th className="p-3">Stato</th>
                    <th className="p-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-600">
                  {linkedUsers.map(u => (
                    <tr key={u.id}>
                      <td className="p-3 font-medium dark:text-white">{u.firstName} {u.lastName}</td>
                      <td className="p-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{u.fiscalCode}</td>
                      <td className="p-3 text-gray-500 dark:text-gray-400">{u.phone || u.mobile || '-'}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          u.status === UserStatus.ACTIVE ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                          u.status === UserStatus.SUSPENDED ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                          'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => handleToggleStatus(u)}
                          disabled={isLinking === u.id}
                          className={`transition-colors disabled:opacity-50 ${
                            u.status === UserStatus.ACTIVE
                              ? 'text-green-500 hover:text-yellow-600 dark:hover:text-yellow-400'
                              : 'text-yellow-500 hover:text-green-600 dark:hover:text-green-400'
                          }`}
                          title={u.status === UserStatus.ACTIVE ? 'Sospendi lavoratore' : 'Riattiva lavoratore'}
                        >
                          {isLinking === u.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : u.status === UserStatus.ACTIVE ? (
                            <Lock size={16} />
                          ) : (
                            <Unlock size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => handleUnlink(u.id)}
                          disabled={isLinking === u.id}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Rimuovi associazione"
                        >
                          {isLinking === u.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <UserMinus size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">Nessun lavoratore associato a questa impresa.</p>
          )}
        </>
      )}
    </div>
  );
};

// ==================== COMPANY FORM COMPONENT ====================

interface CompanyFormProps {
  company: ImpresaEdile;
  isCreating: boolean;
  isSaving: boolean;
  onSave: (company: ImpresaEdile) => void;
  onCancel: () => void;
  users: User[];
  updateUser: (id: string, user: Partial<User>) => Promise<User>;
  onFormChange?: (formData: ImpresaEdile, hasChanges: boolean) => void;
  saveFormRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}

const CompanyForm: React.FC<CompanyFormProps> = ({ company, isCreating, isSaving, onSave, onCancel, users, updateUser, onFormChange, saveFormRef }) => {
  const [formData, setFormData] = useState<ImpresaEdile>(company);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viesLoading, setViesLoading] = useState(false);
  const [viesMessage, setViesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Document management state
  const [newDoc, setNewDoc] = useState<Partial<CompanyDocument>>({ name: '', issueDate: '', expiryDate: '' });
  const [selectedDocType, setSelectedDocType] = useState('');
  const [customDocName, setCustomDocName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const updateField = (field: keyof ImpresaEdile, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    }
  };

  // VIES lookup
  const handleViesLookup = async () => {
    if (!formData.partitaIva || formData.partitaIva.trim().length < 11) {
      setViesMessage({ type: 'error', text: 'Inserisci una Partita IVA valida (11 cifre)' });
      return;
    }

    setViesLoading(true);
    setViesMessage(null);

    try {
      const result = await lookupPartitaIva(formData.partitaIva);

      if (!result) {
        setViesMessage({ type: 'error', text: 'Partita IVA non trovata nel sistema VIES' });
        return;
      }

      if (!result.isValid) {
        setViesMessage({ type: 'error', text: 'Partita IVA non valida secondo il sistema VIES' });
        return;
      }

      // Auto-fill fields
      setFormData(prev => ({
        ...prev,
        ragioneSociale: result.ragioneSociale || prev.ragioneSociale,
        address: result.address || prev.address,
        houseNumber: result.houseNumber || prev.houseNumber,
        zipCode: result.zipCode || prev.zipCode,
        city: result.city || prev.city,
        province: result.province || prev.province,
      }));

      setViesMessage({ type: 'success', text: `Dati recuperati: ${result.ragioneSociale}` });
    } catch (err) {
      setViesMessage({ type: 'error', text: err instanceof Error ? err.message : 'Errore nella verifica VIES' });
    } finally {
      setViesLoading(false);
    }
  };

  // Track form changes and notify parent
  useEffect(() => {
    if (onFormChange) {
      const hasChanges = JSON.stringify(formData) !== JSON.stringify(company);
      onFormChange(formData, hasChanges);
    }
  }, [formData]);

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.partitaIva || formData.partitaIva.trim().length < 11) {
      newErrors.partitaIva = 'La Partita IVA deve contenere 11 cifre';
    }
    if (!formData.ragioneSociale || formData.ragioneSociale.trim() === '') {
      newErrors.ragioneSociale = 'La Ragione Sociale e obbligatoria';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (): boolean => {
    if (!validate()) return false;
    onSave(formData);
    return true;
  };

  // Esponi la funzione di salvataggio al parent tramite ref
  useEffect(() => {
    if (saveFormRef) {
      saveFormRef.current = async () => handleSubmit();
    }
    return () => {
      if (saveFormRef) {
        saveFormRef.current = null;
      }
    };
  }, [formData, saveFormRef]);

  // Document type selection
  const handleDocTypeChange = (value: string) => {
    setSelectedDocType(value);
    if (value && value !== 'altro') {
      setNewDoc(prev => ({ ...prev, name: value }));
      setCustomDocName('');
    } else if (value === 'altro') {
      setNewDoc(prev => ({ ...prev, name: customDocName }));
    } else {
      setNewDoc(prev => ({ ...prev, name: '' }));
    }
  };

  const handleCustomDocNameChange = (value: string) => {
    setCustomDocName(value);
    setNewDoc(prev => ({ ...prev, name: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        alert('Formato file non supportato. Usa PDF, JPG o PNG.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        alert(`File troppo grande (${sizeMb} MB). Dimensione massima: 5 MB.`);
        return;
      }
      setSelectedFile(file);
    }
  };

  // Image to PDF conversion
  const convertImageToPDF = (imageDataUrl: string, fileName: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const pdf = new jsPDF({
          orientation: img.width > img.height ? 'landscape' : 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const maxWidth = pageWidth - (margin * 2);
        const maxHeight = pageHeight - (margin * 2);
        let imgWidth = img.width;
        let imgHeight = img.height;
        const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        imgWidth = imgWidth * ratio;
        imgHeight = imgHeight * ratio;
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;
        pdf.addImage(imageDataUrl, 'JPEG', x, y, imgWidth, imgHeight);
        resolve(pdf.output('dataurlstring'));
      };
      img.src = imageDataUrl;
    });
  };

  const generateDocId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `doc-${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
  };

  // Add document with file support
  const handleAddDocument = async () => {
    if (isAddingDoc) return;
    setDocError(null);

    if (!newDoc.name || !newDoc.expiryDate) {
      setDocError('Nome documento e data scadenza sono obbligatori');
      return;
    }

    // Duplicate check
    const existing = (formData.documents || []).find(
      d => d.name.toLowerCase().trim() === newDoc.name!.toLowerCase().trim()
    );
    if (existing) {
      setDocError(`Esiste già un documento "${newDoc.name}". Rimuovilo prima di aggiungerne uno nuovo.`);
      return;
    }

    // Validate expiry date
    const expiryDate = new Date(newDoc.expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(expiryDate.getTime())) {
      setDocError('Data di scadenza non valida');
      return;
    }
    const year = expiryDate.getFullYear();
    if (year < 1900 || year > 2100) {
      setDocError('Anno di scadenza non valido. Inserisci un anno compreso tra 1900 e 2100.');
      return;
    }
    if (expiryDate < today) {
      setDocError('Non è possibile inserire un documento già scaduto.');
      return;
    }

    setIsAddingDoc(true);
    const docName = newDoc.name!.trim();

    const finalizeDocument = (fileUrl?: string) => {
      const alreadyExists = (formData.documents || []).some(
        d => d.name.toLowerCase() === docName.toLowerCase()
      );
      if (alreadyExists) {
        setDocError(`Documento "${docName}" già presente.`);
        setIsAddingDoc(false);
        return;
      }

      const doc: CompanyDocument = {
        id: generateDocId(),
        name: docName,
        issueDate: newDoc.issueDate || new Date().toISOString().split('T')[0],
        expiryDate: newDoc.expiryDate!,
        fileUrl: fileUrl,
      };

      setFormData(prev => ({
        ...prev,
        documents: [...(prev.documents || []), doc],
      }));

      setNewDoc({ name: '', issueDate: '', expiryDate: '' });
      setSelectedDocType('');
      setCustomDocName('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsAddingDoc(false);
    };

    if (selectedFile) {
      const reader = new FileReader();
      reader.onerror = () => {
        setDocError('Errore nella lettura del file');
        setIsAddingDoc(false);
      };
      reader.onload = async () => {
        try {
          let fileUrl = reader.result as string;
          if (selectedFile.type.startsWith('image/')) {
            fileUrl = await convertImageToPDF(fileUrl, newDoc.name!);
          }
          finalizeDocument(fileUrl);
        } catch {
          setDocError('Errore nella conversione del file in PDF');
          setIsAddingDoc(false);
        }
      };
      reader.readAsDataURL(selectedFile);
    } else {
      finalizeDocument();
    }
  };

  // Data URL to Blob
  const dataUrlToBlob = (dataUrl: string): Blob | null => {
    try {
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return null;
      const byteCharacters = atob(matches[2]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      return new Blob([new Uint8Array(byteNumbers)], { type: matches[1] });
    } catch { return null; }
  };

  const normalizeFileUrl = (fileUrl?: string | null): string | null => {
    if (!fileUrl) return null;
    const trimmed = fileUrl.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) return trimmed;
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      const base64 = trimmed.replace(/\s+/g, '');
      if (base64.startsWith('JVBER')) return `data:application/pdf;base64,${base64}`;
      if (base64.startsWith('/9j/')) return `data:image/jpeg;base64,${base64}`;
      if (base64.startsWith('iVBOR')) return `data:image/png;base64,${base64}`;
      return `data:application/octet-stream;base64,${base64}`;
    }
    return null;
  };

  // View document
  const viewDocument = async (doc: CompanyDocument) => {
    let fileUrl = doc.fileUrl || '';
    const storageRef = parseStorageUrl(fileUrl);
    if (storageRef && STORAGE_MODE !== 'local') {
      try {
        fileUrl = await createSignedUrl(storageRef.bucket, storageRef.path);
      } catch {
        setDocError('Impossibile ottenere il link del documento. Riprova.');
        return;
      }
    }
    const normalizedUrl = normalizeFileUrl(fileUrl);
    if (!normalizedUrl) { setDocError('Nessun file allegato a questo documento'); return; }
    try {
      let blob = dataUrlToBlob(normalizedUrl);
      if (!blob) {
        const response = await fetch(normalizedUrl);
        if (!response.ok) throw new Error('Anteprima fallita');
        blob = await response.blob();
      }
      const blobUrl = URL.createObjectURL(blob);
      const newWindow = window.open(blobUrl, '_blank');
      if (newWindow) {
        const checkClosed = setInterval(() => { if (newWindow.closed) { clearInterval(checkClosed); URL.revokeObjectURL(blobUrl); } }, 1000);
        setTimeout(() => { clearInterval(checkClosed); URL.revokeObjectURL(blobUrl); }, 5 * 60 * 1000);
      } else {
        URL.revokeObjectURL(blobUrl);
        setDocError('Popup bloccato. Consenti i popup per visualizzare il documento.');
      }
    } catch {
      setDocError('Impossibile visualizzare il documento. Prova a scaricarlo.');
    }
  };

  // Download document
  const downloadDocument = async (doc: CompanyDocument) => {
    let fileUrl = doc.fileUrl || '';
    const storageRef = parseStorageUrl(fileUrl);
    if (storageRef && STORAGE_MODE !== 'local') {
      try {
        fileUrl = await createSignedUrl(storageRef.bucket, storageRef.path);
      } catch {
        setDocError('Impossibile ottenere il link del documento. Riprova.');
        return;
      }
    }
    const normalizedUrl = normalizeFileUrl(fileUrl);
    if (!normalizedUrl) { setDocError('Nessun file allegato a questo documento'); return; }
    try {
      let extension = 'pdf';
      if (normalizedUrl.startsWith('data:')) {
        const mimeMatch = normalizedUrl.match(/^data:([^;]+)/);
        if (mimeMatch) {
          if (mimeMatch[1] === 'image/jpeg' || mimeMatch[1] === 'image/jpg') extension = 'jpg';
          else if (mimeMatch[1] === 'image/png') extension = 'png';
        }
      }
      const safeFileName = doc.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ\s\-_]/g, '').trim() || 'documento';
      let blob = dataUrlToBlob(normalizedUrl);
      if (!blob) {
        const response = await fetch(normalizedUrl);
        if (!response.ok) throw new Error('Download fallito');
        blob = await response.blob();
      }
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${safeFileName}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    } catch {
      setDocError('Errore durante il download del documento');
    }
  };

  // Remove document
  const handleRemoveDocument = (docId: string) => {
    setFormData(prev => ({
      ...prev,
      documents: (prev.documents || []).filter(d => d.id !== docId),
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          {isCreating ? 'Nuova Impresa Edile' : 'Modifica Impresa'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} /> Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition-colors disabled:opacity-50"
          >
            <Save size={18} /> {isSaving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>

      {/* Partita IVA + VIES Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Partita IVA</h3>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Partita IVA <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.partitaIva}
              onChange={(e) => updateField('partitaIva', e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && formData.partitaIva.length === 11 && !viesLoading) {
                  e.preventDefault();
                  handleViesLookup();
                }
              }}
              placeholder="Es. 00488410010"
              maxLength={11}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white font-mono text-lg ${errors.partitaIva ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            />
            {errors.partitaIva && <p className="text-red-500 text-xs mt-1">{errors.partitaIva}</p>}
          </div>
          <div className="pt-7">
            <button
              onClick={handleViesLookup}
              disabled={viesLoading || !formData.partitaIva || formData.partitaIva.length < 11}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white rounded-md transition-colors whitespace-nowrap"
            >
              {viesLoading ? <Loader2 size={18} className="animate-spin" /> : <Globe size={18} />}
              Verifica VIES
            </button>
          </div>
        </div>

        {/* VIES message */}
        {viesMessage && (
          <div className={`mt-3 p-3 rounded-md text-sm flex items-center gap-2 ${viesMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
            {viesMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {viesMessage.text}
          </div>
        )}
      </div>

      {/* Dati Aziendali */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Dati Aziendali</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ragione Sociale <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.ragioneSociale}
              onChange={(e) => updateField('ragioneSociale', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white ${errors.ragioneSociale ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            />
            {errors.ragioneSociale && <p className="text-red-500 text-xs mt-1">{errors.ragioneSociale}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Forma Giuridica</label>
            <select
              value={formData.formaGiuridica || ''}
              onChange={(e) => updateField('formaGiuridica', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            >
              {FORME_GIURIDICHE.map(fg => (
                <option key={fg} value={fg}>{fg || '-- Seleziona --'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Codice Fiscale</label>
            <input
              type="text"
              value={formData.codiceFiscale || ''}
              onChange={(e) => updateField('codiceFiscale', e.target.value)}
              placeholder="Se diverso da P.IVA"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Codice REA</label>
            <input
              type="text"
              value={formData.codiceREA || ''}
              onChange={(e) => updateField('codiceREA', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Codice ATECO</label>
            <input
              type="text"
              value={formData.codiceAteco || ''}
              onChange={(e) => updateField('codiceAteco', e.target.value)}
              placeholder="Es. 41.20.00"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Contatti */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Contatti</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PEC</label>
            <input
              type="email"
              value={formData.pec || ''}
              onChange={(e) => updateField('pec', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => updateField('email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefono</label>
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cellulare</label>
            <input
              type="tel"
              value={formData.mobile || ''}
              onChange={(e) => updateField('mobile', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Sede Legale */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Sede Legale</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Indirizzo</label>
            <AddressAutocomplete
              value={formData.address}
              onChange={(val) => updateField('address', val)}
              onAddressSelect={(parsed) => {
                setFormData(prev => ({
                  ...prev,
                  address: parsed.street || prev.address,
                  houseNumber: parsed.houseNumber || prev.houseNumber,
                  zipCode: parsed.postalCode || prev.zipCode,
                  city: parsed.city || prev.city,
                  province: parsed.province || prev.province,
                }));
              }}
              placeholder="Inizia a digitare l'indirizzo..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N. Civico</label>
            <input
              type="text"
              value={formData.houseNumber || ''}
              onChange={(e) => updateField('houseNumber', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CAP</label>
            <input
              type="text"
              value={formData.zipCode}
              onChange={(e) => updateField('zipCode', e.target.value)}
              maxLength={5}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Citta</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => updateField('city', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provincia</label>
            <input
              type="text"
              value={formData.province}
              onChange={(e) => updateField('province', e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="AG"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Documenti Aziendali */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Documenti Aziendali</h3>

        {/* Add new document form */}
        <div className={`bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600 mb-6 relative ${isAddingDoc ? 'pointer-events-none' : ''}`}>
          {isAddingDoc && (
            <div className="absolute inset-0 bg-white/70 dark:bg-gray-800/70 rounded-lg flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Caricamento file...</span>
              </div>
            </div>
          )}

          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Aggiungi Documento</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo Documento</label>
              <select
                value={selectedDocType}
                onChange={e => handleDocTypeChange(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                disabled={isAddingDoc}
              >
                <option value="">Seleziona tipo...</option>
                {COMPANY_DOC_TYPES.map(dt => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
                <option value="altro">Altro...</option>
              </select>
            </div>
            {selectedDocType === 'altro' && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nome Documento Personalizzato</label>
                <input
                  type="text"
                  value={customDocName}
                  onChange={e => handleCustomDocNameChange(e.target.value)}
                  maxLength={100}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                  placeholder="Es. Attestato SOA Categoria OG1"
                  disabled={isAddingDoc}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Data Scadenza</label>
              <input
                type="date"
                value={newDoc.expiryDate || ''}
                onChange={e => setNewDoc(prev => ({ ...prev, expiryDate: e.target.value }))}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                disabled={isAddingDoc}
              />
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              disabled={isAddingDoc}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isAddingDoc}
              className={`flex-1 px-3 py-2 border ${selectedFile ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'} rounded hover:bg-gray-50 dark:hover:bg-gray-600 text-sm flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed`}
              title={selectedFile ? selectedFile.name : 'Seleziona file (opzionale)'}
            >
              <Upload size={14} /> {selectedFile ? selectedFile.name.substring(0, 15) + '...' : 'Allega File'}
            </button>
            <button
              onClick={handleAddDocument}
              disabled={!newDoc.name || !newDoc.expiryDate || isAddingDoc}
              className="px-4 py-2 bg-secondary text-white rounded hover:bg-primary transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAddingDoc ? 'Caricamento...' : 'Aggiungi Documento'}
            </button>
          </div>

          {docError && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-start gap-2">
              <AlertCircle className="text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" size={16} />
              <div className="flex-1">
                <p className="text-red-700 dark:text-red-300 text-sm">{docError}</p>
              </div>
              <button onClick={() => setDocError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Documents list table */}
        {formData.documents && formData.documents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium border-b dark:border-gray-600">
                <tr>
                  <th className="p-3">Nome</th>
                  <th className="p-3">Registrato</th>
                  <th className="p-3">Scadenza</th>
                  <th className="p-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-600">
                {formData.documents.map(doc => {
                  const status = getDocumentExpiryStatus(doc.expiryDate);
                  return (
                    <tr key={doc.id}>
                      <td className="p-3 font-medium dark:text-white">{doc.name}</td>
                      <td className="p-3 text-gray-500 dark:text-gray-400">{doc.issueDate ? formatDate(doc.issueDate) : '-'}</td>
                      <td className="p-3">
                        {doc.expiryDate ? (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${(() => {
                            const expiry = new Date(doc.expiryDate);
                            const today = new Date();
                            expiry.setHours(23, 59, 59, 999);
                            today.setHours(0, 0, 0, 0);
                            return expiry < today;
                          })() ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {formatDate(doc.expiryDate)}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">N/D</span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-2">
                        {doc.fileUrl ? (
                          <>
                            <button onClick={() => viewDocument(doc)} className="text-gray-400 hover:text-blue-600" title="Visualizza PDF">
                              <Eye size={16} />
                            </button>
                            <button onClick={() => downloadDocument(doc)} className="text-gray-400 hover:text-green-600" title="Scarica PDF">
                              <Download size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="text-gray-300 cursor-not-allowed" title="Nessun file"><Eye size={16} /></button>
                            <button className="text-gray-300 cursor-not-allowed" title="Nessun file"><Download size={16} /></button>
                          </>
                        )}
                        <button onClick={() => handleRemoveDocument(doc.id)} className="text-gray-400 hover:text-red-600" title="Elimina">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-4">Nessun documento caricato.</p>
        )}
      </div>

      {/* Lavoratori Associati */}
      <LinkedWorkersSection
        formData={formData}
        isCreating={isCreating}
        users={users}
        updateUser={updateUser}
      />

      {/* Note + Stato */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Note e Stato</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stato</label>
            <select
              value={formData.status}
              onChange={(e) => updateField('status', e.target.value as UserStatus)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-secondary/50 dark:bg-gray-700 dark:text-white"
            >
              <option value={UserStatus.ACTIVE}>Attivo</option>
              <option value={UserStatus.SUSPENDED}>Sospeso</option>
              <option value={UserStatus.LOCKED}>Bloccato</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bottom save button */}
      <div className="flex justify-end gap-2 pb-4">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <X size={18} /> Annulla
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-secondary text-white rounded-md transition-colors disabled:opacity-50"
        >
          <Save size={18} /> {isSaving ? 'Salvataggio...' : 'Salva Impresa'}
        </button>
      </div>
    </div>
  );
};

export default Companies;
