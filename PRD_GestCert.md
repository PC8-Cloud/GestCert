# PRD - GestCert v2.0a

## Panoramica
**GestCert** è un sistema web di gestione certificati e scadenze per lavoratori, progettato per casse edili, enti pubblici e aziende che devono tracciare certificati di sicurezza e competenze del personale.

**Stack**: React 18 + TypeScript + Vite + Supabase + Tailwind CSS

---

## Ruoli Utente

| Ruolo | Accesso |
|-------|---------|
| **Amministratore** | Tutto: Dashboard, Lavoratori, Operatori, Impostazioni complete (SMTP, Notifiche, Backup) |
| **Segreteria** | Dashboard, Lavoratori, Impostazioni limitate (solo widget) |

---

## Pagine e Funzionalità

### 1. LOGIN
- Accesso con email + password
- Logout automatico dopo 2 minuti di inattività

### 2. DASHBOARD (`/`)

**Widget configurabili:**
- Benvenuto personalizzato ("Buongiorno/pomeriggio/sera, Nome")
- Orologio digitale con data
- Calendario mensile (evidenzia festivi italiani, weekend, Pasqua dinamica)
- Riepilogo scadenze certificati:
  - Scadono oggi (rosso)
  - Entro 7 giorni (arancione)
  - Entro 30 giorni (giallo)
  - Già scaduti (grigio)
  - Ogni card è cliccabile per filtrare lavoratori

**Attività recenti:** Log temporale operazioni (creazione, modifica, eliminazione lavoratori/certificati, login)

**Bacheca:** Note condivise tra operatori (max 500 caratteri, eliminabili solo dall'autore)

### 3. GESTIONE LAVORATORI (`/users`)

**Lista lavoratori:**
- Ricerca in tempo reale (nome, cognome, email, codice fiscale)
- Filtri: stato (Attivo/Sospeso/Bloccato), scadenze certificati
- Ordinamento per colonna

**Creazione/Modifica lavoratore:**
- Dati anagrafici: Nome, Cognome, Codice Fiscale, Email, Telefono, Cellulare
- Dati personali: Genere, Data Nascita, Luogo Nascita, Paese Nascita, Nazionalità
- Residenza: Indirizzo, N. Civico, CAP, Città, Provincia (con autocomplete)
- Organizzazione: Gruppo, Note, Stato

**Validazione Codice Fiscale:**
- Validazione formato italiano
- Estrae automaticamente: genere, data nascita, luogo nascita
- Autocompletamento campi dal CF

**Certificati per lavoratore:**
- Aggiunta: Nome, Data Emissione, Data Scadenza, Upload file (PDF/PNG/JPG)
- Colori stato: verde (valido), giallo (30gg), arancione (7gg), rosso (oggi/scaduto)
- Download e eliminazione certificati

**Import/Export:**
- Importazione bulk da CSV (template scaricabile, separatore ;)
- Export singolo lavoratore come PDF con QR code
- Export lista come CSV

**Azioni:**
- Lock/Unlock lavoratori
- Eliminazione singola o multipla (cascade su certificati)

### 4. GESTIONE OPERATORI (`/operators`) - Solo Admin

- Lista operatori con avatar (iniziali)
- Creazione: Nome, Cognome, Email, Password, Ruolo, Stato
- Modifica dati operatore
- Reset password
- Eliminazione operatore

### 5. IMPOSTAZIONI (`/settings`)

**Per tutti:**
- Widget Dashboard: toggle Welcome, Clock, Calendar, Expiry
- Tema: Chiaro/Scuro
- Dimensione font

**Solo Admin:**

**Backup e Ripristino:**
- Backup completo in ZIP (lavoratori, certificati allegati, operatori, settings, bacheca)
- Struttura: `gestcert_BK_[timestamp].zip` con cartelle per lavoratore
- Ripristino da ZIP con anteprima e conferma

**Manutenzione:**
- Rimozione certificati duplicati

**Tipi Certificato:**
- Gestione tipi personalizzabili (CRUD)
- Reset ai default

**Configurazione Email SMTP:**
- Server, Porta, Crittografia (SSL/TLS/None)
- Utente, Password (nascosta dopo salvataggio)
- Email/Nome Mittente, Reply-To
- Test invio email

**Notifiche Scadenze:**
- Abilita/Disabilita
- Giorni soglia: 60, 30, 14, 7, 3, 1
- Riepilogo giornaliero o email singole
- Notifica operatori (+ email destinatario)
- Notifica lavoratori (email ai lavoratori)
- Template personalizzabili con variabili:
  - `{{firstName}}`, `{{lastName}}`, `{{certificateName}}`
  - `{{expiryDate}}`, `{{daysUntilExpiry}}`
  - `{{certList}}`, `{{digestList}}`
- Pulsante "Invia Notifiche Ora"

---

## Modello Dati

### User (Lavoratore)
```
id, firstName, lastName, email, phone, mobile, fiscalCode, gender,
birthDate, birthPlace, birthCountry, nationality, address, houseNumber,
zipCode, city, province, group, notes, status, certificates[]
```

### Certificate
```
id, name, issueDate, expiryDate, fileUrl
```

### Operator
```
id, firstName, lastName, email, role (Amministratore|Segreteria),
status (Attivo|Sospeso|Bloccato), lastAccess, passwordHash
```

---

## Flussi Operativi Principali

### Aggiunta Lavoratore
1. Pagina Lavoratori → "Nuovo Lavoratore"
2. Inserisci Codice Fiscale (sistema autocompila genere, data/luogo nascita)
3. Completa dati anagrafici
4. Salva → Log attività registrato

### Aggiunta Certificato
1. Apri profilo lavoratore
2. Sezione Certificati → "Aggiungi"
3. Seleziona tipo, date, upload file opzionale
4. Salva → Appare in dashboard se in scadenza

### Import CSV
1. Impostazioni → Scarica template CSV
2. Compila in Excel (separatore ;)
3. Lavoratori → "Importa CSV"
4. Validazione + anteprima → Conferma
5. Report: importati vs errori

### Backup
1. Impostazioni → "Crea Backup"
2. Progress → Download ZIP automatico
3. Contiene: JSON + cartelle lavoratori con certificati allegati

### Ripristino
1. Impostazioni → "Ripristina Backup"
2. Seleziona ZIP → Anteprima (n. lavoratori, certificati, data)
3. Conferma → Progress → Auto-reload

---

## Funzionalità Speciali

- **Calendario festivi italiani** con Pasqua calcolata dinamicamente
- **Autocomplete indirizzi** italiani
- **QR Code** su export PDF lavoratore
- **Tema scuro/chiaro** salvato per operatore
- **Timeout sessione** 2 minuti inattività

---

## Note Tecniche

- Database: Supabase (PostgreSQL)
- Storage file: Supabase Storage o base64
- Autenticazione: locale (hybrid mode) o Supabase Auth
- RLS policies per sicurezza dati
- Variabili ambiente per credenziali (`.env`)

---

## Prompt per Generare la Guida

Usa questo PRD con il seguente prompt:

```
Sei un technical writer. Usando il PRD allegato, scrivi una guida utente
completa per GestCert in italiano. La guida deve:

1. Essere divisa per sezioni (Dashboard, Lavoratori, Operatori, Impostazioni)
2. Includere istruzioni passo-passo per ogni operazione
3. Usare un linguaggio semplice adatto a utenti non tecnici
4. Includere suggerimenti e best practice
5. Avere una sezione FAQ con problemi comuni
6. Essere formattata in Markdown

Target: operatori di segreteria e amministratori di casse edili/enti pubblici.
```
