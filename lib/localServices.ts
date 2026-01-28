import { User, Certificate, Operator, AppSettings } from '../types';
import { LOCAL_STORAGE_KEYS } from './config';
import { MOCK_USERS, MOCK_OPERATORS } from '../constants';
import { hashPassword, verifyPassword } from './password';

// ============ RESET FUNCTION ============

// Resetta tutti i dati locali ai valori mock di default
export function resetLocalStorage(): void {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.USERS);
  localStorage.removeItem(LOCAL_STORAGE_KEYS.OPERATORS);
  localStorage.removeItem(LOCAL_STORAGE_KEYS.SETTINGS);
  localStorage.removeItem(LOCAL_STORAGE_KEYS.CERTIFICATES);
  console.log('LocalStorage resettato ai dati di default');
}

// Esponi la funzione globalmente per debug (accessibile da console browser)
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).resetGestCertData = resetLocalStorage;
}

// Versione dei dati - incrementa per forzare reset automatico
const DATA_VERSION = '5'; // Aggiunta verifica password operatori
const VERSION_KEY = 'gestcert_data_version';

// Auto-reset se la versione cambia
function checkAndResetIfNeeded(): void {
  const storedVersion = localStorage.getItem(VERSION_KEY);
  if (storedVersion !== DATA_VERSION) {
    console.log(`Versione dati cambiata (${storedVersion} -> ${DATA_VERSION}), reset in corso...`);
    resetLocalStorage();
    localStorage.setItem(VERSION_KEY, DATA_VERSION);
  }
}

// Esegui check all'import del modulo
if (typeof window !== 'undefined') {
  checkAndResetIfNeeded();
}

// ============ HELPER FUNCTIONS ============

function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ============ PASSWORD UTILITIES ============

export { verifyPassword };

// ============ LOCAL USERS SERVICE ============

export const localUsersService = {
  async getAll(): Promise<User[]> {
    const users = getFromStorage<User[]>(LOCAL_STORAGE_KEYS.USERS, MOCK_USERS);
    return users.sort((a, b) => a.lastName.localeCompare(b.lastName));
  },

  async getById(id: string): Promise<User | null> {
    const users = await this.getAll();
    return users.find(u => u.id === id) || null;
  },

  async create(user: Omit<User, 'id'>, _skipEmailCheck?: boolean): Promise<User> {
    const users = await this.getAll();
    const newUser: User = {
      ...user,
      id: generateId(),
      certificates: user.certificates || []
    };
    users.push(newUser);
    saveToStorage(LOCAL_STORAGE_KEYS.USERS, users);
    return newUser;
  },

  async update(id: string, userData: Partial<User>): Promise<User> {
    const users = await this.getAll();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('Utente non trovato');

    users[index] = { ...users[index], ...userData };
    saveToStorage(LOCAL_STORAGE_KEYS.USERS, users);
    return users[index];
  },

  async delete(id: string): Promise<void> {
    let users = await this.getAll();
    users = users.filter(u => u.id !== id);
    saveToStorage(LOCAL_STORAGE_KEYS.USERS, users);
  },

  async deleteMany(ids: string[]): Promise<void> {
    let users = await this.getAll();
    users = users.filter(u => !ids.includes(u.id));
    saveToStorage(LOCAL_STORAGE_KEYS.USERS, users);
  }
};

// ============ LOCAL CERTIFICATES SERVICE ============

export const localCertificatesService = {
  async create(userId: string, cert: Omit<Certificate, 'id'>): Promise<Certificate> {
    const users = getFromStorage<User[]>(LOCAL_STORAGE_KEYS.USERS, MOCK_USERS);
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error('Utente non trovato');

    const newCert: Certificate = {
      ...cert,
      id: generateId()
    };

    users[userIndex].certificates = [...(users[userIndex].certificates || []), newCert];
    saveToStorage(LOCAL_STORAGE_KEYS.USERS, users);
    return newCert;
  },

  async delete(certId: string): Promise<void> {
    const users = getFromStorage<User[]>(LOCAL_STORAGE_KEYS.USERS, MOCK_USERS);

    for (const user of users) {
      if (user.certificates) {
        user.certificates = user.certificates.filter(c => c.id !== certId);
      }
    }

    saveToStorage(LOCAL_STORAGE_KEYS.USERS, users);
  },

  async getExpiring(days: number): Promise<{ user: User; certificate: Certificate }[]> {
    const users = await localUsersService.getAll();
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const expiring: { user: User; certificate: Certificate }[] = [];

    for (const user of users) {
      for (const cert of user.certificates || []) {
        const expiryDate = new Date(cert.expiryDate);
        if (expiryDate >= today && expiryDate <= futureDate) {
          expiring.push({ user, certificate: cert });
        }
      }
    }

    return expiring;
  }
};

