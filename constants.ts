import { Role, User, UserStatus, Operator } from './types';

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
