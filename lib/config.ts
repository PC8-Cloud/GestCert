// ============ STORAGE CONFIGURATION ============
// Imposta 'local' per usare localStorage (sviluppo/test)
// Imposta 'supabase' per usare il database remoto (produzione)
// Imposta 'hybrid' per login locale + dati da Supabase

export type StorageMode = 'local' | 'supabase' | 'hybrid';

// CAMBIA QUESTO VALORE PER SWITCHARE TRA STORAGE LOCALE E REMOTO
export const STORAGE_MODE: StorageMode = 'hybrid';

// Supabase Storage bucket (for certificate files)
export const STORAGE_BUCKET = 'GestCert';

// Chiavi per localStorage
export const LOCAL_STORAGE_KEYS = {
  USERS: 'gestcert_users',
  OPERATORS: 'gestcert_operators',
  SETTINGS: 'gestcert_settings',
  CERTIFICATES: 'gestcert_certificates',
  BACHECA: 'gestcert_bacheca',
  ACTIVITIES: 'gestcert_activities',
  CERTIFICATE_TYPES: 'gestcert_certificate_types',
  EMAIL_CONFIG: 'gestcert_email_config',
  NOTIFICATION_SETTINGS: 'gestcert_notification_settings',
  LAST_NOTIFICATION_CHECK: 'gestcert_last_notification_check',
};
