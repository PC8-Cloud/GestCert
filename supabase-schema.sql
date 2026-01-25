-- GestCert Database Schema for Supabase
-- Esegui questo script nel SQL Editor di Supabase

-- Tabella utenti (lavoratori)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  mobile TEXT,
  fiscal_code TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('M', 'F')),
  birth_date DATE,
  birth_place TEXT,
  birth_country TEXT DEFAULT 'IT',
  nationality TEXT DEFAULT 'IT',
  address TEXT,
  house_number TEXT,
  zip_code TEXT,
  city TEXT,
  province TEXT,
  user_group TEXT,
  notes TEXT,
  status TEXT DEFAULT 'Attivo' CHECK (status IN ('Attivo', 'Sospeso', 'Bloccato')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella certificati
CREATE TABLE IF NOT EXISTS certificates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issue_date DATE,
  expiry_date DATE NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella operatori (utenti del sistema)
CREATE TABLE IF NOT EXISTS operators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'Segreteria' CHECK (role IN ('Amministratore', 'Segreteria')),
  status TEXT DEFAULT 'Attivo' CHECK (status IN ('Attivo', 'Sospeso', 'Bloccato')),
  last_access TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella impostazioni per operatore
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'light',
  font_size TEXT DEFAULT 'medium',
  widgets JSONB DEFAULT '{"welcome": true, "clock": true, "calendar": true, "expiry": true}',
  smtp_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella configurazione SMTP (globale)
CREATE TABLE IF NOT EXISTS smtp_settings (
  id UUID PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  encryption TEXT DEFAULT 'SSL' CHECK (encryption IN ('NONE', 'SSL', 'TLS')),
  smtp_user TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  reply_to TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella impostazioni notifiche scadenze
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  days_before_expiry INTEGER[] DEFAULT ARRAY[30, 14, 7, 1],
  notify_operators BOOLEAN DEFAULT TRUE,
  operator_email TEXT,
  notify_users BOOLEAN DEFAULT TRUE,
  daily_digest BOOLEAN DEFAULT TRUE,
  last_sent_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella template email
CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_users_fiscal_code ON users(fiscal_code);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_expiry_date ON certificates(expiry_date);
CREATE INDEX IF NOT EXISTS idx_operators_email ON operators(email);

-- Abilita Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Policy per permettere accesso (per ora aperto, poi da restringere con auth)
CREATE POLICY "Enable all access for users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for certificates" ON certificates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for operators" ON operators FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for settings" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for smtp_settings" ON smtp_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for notification_settings" ON notification_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for email_templates" ON email_templates FOR ALL USING (true) WITH CHECK (true);

-- Tabella bacheca (note condivise tra operatori)
CREATE TABLE IF NOT EXISTS bacheca (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contenuto TEXT NOT NULL,
  operatore_id UUID REFERENCES operators(id) ON DELETE SET NULL,
  operatore_nome TEXT, -- Cache del nome per visualizzazione veloce
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice per ordinare le note per data
CREATE INDEX IF NOT EXISTS idx_bacheca_created_at ON bacheca(created_at DESC);

-- Policy per bacheca (tutti gli operatori possono leggere e scrivere)
ALTER TABLE bacheca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for bacheca" ON bacheca FOR ALL USING (true) WITH CHECK (true);

-- Tabella comuni italiani (codici catastali per CF)
CREATE TABLE IF NOT EXISTS comuni (
  id SERIAL PRIMARY KEY,
  codice_catastale TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  provincia TEXT NOT NULL,
  soppresso BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per ricerca veloce comuni
CREATE INDEX IF NOT EXISTS idx_comuni_codice ON comuni(codice_catastale);
CREATE INDEX IF NOT EXISTS idx_comuni_nome ON comuni(nome);
CREATE INDEX IF NOT EXISTS idx_comuni_nome_lower ON comuni(LOWER(nome));

-- Policy per accesso comuni (lettura pubblica)
ALTER TABLE comuni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for comuni" ON comuni FOR SELECT USING (true);

-- Inserisci operatore admin di default
INSERT INTO operators (first_name, last_name, email, role, status)
VALUES ('Admin', 'System', 'admin@cassaedile.ag.it', 'Amministratore', 'Attivo')

ON CONFLICT (email) DO NOTHING;

-- Impostazioni notifiche default
INSERT INTO notification_settings (id, enabled, days_before_expiry, notify_operators, operator_email, notify_users, daily_digest)
VALUES ('00000000-0000-0000-0000-000000000002', TRUE, ARRAY[30, 14, 7, 1], TRUE, NULL, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Template email default
INSERT INTO email_templates (key, subject, body)
VALUES
  ('user_expiry', 'Scadenza certificato', 'Il tuo {{certificateName}} depositato presso la Cassa Edile di Agrigento scadrà in data {{expiryDate}}. Non dimenticare di farci pervenire la copia valida.'),
  ('operator_digest', 'Riepilogo notifiche scadenze', 'Sono stati avvisati:\n\n{{digestList}}')
ON CONFLICT (key) DO NOTHING;

-- Inserisci operatore segreteria di default
INSERT INTO operators (first_name, last_name, email, role, status)
VALUES ('Maria', 'Segreteria', 'segreteria@cassaedile.ag.it', 'Segreteria', 'Attivo')
ON CONFLICT (email) DO NOTHING;
