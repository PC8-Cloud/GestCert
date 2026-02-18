-- ============================================================
-- GestCert: Cron Job per invio automatico notifiche scadenze
-- ============================================================
-- Questo script configura un cron job su Supabase che chiama
-- la Edge Function send-expiry ogni giorno alle 8:00.
--
-- ISTRUZIONI:
-- 1. Vai nel SQL Editor di Supabase (Dashboard > SQL Editor)
-- 2. Sostituisci URL_SUPABASE con l'URL del tuo progetto
--    (es. https://abcdefghij.supabase.co)
-- 3. Sostituisci SERVICE_ROLE_KEY con la service_role key
--    (Dashboard > Settings > API > service_role key)
-- 4. Esegui lo script
--
-- NOTA: pg_cron e pg_net devono essere abilitati nel progetto.
--       pg_cron è disponibile nei piani Pro e superiori.
-- ============================================================

-- Abilita estensioni necessarie
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rimuovi eventuale schedule precedente con lo stesso nome
SELECT cron.unschedule('send-expiry-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-expiry-daily'
);

-- Schedula invio notifiche ogni giorno alle 8:00 (ora UTC)
SELECT cron.schedule(
  'send-expiry-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'URL_SUPABASE/functions/v1/send-expiry',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer SERVICE_ROLE_KEY"}'::jsonb,
    body := '{"force": false}'::jsonb
  );
  $$
);

-- Verifica che il job sia stato creato
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'send-expiry-daily';
