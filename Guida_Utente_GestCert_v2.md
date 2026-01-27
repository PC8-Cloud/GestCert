# Guida Utente GestCert v2.0

**Sistema di Gestione Certificati e Scadenze per Lavoratori**

---

## Indice

1. [Introduzione](#introduzione)
2. [Accesso al Sistema](#accesso-al-sistema)
3. [Dashboard](#dashboard)
4. [Gestione Utenti (Lavoratori)](#gestione-utenti-lavoratori)
5. [Gestione Operatori](#gestione-operatori)
6. [Impostazioni](#impostazioni)
7. [Suggerimenti e Best Practice](#suggerimenti-e-best-practice)
8. [Domande Frequenti (FAQ)](#domande-frequenti-faq)

---

## Introduzione

### Cos'è GestCert?

GestCert è un sistema web progettato per la gestione dei certificati di sicurezza e delle competenze dei lavoratori. È pensato per casse edili, enti pubblici e aziende che devono tracciare le scadenze dei certificati del proprio personale.

### A chi è rivolto?

Il sistema prevede due tipi di utenti operatori:

| Ruolo | Cosa può fare |
|-------|---------------|
| **Amministratore** | Accesso completo: Dashboard, Utenti, Operatori, tutte le Impostazioni (SMTP, Notifiche, Backup) |
| **Segreteria** | Accesso limitato: Dashboard, Utenti, Impostazioni ridotte (solo personalizzazione widget) |

### Requisiti

Per utilizzare GestCert è sufficiente un browser web moderno (Chrome, Firefox, Edge, Safari) e una connessione Internet.

---

## Accesso al Sistema

### Come effettuare il login

1. Aprire il browser e navigare all'indirizzo del sistema GestCert
2. Inserire la propria **email** nel primo campo
3. Inserire la propria **password** nel secondo campo
4. Cliccare sul pulsante **Accedi**

### Timeout di sicurezza

**Importante:** Per ragioni di sicurezza, il sistema effettua automaticamente il logout dopo **2 minuti di inattività**. Ricordarsi di salvare il lavoro frequentemente.

### Come effettuare il logout

Cliccare sull'icona del proprio profilo in alto a destra e selezionare **Esci** dal menu a tendina.

---

## Dashboard

La Dashboard è la pagina principale che si presenta dopo il login. Fornisce una panoramica immediata della situazione dei certificati e delle attività recenti.

### Widget disponibili

La Dashboard mostra diversi widget informativi, personalizzabili dalle Impostazioni:

#### 1. Benvenuto personalizzato

Mostra un saluto personalizzato in base all'orario:
- "Buongiorno" (mattina)
- "Buon pomeriggio" (pomeriggio)  
- "Buonasera" (sera)

seguito dal nome dell'operatore.

#### 2. Orologio digitale

Visualizza l'ora corrente e la data odierna.

#### 3. Calendario mensile

Un calendario che evidenzia:
- **Weekend** (sabato e domenica)
- **Festività italiane** (inclusa la Pasqua, calcolata automaticamente)

#### 4. Riepilogo scadenze certificati

Questo è il widget più importante per monitorare lo stato dei certificati:

| Colore | Significato |
|--------|-------------|
| 🔴 **Rosso** | Certificati che scadono oggi |
| 🟠 **Arancione** | Certificati in scadenza entro 7 giorni |
| 🟡 **Giallo** | Certificati in scadenza entro 30 giorni |
| ⚫ **Grigio** | Certificati già scaduti |

**Suggerimento:** Ogni card colorata è cliccabile! Cliccando si viene reindirizzati alla lista utenti filtrata per quella specifica scadenza.

### Attività recenti

Questa sezione mostra un log temporale di tutte le operazioni effettuate nel sistema:
- Creazione di nuovi utenti
- Modifica di utenti esistenti
- Eliminazione di utenti
- Aggiunta/rimozione di certificati
- Accessi al sistema

### Bacheca condivisa

La bacheca permette agli operatori di lasciare note visibili a tutti i colleghi.

**Come aggiungere una nota:**
1. Scrivere il testo nella casella di testo (massimo 500 caratteri)
2. Cliccare su **Pubblica**

**Come eliminare una nota:**
- Solo l'autore della nota può eliminarla, cliccando sull'icona del cestino

---

## Gestione Utenti (Lavoratori)

Questa sezione permette di gestire l'anagrafica dei lavoratori e i loro certificati. Accessibile dal menu **Utenti** o navigando a `/users`.

### Visualizzare la lista utenti

La pagina mostra l'elenco di tutti i lavoratori registrati nel sistema.

**Funzioni di ricerca:**
- Utilizzare la barra di ricerca per cercare in tempo reale per nome, cognome, email o codice fiscale
- I risultati si aggiornano mentre si digita

**Filtri disponibili:**
- **Stato:** Attivo, Sospeso, Bloccato
- **Scadenze certificati:** per visualizzare solo utenti con certificati in determinate condizioni

**Ordinamento:**
- Cliccare sull'intestazione di una colonna per ordinare i dati

### Creare un nuovo utente

1. Dalla pagina Utenti, cliccare su **Nuovo Utente**
2. Compilare il modulo seguendo questi passaggi:

#### Passo 1: Codice Fiscale

Inserire il Codice Fiscale del lavoratore. Il sistema:
- Valida automaticamente il formato
- Estrae e compila automaticamente: genere, data di nascita, luogo di nascita

#### Passo 2: Dati anagrafici

| Campo | Descrizione |
|-------|-------------|
| Nome | Nome del lavoratore |
| Cognome | Cognome del lavoratore |
| Email | Indirizzo email (opzionale) |
| Telefono | Numero fisso (opzionale) |
| Cellulare | Numero cellulare (opzionale) |

#### Passo 3: Dati personali

| Campo | Descrizione |
|-------|-------------|
| Genere | Maschio/Femmina (auto-compilato dal CF) |
| Data di nascita | (auto-compilata dal CF) |
| Luogo di nascita | (auto-compilato dal CF) |
| Paese di nascita | Italia o estero |
| Nazionalità | Nazionalità del lavoratore |

#### Passo 4: Residenza

| Campo | Descrizione |
|-------|-------------|
| Indirizzo | Via/Piazza e nome |
| N. Civico | Numero civico |
| CAP | Codice di avviamento postale |
| Città | Comune di residenza (con autocomplete) |
| Provincia | Sigla provincia (con autocomplete) |

#### Passo 5: Organizzazione

| Campo | Descrizione |
|-------|-------------|
| Gruppo | Gruppo/reparto di appartenenza |
| Note | Annotazioni libere |
| Stato | Attivo, Sospeso o Bloccato |

3. Cliccare su **Salva** per confermare

### Modificare un utente esistente

1. Dalla lista utenti, cliccare sul nome dell'utente o sull'icona di modifica (matita)
2. Modificare i campi desiderati
3. Cliccare su **Salva** per confermare le modifiche

### Gestire i certificati di un utente

#### Visualizzare i certificati

1. Aprire il profilo dell'utente
2. Scorrere fino alla sezione **Certificati**

I certificati sono visualizzati con colori che indicano lo stato:
- 🟢 **Verde:** Certificato valido
- 🟡 **Giallo:** Scade entro 30 giorni
- 🟠 **Arancione:** Scade entro 7 giorni
- 🔴 **Rosso:** Scade oggi o è già scaduto

#### Aggiungere un certificato

1. Nel profilo utente, sezione Certificati, cliccare su **Aggiungi Certificato**
2. Compilare i campi:
   - **Tipo certificato:** selezionare dal menu a tendina
   - **Data emissione:** data di rilascio del certificato
   - **Data scadenza:** data di scadenza del certificato
   - **File:** caricare opzionalmente una copia del certificato (PDF, PNG o JPG)
3. Cliccare su **Salva**

#### Scaricare un certificato

Cliccare sull'icona di download accanto al certificato desiderato.

#### Eliminare un certificato

Cliccare sull'icona del cestino accanto al certificato e confermare l'eliminazione.

### Importare utenti da file CSV

Questa funzione permette di caricare molti utenti contemporaneamente.

1. **Scaricare il template:** Andare in Impostazioni e scaricare il file template CSV
2. **Compilare il file:** Aprire con Excel e compilare i dati
   - **Importante:** il separatore deve essere il punto e virgola (;)
3. **Importare il file:**
   - Dalla pagina Utenti, cliccare su **Importa CSV**
   - Selezionare il file compilato
   - Controllare l'anteprima dei dati
   - Cliccare su **Conferma importazione**
4. **Verificare il risultato:** Il sistema mostra un report con numero di utenti importati ed eventuali errori

### Esportare dati

#### Export singolo utente in PDF

1. Aprire il profilo dell'utente
2. Cliccare su **Esporta PDF**
3. Viene generato un PDF con tutti i dati e un QR code identificativo

#### Export lista in CSV

1. Dalla pagina Utenti, cliccare su **Esporta CSV**
2. Viene scaricato un file con tutti gli utenti e i relativi dati

### Bloccare/Sbloccare un utente

1. Dalla lista utenti, selezionare l'utente
2. Cliccare sull'icona del lucchetto per bloccare/sbloccare
3. Gli utenti bloccati non possono essere modificati fino allo sblocco

### Eliminare utenti

#### Eliminazione singola

1. Dalla lista utenti, cliccare sull'icona del cestino accanto all'utente
2. Confermare l'eliminazione

**Attenzione:** L'eliminazione è permanente e rimuove anche tutti i certificati associati.

#### Eliminazione multipla

1. Selezionare più utenti tramite le checkbox
2. Cliccare su **Elimina selezionati**
3. Confermare l'operazione

---

## Gestione Operatori

**Nota:** Questa sezione è accessibile solo agli Amministratori.

Gli operatori sono gli utenti che accedono al sistema GestCert (amministratori e segreteria).

### Visualizzare la lista operatori

Navigare a **Operatori** dal menu principale. La lista mostra tutti gli operatori con un avatar che riporta le loro iniziali.

### Creare un nuovo operatore

1. Cliccare su **Nuovo Operatore**
2. Compilare i campi richiesti:

| Campo | Descrizione |
|-------|-------------|
| Nome | Nome dell'operatore |
| Cognome | Cognome dell'operatore |
| Email | Email di accesso (deve essere unica) |
| Password | Password di accesso |
| Ruolo | Amministratore o Segreteria |
| Stato | Attivo, Sospeso o Bloccato |

3. Cliccare su **Salva**

### Modificare un operatore

1. Cliccare sul nome dell'operatore nella lista
2. Modificare i campi desiderati
3. Salvare le modifiche

### Reimpostare la password

1. Aprire il profilo dell'operatore
2. Cliccare su **Reset Password**
3. Inserire la nuova password
4. Confermare

### Eliminare un operatore

1. Dalla lista, cliccare sull'icona del cestino
2. Confermare l'eliminazione

**Attenzione:** Non è possibile eliminare il proprio account.

---

## Impostazioni

Le impostazioni sono accessibili dal menu principale. Alcune funzioni sono disponibili solo per gli Amministratori.

### Impostazioni per tutti gli operatori

#### Personalizzazione Widget Dashboard

Attivare o disattivare i singoli widget:
- ✅ Widget Benvenuto
- ✅ Widget Orologio
- ✅ Widget Calendario
- ✅ Widget Scadenze

#### Tema

Scegliere tra:
- **Tema Chiaro:** sfondo bianco, ideale per ambienti luminosi
- **Tema Scuro:** sfondo scuro, più riposante per gli occhi

#### Dimensione Font

Regolare la dimensione del testo per una migliore leggibilità.

---

### Impostazioni solo per Amministratori

#### Backup e Ripristino

##### Creare un backup

1. Andare in **Impostazioni → Backup**
2. Cliccare su **Crea Backup**
3. Attendere il completamento (viene mostrata una barra di progresso)
4. Il file ZIP viene scaricato automaticamente

**Cosa contiene il backup:**
- Tutti i dati degli utenti (JSON)
- Tutti i certificati allegati (file originali)
- Dati degli operatori
- Impostazioni del sistema
- Note della bacheca

**Nome file:** `gestcert_BK_[data_ora].zip`

##### Ripristinare un backup

1. Andare in **Impostazioni → Backup**
2. Cliccare su **Ripristina Backup**
3. Selezionare il file ZIP di backup
4. Verificare l'anteprima (numero utenti, certificati, data backup)
5. Cliccare su **Conferma Ripristino**
6. Attendere il completamento (il sistema si ricarica automaticamente)

**Attenzione:** Il ripristino sovrascrive tutti i dati attuali.

#### Manutenzione

##### Rimozione certificati duplicati

1. Andare in **Impostazioni → Manutenzione**
2. Cliccare su **Rimuovi Duplicati**
3. Il sistema elimina automaticamente i certificati identici

#### Tipi Certificato

Gestire l'elenco dei tipi di certificato disponibili nel sistema.

**Aggiungere un tipo:**
1. Cliccare su **Nuovo Tipo**
2. Inserire il nome del certificato
3. Salvare

**Modificare un tipo:**
1. Cliccare sull'icona di modifica
2. Modificare il nome
3. Salvare

**Eliminare un tipo:**
1. Cliccare sull'icona del cestino
2. Confermare

**Ripristinare i tipi predefiniti:**
1. Cliccare su **Reset Default**
2. Confermare

#### Configurazione Email SMTP

Per abilitare l'invio di notifiche via email, configurare il server SMTP.

1. Andare in **Impostazioni → Email SMTP**
2. Compilare i campi:

| Campo | Descrizione | Esempio |
|-------|-------------|---------|
| Server SMTP | Indirizzo del server | smtp.gmail.com |
| Porta | Porta del server | 587 |
| Crittografia | Tipo di sicurezza | SSL, TLS o Nessuna |
| Utente | Nome utente/email | nome@dominio.it |
| Password | Password dell'account | ●●●●●●●● |
| Email Mittente | Indirizzo visualizzato | noreply@azienda.it |
| Nome Mittente | Nome visualizzato | GestCert Sistema |
| Reply-To | Indirizzo per risposte | segreteria@azienda.it |

3. Cliccare su **Salva**
4. Cliccare su **Test Email** per verificare la configurazione

**Nota:** La password viene nascosta dopo il salvataggio per sicurezza.

#### Notifiche Scadenze

Configurare l'invio automatico di notifiche per i certificati in scadenza.

##### Abilitare le notifiche

1. Andare in **Impostazioni → Notifiche**
2. Attivare l'interruttore **Abilita Notifiche**

##### Configurare le soglie

Selezionare quando inviare le notifiche:
- ☑️ 60 giorni prima
- ☑️ 30 giorni prima
- ☑️ 14 giorni prima
- ☑️ 7 giorni prima
- ☑️ 3 giorni prima
- ☑️ 1 giorno prima

##### Modalità di invio

Scegliere tra:
- **Riepilogo giornaliero:** una sola email con tutte le scadenze
- **Email singole:** una email per ogni certificato in scadenza

##### Destinatari

- **Notifica operatori:** invia email agli operatori del sistema
- **Notifica utenti:** invia email ai lavoratori (se hanno email registrata)

##### Personalizzare i template

I template supportano variabili che vengono sostituite automaticamente:

| Variabile | Descrizione |
|-----------|-------------|
| `{{firstName}}` | Nome del lavoratore |
| `{{lastName}}` | Cognome del lavoratore |
| `{{certificateName}}` | Nome del certificato |
| `{{expiryDate}}` | Data di scadenza |
| `{{daysUntilExpiry}}` | Giorni mancanti alla scadenza |
| `{{certList}}` | Lista certificati (per email singole) |
| `{{digestList}}` | Lista riepilogativa (per digest) |

##### Invio manuale

Cliccare su **Invia Notifiche Ora** per forzare l'invio immediato delle notifiche.

---

## Suggerimenti e Best Practice

### Gestione quotidiana

1. **Controllare la Dashboard ogni giorno:** I widget delle scadenze permettono di avere sempre sotto controllo la situazione
2. **Gestire le scadenze per tempo:** Intervenire sui certificati in giallo (30 giorni) per avere margine
3. **Utilizzare la bacheca:** Per comunicazioni interne tra operatori

### Inserimento dati

1. **Iniziare sempre dal Codice Fiscale:** Il sistema compila automaticamente molti campi
2. **Verificare i dati auto-compilati:** Controllare sempre che i dati estratti dal CF siano corretti
3. **Caricare sempre i file dei certificati:** Avere una copia digitale è fondamentale

### Sicurezza

1. **Non condividere le credenziali:** Ogni operatore deve avere il proprio account
2. **Cambiare periodicamente la password:** Almeno ogni 3-6 mesi
3. **Effettuare il logout:** Sempre quando ci si allontana dal computer

### Backup

1. **Effettuare backup regolari:** Almeno settimanalmente
2. **Conservare i backup in luogo sicuro:** Su un disco esterno o servizio cloud
3. **Testare periodicamente il ripristino:** Per assicurarsi che i backup funzionino

### Import CSV

1. **Utilizzare sempre il template ufficiale:** Scaricare il template dalle Impostazioni
2. **Non modificare le intestazioni:** Il sistema le utilizza per riconoscere i campi
3. **Controllare l'anteprima:** Prima di confermare, verificare che i dati siano corretti
4. **Correggere gli errori:** Sistemare il file CSV e reimportare in caso di errori

---

## Domande Frequenti (FAQ)

### Accesso e Login

**D: Ho dimenticato la password, come posso recuperarla?**

R: Contattare un Amministratore che potrà reimpostare la password dal pannello Operatori.

**D: Perché vengo disconnesso automaticamente?**

R: Per sicurezza, il sistema effettua il logout dopo 2 minuti di inattività. Salvare frequentemente il lavoro.

**D: Posso accedere da più dispositivi contemporaneamente?**

R: Sì, ma è consigliabile utilizzare un solo dispositivo per evitare conflitti sui dati.

---

### Utenti e Certificati

**D: Ho inserito un Codice Fiscale ma i campi non si compilano automaticamente.**

R: Verificare che il Codice Fiscale sia digitato correttamente e sia un CF italiano valido. Per CF esteri il sistema non può estrarre i dati.

**D: Non riesco a caricare un certificato, cosa faccio?**

R: Controllare che il file sia in formato PDF, PNG o JPG e che non superi le dimensioni massime consentite (generalmente 10 MB).

**D: Ho eliminato un utente per errore, posso recuperarlo?**

R: L'eliminazione è permanente. L'unico modo per recuperare i dati è ripristinare un backup precedente (se disponibile).

**D: Cosa significa lo stato "Sospeso" per un utente?**

R: Un utente sospeso rimane nel sistema ma è temporaneamente disattivato. Può essere riattivato in qualsiasi momento. Utile per lavoratori in aspettativa o trasferimento temporaneo.

**D: Posso modificare un certificato già inserito?**

R: Sì, aprire il certificato e modificare i campi desiderati. È anche possibile aggiornare il file allegato.

---

### Import/Export

**D: L'importazione CSV non funziona, mostra errori.**

R: Verificare che:
- Il file sia in formato CSV (non Excel .xlsx)
- Il separatore sia il punto e virgola (;)
- Le intestazioni delle colonne corrispondano al template
- I dati siano nel formato corretto (es. date in formato GG/MM/AAAA)

**D: Come apro il file CSV esportato?**

R: Aprire Excel, selezionare "Apri" → scegliere il file CSV → nella procedura guidata selezionare "punto e virgola" come separatore.

**D: Il PDF esportato non mostra tutti i dati.**

R: Verificare che l'utente abbia tutti i campi compilati. I campi vuoti non vengono visualizzati nel PDF.

---

### Notifiche Email

**D: Ho configurato l'SMTP ma le email non arrivano.**

R: Verificare:
- Che il test email funzioni (pulsante "Test Email")
- Che le notifiche siano abilitate
- Che gli utenti abbiano un indirizzo email valido
- Che le email non finiscano nella cartella spam

**D: Posso inviare notifiche solo a certi utenti?**

R: Al momento le notifiche vengono inviate a tutti gli utenti con email valida. È possibile però disabilitare temporaneamente l'email di un utente rimuovendola dal suo profilo.

**D: Come faccio a sapere se una notifica è stata inviata?**

R: Il log delle attività nella Dashboard registra anche l'invio delle notifiche.

---

### Backup e Ripristino

**D: Quanto spazio occupa un backup?**

R: Dipende dal numero di utenti e soprattutto dai file dei certificati allegati. Un backup tipico può variare da pochi MB a diversi GB.

**D: Posso ripristinare solo alcuni dati dal backup?**

R: No, il ripristino è completo e sovrascrive tutti i dati. Per recuperare dati specifici è necessario ripristinare completamente e poi eventualmente riesportare.

**D: Il ripristino ha fallito, cosa faccio?**

R: Verificare che il file ZIP non sia corrotto e che sia stato generato da GestCert. In caso di problemi persistenti, contattare l'assistenza tecnica.

---

### Problemi Comuni

**D: La pagina non si carica o mostra errori.**

R: Provare a:
1. Ricaricare la pagina (F5 o Ctrl+R)
2. Svuotare la cache del browser
3. Provare con un altro browser
4. Verificare la connessione Internet

**D: I dati non si salvano.**

R: Verificare:
- Di aver cliccato il pulsante Salva
- Di avere una connessione Internet attiva
- Che non ci siano messaggi di errore (in rosso)

**D: Il sistema è molto lento.**

R: Provare a:
1. Chiudere altre schede del browser
2. Svuotare la cache
3. Se il problema persiste, contattare l'assistenza tecnica

---

## Assistenza Tecnica

Per problemi non risolti da questa guida, contattare l'assistenza tecnica fornendo:
- Descrizione dettagliata del problema
- Screenshot dell'errore (se presente)
- Browser e sistema operativo utilizzati
- Data e ora in cui si è verificato il problema

---

*Guida Utente GestCert v2.0 - Ultimo aggiornamento: Gennaio 2026*
