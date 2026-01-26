-- Permette lettura anonima della tabella operators per il login locale
-- Esegui questo script nel SQL Editor di Supabase

-- Rimuovi policy esistenti sulla tabella operators
DROP POLICY IF EXISTS "Operators self read" ON operators;
DROP POLICY IF EXISTS "Operators admin all" ON operators;
DROP POLICY IF EXISTS "Operators anon read" ON operators;
DROP POLICY IF EXISTS "Operators authenticated all" ON operators;

-- Policy per lettura anonima (necessaria per il login)
CREATE POLICY "Operators anon read" ON operators
  FOR SELECT
  USING (true);

-- Policy per modifiche da parte degli utenti autenticati
CREATE POLICY "Operators authenticated all" ON operators
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
