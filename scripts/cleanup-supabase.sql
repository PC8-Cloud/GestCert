-- ============================================
-- PULIZIA SUPABASE per modalità HYBRID
-- ============================================
-- Esegui questo script nel SQL Editor di Supabase

-- 1) DISABILITA RLS su tutte le tabelle (no Supabase Auth)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE certificates DISABLE ROW LEVEL SECURITY;
ALTER TABLE bacheca DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;

-- 2) AGGIUNGI colonna operator_email a settings (per modalità hybrid)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS operator_email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_operator_email ON settings(operator_email);

-- 3) RIMUOVI vincoli FK non necessari (operatori gestiti in locale)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_operator_id_fkey;
ALTER TABLE bacheca DROP CONSTRAINT IF EXISTS bacheca_operatore_id_fkey;

-- 4) Verifica tabelle
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
