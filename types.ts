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
  companyId?: string; // ID dell'impresa edile associata
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

export interface CompanyDocument {
  id: string;
  name: string;
  issueDate: string;
  expiryDate: string;
  fileUrl?: string;
}

export interface ImpresaEdile {
  id: string;
  partitaIva: string;
  ragioneSociale: string;
  formaGiuridica?: string;
  codiceFiscale?: string;
  codiceREA?: string;
  pec?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  address: string;
  houseNumber?: string;
  zipCode: string;
  city: string;
  province: string;
  codiceAteco?: string;
  notes?: string;
  status: UserStatus;
  documents: CompanyDocument[];
  createdAt?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  fontSize: 'small' | 'medium' | 'large';
  widgets: {
    welcome: boolean;
    clock: boolean;
    calendar: boolean;
    expiry: boolean;
  };
  smtp?: {
    server: string;
    port: number;
    encryption: 'NONE' | 'SSL' | 'TLS';
    user: string;
    senderEmail: string;
  };
}
