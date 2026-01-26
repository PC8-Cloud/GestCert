<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ZOqN-txxpq8cpIRWwIQ0ZZtWFov7lUxx

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Super user (Supabase)

Per usare l'account super user in modalità Supabase:
1. Crea l'utente Auth in Supabase con email `admin@admin` e password `Uno23456!`.
2. Associa l'utente Auth all'operatore:
   ```sql
   update operators
   set auth_user_id = '<ID_AUTH_UTENTE>'
   where lower(email) = lower('admin@admin');
   ```

In alternativa puoi usare lo script (richiede `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`):
```bash
SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>" \
npm run create-superuser
```
