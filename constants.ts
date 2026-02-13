import { Role, User, UserStatus, Operator, ImpresaEdile } from './types';

// Genera date relative a oggi per i test
const today = new Date();
const formatDate = (d: Date) => d.toISOString().split('T')[0];
const addDays = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

export const MOCK_USERS: User[] = [
  {
    id: '1',
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario.rossi@example.com',
    fiscalCode: 'RSSMRA80A01H501U',
    gender: 'M',
    birthDate: '1980-01-01',
    birthPlace: 'Roma',
    birthCountry: 'IT',
    nationality: 'IT',
    address: 'Via Roma',
    houseNumber: '1',
    zipCode: '92100',
    city: 'Agrigento',
    province: 'AG',
    phone: '0922123456',
    status: UserStatus.ACTIVE,
    group: 'Gruppo A',
    certificates: [
      {
        id: 'c1',
        name: 'Sicurezza Cantieri Base',
        issueDate: '2023-01-15',
        expiryDate: addDays(0), // Scade OGGI
      },
      {
        id: 'c2',
        name: 'Patente Gruista',
        issueDate: '2021-05-20',
        expiryDate: addDays(-30), // Scaduto 30 giorni fa
      }
    ]
  },
  {
    id: '2',
    firstName: 'Luigi',
    lastName: 'Verdi',
    email: 'luigi.verdi@example.com',
    fiscalCode: 'VRDLGU85B02H501Z',
    gender: 'M',
    birthDate: '1985-02-02',
    birthPlace: 'Milano',
    birthCountry: 'IT',
    nationality: 'IT',
    address: 'Via Milano',
    houseNumber: '2',
    zipCode: '92019',
    city: 'Sciacca',
    province: 'AG',
    mobile: '3331234567',
    status: UserStatus.ACTIVE,
    group: 'Gruppo B',
    certificates: [
      {
        id: 'c3',
        name: 'RSPP',
        issueDate: '2023-02-01',
        expiryDate: addDays(5), // Scade tra 5 giorni (questa settimana)
      },
      {
        id: 'c4',
        name: 'Primo Soccorso',
        issueDate: '2024-01-01',
        expiryDate: addDays(20), // Scade tra 20 giorni (questo mese)
      }
    ]
  },
  {
    id: '3',
    firstName: 'Giulia',
    lastName: 'Bianchi',
    email: 'giulia.bianchi@example.com',
    fiscalCode: 'BNCGLI90C43H501X',
    gender: 'F',
    birthDate: '1990-03-03',
    birthPlace: 'Napoli',
    birthCountry: 'IT',
    nationality: 'IT',
    address: 'Via Napoli',
    houseNumber: '3',
    zipCode: '92026',
    city: 'Favara',
    province: 'AG',
    status: UserStatus.SUSPENDED,
    certificates: [
      {
        id: 'c5',
        name: 'Antincendio',
        issueDate: '2022-06-01',
        expiryDate: addDays(-10), // Scaduto 10 giorni fa
      }
    ]
  }
];

export const MOCK_COMPANIES: ImpresaEdile[] = [
  {
    id: 'comp1',
    partitaIva: '00488410010',
    ragioneSociale: 'TIM S.P.A.',
    formaGiuridica: 'SPA',
    codiceFiscale: '00488410010',
    pec: 'tim@pec.telecomitalia.it',
    email: 'info@tim.it',
    phone: '0636881',
    address: 'Via Gaetano Negri',
    houseNumber: '1',
    zipCode: '20123',
    city: 'Milano',
    province: 'MI',
    codiceAteco: '61.10.00',
    status: UserStatus.ACTIVE,
    documents: [
      {
        id: 'doc1',
        name: 'DURC',
        issueDate: '2024-06-01',
        expiryDate: addDays(45),
      },
      {
        id: 'doc2',
        name: 'Visura Camerale',
        issueDate: '2024-09-15',
        expiryDate: addDays(90),
      }
    ]
  },
  {
    id: 'comp2',
    partitaIva: '01234567890',
    ragioneSociale: 'Edil Costruzioni SRL',
    formaGiuridica: 'SRL',
    pec: 'edilcostruzioni@pec.it',
    address: 'Via Roma',
    houseNumber: '42',
    zipCode: '92100',
    city: 'Agrigento',
    province: 'AG',
    codiceAteco: '41.20.00',
    status: UserStatus.ACTIVE,
    documents: [
      {
        id: 'doc3',
        name: 'DURC',
        issueDate: '2024-01-10',
        expiryDate: addDays(-15),
      }
    ]
  },
  {
    id: 'comp3',
    partitaIva: '09876543210',
    ragioneSociale: 'Impresa Edile Rossi SNC',
    formaGiuridica: 'SNC',
    pec: 'rossi@pec.it',
    email: 'info@rossi-edile.it',
    mobile: '3339876543',
    address: 'Corso Italia',
    houseNumber: '100',
    zipCode: '92019',
    city: 'Sciacca',
    province: 'AG',
    status: UserStatus.SUSPENDED,
    documents: []
  }
];

// Password di default per operatori mock: admin123
export const MOCK_OPERATORS: Operator[] = [
  {
    id: 'op1',
    firstName: 'Admin',
    lastName: 'System',
    email: 'admin@cassaedile.ag.it',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    lastAccess: '2024-01-01 10:00:00',
    passwordHash: 'e1396d0b25fb89fcf1e0b9360398b3edb8e48a9ae3e9b515ff98aa2f1c5a8116' // admin123
  },
  {
    id: 'op0',
    firstName: 'Super',
    lastName: 'Admin',
    email: 'admin@admin',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    lastAccess: '2024-01-01 10:00:00',
    passwordHash: '457d2c6858347ba5be8e34dad1be9350bfefcec9b3f445871219e0a9075cae02' // Uno23456!
  },
  {
    id: 'op2',
    firstName: 'Maria',
    lastName: 'Segreteria',
    email: 'segreteria@cassaedile.ag.it',
    role: Role.SECRETARY,
    status: UserStatus.ACTIVE,
    lastAccess: '2024-01-02 09:30:00',
    passwordHash: 'e1396d0b25fb89fcf1e0b9360398b3edb8e48a9ae3e9b515ff98aa2f1c5a8116' // admin123
  }
];
