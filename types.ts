export enum Role {
  ADMIN = 'Amministratore',
  SECRETARY = 'Segreteria',
}

export enum UserStatus {
  ACTIVE = 'Attivo',
  SUSPENDED = 'Sospeso',
  LOCKED = 'Bloccato',
}

export interface Certificate {
  id: string;
  name: string;
  issueDate: string;
  expiryDate: string;
  fileUrl?: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  mobile?: string;
  fiscalCode: string; // Codice Fiscale
  gender: 'M' | 'F';
  birthDate: string;
  birthPlace: string;
  birthCountry: string; // Paese di nascita (IT, DE, etc.)
  nationality: string;
  address: string;
  houseNumber?: string; // Numero civico
  zipCode: string;
  city: string;
  province: string;
  group?: string;
  notes?: string;
  status: UserStatus;
  certificates: Certificate[];
  createdAt?: string; // Data di inserimento
}

export interface Operator {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  status: UserStatus;
  lastAccess?: string;
  passwordHash?: string;
  authUserId?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  fontSize: 'small' | 'medium' | 'large';
  widgets: {
    welcome: boolean;
    clock: boolean;
    calendar: boolean;
    expiry: boolean;
    todoList: boolean;
  };
  smtp?: {
    server: string;
    port: number;
    encryption: 'NONE' | 'SSL' | 'TLS';
    user: string;
    senderEmail: string;
  };
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  createdBy: string;        // Nome operatore che ha creato
  createdById: string;      // ID operatore che ha creato
  completedAt?: string;     // Data completamento
  completedBy?: string;     // Nome operatore che ha completato
  completedById?: string;   // ID operatore che ha completato
}
