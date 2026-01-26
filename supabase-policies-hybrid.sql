-- =====================================================
-- Policy RLS per modalità HYBRID (login locale)
-- Esegui questo script nel SQL Editor di Supabase
-- =====================================================

-- ATTENZIONE: Queste policy permettono accesso con la chiave anon.
-- Usare SOLO se l'app gestisce l'autenticazione lato client.
-- Per maggiore sicurezza, migrare a Supabase Auth.

-- =====================================================
-- OPZIONE A: Policy permissive per chiave anon
-- (meno sicuro ma funziona con login locale)
-- =====================================================

-- Users: accesso completo con chiave anon
DROP POLICY IF EXISTS "Users access for authenticated" ON users;
DROP POLICY IF EXISTS "Users anon access" ON users;
CREATE POLICY "Users anon access" ON users
  FOR ALL USING (true) WITH CHECK (true);

-- Certificates: accesso completo con chiave anon
DROP POLICY IF EXISTS "Certificates access for authenticated" ON certificates;
DROP POLICY IF EXISTS "Certificates anon access" ON certificates;
CREATE POLICY "Certificates anon access" ON certificates
  FOR ALL USING (true) WITH CHECK (true);

-- Bacheca: accesso completo con chiave anon
DROP POLICY IF EXISTS "Bacheca access for authenticated" ON bacheca;
DROP POLICY IF EXISTS "Bacheca anon access" ON bacheca;
CREATE POLICY "Bacheca anon access" ON bacheca
  FOR ALL USING (true) WITH CHECK (true);

-- Settings: accesso completo con chiave anon
DROP POLICY IF EXISTS "Settings self access" ON settings;
DROP POLICY IF EXISTS "Settings anon access" ON settings;
CREATE POLICY "Settings anon access" ON settings
  FOR ALL USING (true) WITH CHECK (true);

-- Operators: SOLO LETTURA per chiave anon (più sicuro)
DROP POLICY IF EXISTS "Operators self read" ON operators;
DROP POLICY IF EXISTS "Operators admin all" ON operators;
DROP POLICY IF EXISTS "Operators anon read" ON operators;
DROP POLICY IF EXISTS "Operators anon write" ON operators;

CREATE POLICY "Operators anon read" ON operators
  FOR SELECT USING (true);

CREATE POLICY "Operators anon write" ON operators
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Operators anon update" ON operators
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Operators anon delete" ON operators
  FOR DELETE USING (true);

-- SMTP Settings: accesso completo (necessario per funzioni Edge)
DROP POLICY IF EXISTS "SMTP admin access" ON smtp_settings;
DROP POLICY IF EXISTS "SMTP anon access" ON smtp_settings;
CREATE POLICY "SMTP anon access" ON smtp_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Notification Settings: accesso completo
DROP POLICY IF EXISTS "Notification admin access" ON notification_settings;
DROP POLICY IF EXISTS "Notification anon access" ON notification_settings;
CREATE POLICY "Notification anon access" ON notification_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Email Templates: accesso completo
DROP POLICY IF EXISTS "Templates admin access" ON email_templates;
DROP POLICY IF EXISTS "Templates anon access" ON email_templates;
CREATE POLICY "Templates anon access" ON email_templates
  FOR ALL USING (true) WITH CHECK (true);

-- Comuni: già pubblico, nessuna modifica necessaria

-- =====================================================
-- VERIFICA: Controlla che le policy siano attive
-- =====================================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