// ============ LOCAL OPERATORS SERVICE ============

// Email dell'admin di sistema (non modificabile/eliminabile)
const SYSTEM_ADMIN_EMAIL = 'admin@admin';

export const localOperatorsService = {
  async getAll(): Promise<Operator[]> {
    const operators = getFromStorage<Operator[]>(LOCAL_STORAGE_KEYS.OPERATORS, MOCK_OPERATORS);
    return operators.sort((a, b) => a.lastName.localeCompare(b.lastName));
  },

  async getByEmail(email: string): Promise<Operator | null> {
    const operators = await this.getAll();
    return operators.find(o => o.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async getByAuthUserId(_authUserId: string): Promise<Operator | null> {
    return null;
  },

  isSystemAdmin(operator: Operator | { email?: string }): boolean {
    return operator.email?.toLowerCase() === SYSTEM_ADMIN_EMAIL.toLowerCase();
  },

  async create(operator: Omit<Operator, 'id'> & { password?: string }): Promise<Operator> {
    // Non permettere di creare un altro admin@admin
    if (operator.email?.toLowerCase() === SYSTEM_ADMIN_EMAIL.toLowerCase()) {
      throw new Error('Non è possibile creare un operatore con questa email');
    }

    const operators = await this.getAll();

    // Hash della password se fornita
    let passwordHash: string | undefined;
    if (operator.password) {
      passwordHash = await hashPassword(operator.password);
    }

    // Rimuovi password plain text e aggiungi hash
    const { password, ...operatorWithoutPassword } = operator;

    const newOperator: Operator = {
      ...operatorWithoutPassword,
      id: generateId(),
      passwordHash
    };
    operators.push(newOperator);
    saveToStorage(LOCAL_STORAGE_KEYS.OPERATORS, operators);
    return newOperator;
  },

  async update(id: string, operatorData: Partial<Operator> & { password?: string; passwordHash?: string }): Promise<Operator> {
    const operators = await this.getAll();
    const index = operators.findIndex(o => o.id === id);
    if (index === -1) throw new Error('Operatore non trovato');

    // Blocca modifiche all'admin di sistema (eccetto lastAccess e passwordHash)
    if (operators[index].email?.toLowerCase() === SYSTEM_ADMIN_EMAIL.toLowerCase()) {
      // Permetti solo aggiornamento password e lastAccess
      const allowedFields = ['password', 'passwordHash', 'lastAccess'];
      const attemptedFields = Object.keys(operatorData).filter(k => !allowedFields.includes(k));
      if (attemptedFields.length > 0) {
        throw new Error('L\'operatore di sistema non può essere modificato');
      }
    }

    let passwordHash = operatorData.passwordHash;
    if (!passwordHash && operatorData.password) {
      passwordHash = await hashPassword(operatorData.password);
    }

    const { password, ...rest } = operatorData;
    operators[index] = { ...operators[index], ...rest, ...(passwordHash ? { passwordHash } : {}) };
    saveToStorage(LOCAL_STORAGE_KEYS.OPERATORS, operators);
    return operators[index];
  },

  async updateLastAccess(id: string): Promise<void> {
    const operators = await this.getAll();
    const index = operators.findIndex(o => o.id === id);
    if (index !== -1) {
      operators[index].lastAccess = new Date().toISOString();
      saveToStorage(LOCAL_STORAGE_KEYS.OPERATORS, operators);
    }
  },

  async delete(id: string): Promise<void> {
    const operators = await this.getAll();
    const toDelete = operators.find(o => o.id === id);

    // Blocca eliminazione admin di sistema
    if (toDelete?.email?.toLowerCase() === SYSTEM_ADMIN_EMAIL.toLowerCase()) {
      throw new Error('L\'operatore di sistema non può essere eliminato');
    }

    const filtered = operators.filter(o => o.id !== id);
    saveToStorage(LOCAL_STORAGE_KEYS.OPERATORS, filtered);
  }
};

// ============ LOCAL SETTINGS SERVICE ============

export const localSettingsService = {
  async get(operatorId: string): Promise<AppSettings | null> {
    const allSettings = getFromStorage<Record<string, AppSettings>>(LOCAL_STORAGE_KEYS.SETTINGS, {});
    return allSettings[operatorId] || null;
  },

  async upsert(operatorId: string, settings: AppSettings): Promise<void> {
    const allSettings = getFromStorage<Record<string, AppSettings>>(LOCAL_STORAGE_KEYS.SETTINGS, {});
    allSettings[operatorId] = settings;
    saveToStorage(LOCAL_STORAGE_KEYS.SETTINGS, allSettings);
  }
};

// ============ LOCAL BACHECA SERVICE ============

export interface NotaBacheca {
  id: string;
  contenuto: string;
  operatoreId?: string;
  operatoreNome: string;
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  completedById?: string;
}

export const localBachecaService = {
  async getAll(): Promise<NotaBacheca[]> {
    let note = getFromStorage<NotaBacheca[]>(LOCAL_STORAGE_KEYS.BACHECA, []);

    // Pulizia automatica: rimuovi note completate più vecchie di 60 giorni
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const beforeCleanup = note.length;

    note = note.filter(n => {
      if (!n.completed || !n.completedAt) return true;
      return new Date(n.completedAt) > sixtyDaysAgo;
    });

    // Se abbiamo rimosso qualcosa, salva
    if (note.length < beforeCleanup) {
      saveToStorage(LOCAL_STORAGE_KEYS.BACHECA, note);
      console.log(`[Bacheca] Rimosse ${beforeCleanup - note.length} note completate più vecchie di 60 giorni`);
    }

    // Ordina solo per data (più recenti prima)
    return note.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async create(contenuto: string, operatoreId: string, operatoreNome: string): Promise<NotaBacheca> {
    const note = await this.getAll();
    const newNota: NotaBacheca = {
      id: generateId(),
      contenuto,
      operatoreId,
      operatoreNome,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false
    };
    note.unshift(newNota);
    const limited = note.slice(0, 30);
    saveToStorage(LOCAL_STORAGE_KEYS.BACHECA, limited);
    return newNota;
  },

  async update(id: string, contenuto: string): Promise<NotaBacheca> {
    const note = await this.getAll();
    const index = note.findIndex(n => n.id === id);
    if (index === -1) throw new Error('Nota non trovata');

    note[index] = {
      ...note[index],
      contenuto,
      updatedAt: new Date().toISOString()
    };
    saveToStorage(LOCAL_STORAGE_KEYS.BACHECA, note);
    return note[index];
  },

  async toggle(id: string, operatoreId: string, operatoreNome: string): Promise<NotaBacheca> {
    const note = await this.getAll();
    const index = note.findIndex(n => n.id === id);
    if (index === -1) throw new Error('Nota non trovata');

    const nota = note[index];
    if (nota.completed) {
      note[index] = {
        ...nota,
        completed: false,
        completedAt: undefined,
        completedBy: undefined,
        completedById: undefined,
        updatedAt: new Date().toISOString()
      };
    } else {
      note[index] = {
        ...nota,
        completed: true,
        completedAt: new Date().toISOString(),
        completedBy: operatoreNome,
        completedById: operatoreId,
        updatedAt: new Date().toISOString()
      };
    }
    saveToStorage(LOCAL_STORAGE_KEYS.BACHECA, note);
    return note[index];
  },

  async delete(id: string): Promise<void> {
    let note = await this.getAll();
    note = note.filter(n => n.id !== id);
    saveToStorage(LOCAL_STORAGE_KEYS.BACHECA, note);
  },

  async clearCompleted(): Promise<void> {
    let note = await this.getAll();
    note = note.filter(n => !n.completed);
    saveToStorage(LOCAL_STORAGE_KEYS.BACHECA, note);
  }
};

// ============ LOCAL ACTIVITIES SERVICE ============

export type ActivityType =
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_imported'
  | 'certificate_added'
  | 'certificate_deleted'
  | 'operator_created'
  | 'operator_login';

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  targetName?: string;  // Nome utente/operatore interessato
  operatorId: string;
  operatorName: string;
  createdAt: string;
}

// Labels per i tipi di attività
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  user_created: 'Utente creato',
  user_updated: 'Utente modificato',
  user_deleted: 'Utente eliminato',
  user_imported: 'Utenti importati',
  certificate_added: 'Certificato aggiunto',
  certificate_deleted: 'Certificato eliminato',
  operator_created: 'Operatore creato',
  operator_login: 'Accesso effettuato',
};

export const localActivitiesService = {
  async getAll(): Promise<Activity[]> {
    const activities = getFromStorage<Activity[]>(LOCAL_STORAGE_KEYS.ACTIVITIES, []);
    // Ordina per data decrescente
    return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getRecent(limit: number = 10): Promise<Activity[]> {
    const all = await this.getAll();
    return all.slice(0, limit);
  },

  async log(
    type: ActivityType,
    description: string,
    operatorId: string,
    operatorName: string,
    targetName?: string
  ): Promise<Activity> {
    const activities = await this.getAll();

    const newActivity: Activity = {
      id: generateId(),
      type,
      description,
      targetName,
      operatorId,
      operatorName,
      createdAt: new Date().toISOString()
    };

    activities.unshift(newActivity);

    // Mantieni solo le ultime 100 attività
    const limited = activities.slice(0, 100);
    saveToStorage(LOCAL_STORAGE_KEYS.ACTIVITIES, limited);

    return newActivity;
  },

  async clear(): Promise<void> {
    saveToStorage(LOCAL_STORAGE_KEYS.ACTIVITIES, []);
  }
};

// ============ LOCAL MAINTENANCE SERVICE ============

export const localMaintenanceService = {
  async removeDuplicateCertificates(): Promise<{ removed: number; usersAffected: number }> {
    const users = getFromStorage<User[]>(LOCAL_STORAGE_KEYS.USERS, MOCK_USERS);
    let removed = 0;
    let usersAffected = 0;

    const updatedUsers = users.map(user => {
      const seen = new Set<string>();
      const before = user.certificates?.length || 0;
      const deduped = (user.certificates || []).filter(cert => {
        const key = [
          (cert.name || '').trim(),
          cert.issueDate || '',
          cert.expiryDate || '',
          cert.fileUrl || ''
        ].join('|');
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      const after = deduped.length;
      if (after !== before) {
        removed += (before - after);
        usersAffected += 1;
        return { ...user, certificates: deduped };
      }
      return user;
    });

    if (removed > 0) {
      saveToStorage(LOCAL_STORAGE_KEYS.USERS, updatedUsers);
    }

    return { removed, usersAffected };
  }
};

// ============ LOCAL CERTIFICATE TYPES SERVICE ============

export interface CertificateType {
  id: string;
  name: string;
  description?: string; // Es. "validità 6 mesi"
  order: number;
}

// Tipi di default
const DEFAULT_CERTIFICATE_TYPES: CertificateType[] = [
  { id: 'visura', name: 'Visura Camerale', description: 'non più vecchia di 6 mesi', order: 1 },
  { id: 'durc', name: 'DURC', description: 'Documento Unico di Regolarità Contributiva - 4 mesi', order: 2 },
  { id: 'mut', name: 'MUT', description: 'Moduli per la Gestione Telematica', order: 3 },
  { id: 'psc', name: 'PSC', description: 'Attestazioni sulla Sicurezza', order: 4 },
  { id: 'iscrizione', name: 'Domanda di Iscrizione', description: '', order: 5 },
];

export const localCertificateTypesService = {
  async getAll(): Promise<CertificateType[]> {
    const types = getFromStorage<CertificateType[]>(LOCAL_STORAGE_KEYS.CERTIFICATE_TYPES, DEFAULT_CERTIFICATE_TYPES);
    return types.sort((a, b) => a.order - b.order);
  },

  async create(type: Omit<CertificateType, 'id' | 'order'>): Promise<CertificateType> {
    const types = await this.getAll();
    const maxOrder = types.length > 0 ? Math.max(...types.map(t => t.order)) : 0;

    const newType: CertificateType = {
      ...type,
      id: generateId(),
      order: maxOrder + 1
    };

    types.push(newType);
    saveToStorage(LOCAL_STORAGE_KEYS.CERTIFICATE_TYPES, types);
    return newType;
  },

  async update(id: string, data: Partial<CertificateType>): Promise<CertificateType> {
    const types = await this.getAll();
    const index = types.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Tipo certificato non trovato');

    types[index] = { ...types[index], ...data };
    saveToStorage(LOCAL_STORAGE_KEYS.CERTIFICATE_TYPES, types);
    return types[index];
  },

  async delete(id: string): Promise<void> {
    let types = await this.getAll();
    types = types.filter(t => t.id !== id);
    saveToStorage(LOCAL_STORAGE_KEYS.CERTIFICATE_TYPES, types);
  },

  async reorder(orderedIds: string[]): Promise<void> {
    const types = await this.getAll();
    const reordered = orderedIds.map((id, index) => {
      const type = types.find(t => t.id === id);
      if (type) {
        return { ...type, order: index + 1 };
      }
      return null;
    }).filter(Boolean) as CertificateType[];

    saveToStorage(LOCAL_STORAGE_KEYS.CERTIFICATE_TYPES, reordered);
  },

  async reset(): Promise<void> {
    saveToStorage(LOCAL_STORAGE_KEYS.CERTIFICATE_TYPES, DEFAULT_CERTIFICATE_TYPES);
  }
};
