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
  auth_user_id UUID,
  role TEXT DEFAULT 'Segreteria' CHECK (role IN ('Amministratore', 'Segreteria')),
  status TEXT DEFAULT 'Attivo' CHECK (status IN ('Attivo', 'Sospeso', 'Bloccato')),
  last_access TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella impostazioni per operatore
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  operator_email TEXT,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_operators_auth_user_id ON operators(auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_operator_email ON settings(operator_email);

-- Abilita Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Policy per accesso con Supabase Auth
DROP POLICY IF EXISTS "Enable all access for users" ON users;
DROP POLICY IF EXISTS "Enable all access for certificates" ON certificates;
DROP POLICY IF EXISTS "Enable all access for operators" ON operators;
DROP POLICY IF EXISTS "Enable all access for settings" ON settings;
DROP POLICY IF EXISTS "Enable all access for smtp_settings" ON smtp_settings;
DROP POLICY IF EXISTS "Enable all access for notification_settings" ON notification_settings;
DROP POLICY IF EXISTS "Enable all access for email_templates" ON email_templates;

CREATE POLICY "Users access for authenticated" ON users
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Certificates access for authenticated" ON certificates
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Operators self read" ON operators
  FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Operators admin all" ON operators
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  );

CREATE POLICY "Settings self access" ON settings
  FOR ALL USING (
    auth.role() = 'authenticated'
    AND (
      (settings.operator_email IS NOT NULL AND settings.operator_email = (auth.jwt() ->> 'email'))
      OR EXISTS (
        SELECT 1 FROM operators o
        WHERE o.id = settings.operator_id
          AND o.auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      (settings.operator_email IS NOT NULL AND settings.operator_email = (auth.jwt() ->> 'email'))
      OR EXISTS (
        SELECT 1 FROM operators o
        WHERE o.id = settings.operator_id
          AND o.auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "SMTP admin access" ON smtp_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  );

CREATE POLICY "Notification admin access" ON notification_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  );

CREATE POLICY "Templates admin access" ON email_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operators o
      WHERE o.auth_user_id = auth.uid()
        AND o.role = 'Amministratore'
    )
  );

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
DROP POLICY IF EXISTS "Enable all access for bacheca" ON bacheca;
CREATE POLICY "Bacheca access for authenticated" ON bacheca
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

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

-- Inserisci super admin di default (creare anche l'utente Auth con email admin@admin)
INSERT INTO operators (first_name, last_name, email, role, status)
VALUES ('Super', 'Admin', 'admin@admin', 'Amministratore', 'Attivo')
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
