import { Role, User, UserStatus, Operator } from './types';

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
    nationality: 'IT',
    address: 'Via Roma 1',
    zipCode: '00100',
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
        expiryDate: '2026-01-15', // Active
      },
      {
        id: 'c2',
        name: 'Patente Gruista',
        issueDate: '2021-05-20',
        expiryDate: '2024-05-20', // Expired
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
    nationality: 'IT',
    address: 'Via Milano 2',
    zipCode: '20100',
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
        expiryDate: '2026-02-01', // Expiring soon simulation
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
    nationality: 'IT',
    address: 'Via Napoli 3',
    zipCode: '80100',
    city: 'Favara',
    province: 'AG',
    status: UserStatus.SUSPENDED,
    certificates: []
  }
];

export const MOCK_OPERATORS: Operator[] = [
  {
    id: 'op1',
    firstName: 'Admin',
    lastName: 'System',
    email: 'admin@cassaedile.ag.it',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    lastAccess: '2024-01-01 10:00:00'
  },
  {
    id: 'op2',
    firstName: 'Maria',
    lastName: 'Segreteria',
    email: 'segreteria@cassaedile.ag.it',
    role: Role.SECRETARY,
    status: UserStatus.ACTIVE,
    lastAccess: '2024-01-02 09:30:00'
  }
];
