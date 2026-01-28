import { supabase } from './supabase';
import { User, Certificate, Operator, UserStatus, Role, AppSettings } from '../types';
import { hashPassword } from './password';
import { STORAGE_BUCKET } from './config';
import { base64ToDataUrl, deleteStorageUrl, isDataUrl, looksLikeBase64, storageUrlFor, uploadDataUrlToStorage } from './storage';

function getExtensionFromDataUrl(dataUrl: string): string {
  if (dataUrl.startsWith('data:application/pdf')) return 'pdf';
  if (dataUrl.startsWith('data:image/jpeg')) return 'jpg';
  if (dataUrl.startsWith('data:image/png')) return 'png';
  return 'bin';
}

// ============ USERS SERVICE ============

export const usersService = {
  async getAll(): Promise<User[]> {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('last_name', { ascending: true });

    if (error) throw error;

    let certs: Record<string, unknown>[] = [];
    try {
      const { data: certData, error: certError } = await supabase
        .from('certificates')
        .select('*');
      if (certError) {
        console.warn('Impossibile caricare certificati:', certError.message);
      } else {
        certs = certData || [];
      }
    } catch (err) {
      console.warn('Errore caricamento certificati:', err);
    }

    const certsByUser = new Map<string, Record<string, unknown>[]>();
    for (const cert of certs) {
      const userId = cert.user_id as string;
      if (!userId) continue;
      const list = certsByUser.get(userId) || [];
      list.push(cert);
      certsByUser.set(userId, list);
    }

    return (users || []).map(u =>
      mapDbUserToUser({ ...u, certificates: certsByUser.get(u.id as string) || [] })
    );
  },

  async getById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    let certs: Record<string, unknown>[] = [];
    try {
      const { data: certData, error: certError } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', id);
      if (certError) {
        console.warn('Impossibile caricare certificati utente:', certError.message);
      } else {
        certs = certData || [];
      }
    } catch (err) {
      console.warn('Errore caricamento certificati utente:', err);
    }

    return mapDbUserToUser({ ...data, certificates: certs });
  },

  async checkEmailExists(email: string, excludeUserId?: string): Promise<boolean> {
    if (!email || email.trim() === '') return false;

    let query = supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim());

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data } = await query.maybeSingle();
    return !!data;
  },

  async checkFiscalCodeExists(fiscalCode: string, excludeUserId?: string): Promise<boolean> {
    if (!fiscalCode || fiscalCode.trim() === '') return false;

    let query = supabase
      .from('users')
      .select('id')
      .eq('fiscal_code', fiscalCode.toUpperCase().trim());

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data } = await query.maybeSingle();
    return !!data;
  },

  async create(user: Omit<User, 'id'>, skipEmailCheck: boolean = false): Promise<User> {
    // Verifica email duplicata SOLO se richiesto (non per import)
    if (!skipEmailCheck && user.email && user.email.trim() !== '') {
      const emailExists = await this.checkEmailExists(user.email);
      if (emailExists) {
        throw new Error(`L'email "${user.email}" è già utilizzata da un altro utente`);
      }
    }

    // Verifica codice fiscale duplicato (solo se non vuoto)
    if (user.fiscalCode && user.fiscalCode.trim() !== '' && user.fiscalCode !== '0') {
      const cfExists = await this.checkFiscalCodeExists(user.fiscalCode);
      if (cfExists) {
        throw new Error(`Il codice fiscale "${user.fiscalCode}" è già utilizzato da un altro utente`);
      }
    }

    const dbUser = mapUserToDbUser(user as User);
    // Usa NULL invece di stringa vuota per email (evita conflitti unique constraint)
    if (!dbUser.email || (dbUser.email as string).trim() === '') {
      dbUser.email = null;
    }

    // Prima prova con l'email
    let { data, error } = await supabase
      .from('users')
      .insert(dbUser)
      .select()
      .single();

    // Se errore di unique constraint e siamo in modalità import, riprova senza email
    // Gli errori possono contenere: "email", "duplicate key", "unique constraint", codice "23505"
    const isUniqueError = error && (
      error.message?.toLowerCase().includes('email') ||
      error.message?.toLowerCase().includes('duplicate') ||
      error.message?.toLowerCase().includes('unique') ||
      error.code === '23505'
    );

    if (isUniqueError && skipEmailCheck && dbUser.email) {
      console.warn(`[Import] Conflitto unique per ${user.lastName} ${user.firstName}, riprovo senza email. Errore: ${error.message}`);
      dbUser.email = null;
      const retry = await supabase
        .from('users')
        .insert(dbUser)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error(`[Import] Errore creazione utente ${user.lastName}:`, error);
      throw error;
    }

    // Se ci sono certificati, creali con sistema di retry e verifica
    if (user.certificates && user.certificates.length > 0) {
      // Helper per preparare fileUrl per upload
      const prepareFileUrl = async (fileUrl: string | null | undefined, certName: string, userId: string): Promise<string | null> => {
        if (!fileUrl) return null;
        if (fileUrl.startsWith('storage://')) return fileUrl;

        if (!isDataUrl(fileUrl) && looksLikeBase64(fileUrl)) {
          const normalized = base64ToDataUrl(fileUrl);
          if (normalized) fileUrl = normalized;
        }

        if (fileUrl && isDataUrl(fileUrl)) {
          const safeName = certName.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ_-]/g, '_');
          const ext = getExtensionFromDataUrl(fileUrl);
          const path = `users/${userId}/${Date.now()}_${safeName}.${ext}`;
          const uploaded = await uploadDataUrlToStorage(STORAGE_BUCKET, path, fileUrl);
          return uploaded ? storageUrlFor(STORAGE_BUCKET, path) : null;
        }
        return null;
      };

      // Helper per inserire con retry
      const insertWithRetry = async (
        cert: Certificate,
        userId: string,
        preparedFileUrl: string | null,
        maxRetries: number = 3
      ): Promise<boolean> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const { error: insertError } = await supabase
            .from('certificates')
            .insert({
              user_id: userId,
              name: cert.name,
              issue_date: cert.issueDate || null,
              expiry_date: cert.expiryDate,
              file_url: preparedFileUrl
            });

          if (!insertError) {
            console.log(`[Cert] Certificato "${cert.name}" salvato (tentativo ${attempt})`);
            return true;
          }

          console.warn(`[Cert] Tentativo ${attempt}/${maxRetries} fallito per "${cert.name}":`, insertError.message);

          if (insertError.message?.includes('too large') || insertError.code === '54000') {
            throw new Error(`Il file allegato al certificato "${cert.name}" è troppo grande.`);
          }

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }
        return false;
      };

      // Inserisci tutti i certificati
      for (const cert of user.certificates) {
        const fileUrl = await prepareFileUrl(cert.fileUrl, cert.name, data.id);
        await insertWithRetry(cert, data.id, fileUrl);
      }

      // VERIFICA: controlla che tutti i certificati siano stati salvati
      const { data: savedCerts } = await supabase
        .from('certificates')
        .select('name')
        .eq('user_id', data.id);

      const savedNames = new Set((savedCerts || []).map(c => (c.name as string).toLowerCase().trim()));
      const expectedCerts = user.certificates.filter(c => c.name && c.expiryDate);
      const missing = expectedCerts.filter(c => !savedNames.has(c.name.toLowerCase().trim()));

      // Riprova per i mancanti
      if (missing.length > 0) {
        console.warn(`[Cert] ${missing.length} certificati mancanti, riprovo...`);
        for (const cert of missing) {
          const fileUrl = await prepareFileUrl(cert.fileUrl, cert.name, data.id);
          await insertWithRetry(cert, data.id, fileUrl, 2);
        }

        // Verifica finale
        const { data: finalCerts } = await supabase
          .from('certificates')
          .select('name')
          .eq('user_id', data.id);

        const finalNames = new Set((finalCerts || []).map(c => (c.name as string).toLowerCase().trim()));
        const stillMissing = expectedCerts.filter(c => !finalNames.has(c.name.toLowerCase().trim()));

        if (stillMissing.length > 0) {
          const names = stillMissing.map(c => c.name).join(', ');
          throw new Error(`Impossibile salvare i certificati: ${names}. Riprova.`);
        }
      }
    }

    // Recupera certificati salvati
    const { data: finalCertificates } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', data.id);

    return mapDbUserToUser({ ...data, certificates: finalCertificates || [] });
  },

  async update(id: string, user: Partial<User>): Promise<User> {
    // Verifica email duplicata (solo se fornita e non vuota)
    if (user.email !== undefined && user.email && user.email.trim() !== '') {
      const emailExists = await this.checkEmailExists(user.email, id);
      if (emailExists) {
        throw new Error(`L'email "${user.email}" è già utilizzata da un altro utente`);
      }
    }

    // Verifica codice fiscale duplicato (solo se fornito e non vuoto)
    if (user.fiscalCode !== undefined && user.fiscalCode && user.fiscalCode.trim() !== '') {
      const cfExists = await this.checkFiscalCodeExists(user.fiscalCode, id);
      if (cfExists) {
        throw new Error(`Il codice fiscale "${user.fiscalCode}" è già utilizzato da un altro utente`);
      }
    }

    const dbUser = mapUserToDbUser(user as User);
    // Usa NULL invece di stringa vuota per email
    if (dbUser.email !== undefined && (!dbUser.email || (dbUser.email as string).trim() === '')) {
      dbUser.email = null;
    }

    const { data, error } = await supabase
      .from('users')
      .update({ ...dbUser, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Gestisci i certificati se forniti
    if (user.certificates !== undefined) {
      // Helper per preparare fileUrl per upload
      const prepareFileUrl = async (fileUrl: string | null | undefined, certName: string, userId: string): Promise<string | null> => {
        if (!fileUrl) return null;
        if (fileUrl.startsWith('storage://')) return fileUrl; // Già su storage

        if (!isDataUrl(fileUrl) && looksLikeBase64(fileUrl)) {
          const normalized = base64ToDataUrl(fileUrl);
          if (normalized) fileUrl = normalized;
        }

        if (fileUrl && isDataUrl(fileUrl)) {
          const safeName = certName.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ_-]/g, '_');
          const ext = getExtensionFromDataUrl(fileUrl);
          const path = `users/${userId}/${Date.now()}_${safeName}.${ext}`;
          const uploaded = await uploadDataUrlToStorage(STORAGE_BUCKET, path, fileUrl);
          return uploaded ? storageUrlFor(STORAGE_BUCKET, path) : null;
        }
        return null;
      };

      // Helper per inserire un certificato con retry
      const insertCertificateWithRetry = async (
        cert: Certificate,
        userId: string,
        preparedFileUrl: string | null,
        maxRetries: number = 3
      ): Promise<{ success: boolean; error?: string }> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const { error: insertError } = await supabase
            .from('certificates')
            .insert({
              user_id: userId,
              name: cert.name,
              issue_date: cert.issueDate || null,
              expiry_date: cert.expiryDate,
              file_url: preparedFileUrl
            });

          if (!insertError) {
            console.log(`[Cert] Certificato "${cert.name}" salvato con successo (tentativo ${attempt})`);
            return { success: true };
          }

          console.warn(`[Cert] Tentativo ${attempt}/${maxRetries} fallito per "${cert.name}":`, insertError.message);

          if (insertError.message?.includes('too large') || insertError.code === '54000') {
            return { success: false, error: `File troppo grande per "${cert.name}"` };
          }

          // Aspetta prima di riprovare (backoff esponenziale)
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }
        return { success: false, error: `Impossibile salvare "${cert.name}" dopo ${maxRetries} tentativi` };
      };

      // Recupera certificati esistenti
      const { data: existingCerts, error: fetchError } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', id);

      if (fetchError) {
        console.error('Errore recupero certificati esistenti:', fetchError);
      }

      const existingList = existingCerts || [];
      const existingById = new Map(existingList.map(c => [c.id as string, c]));
      const existingIds = new Set(existingList.map(c => c.id as string));
      const newCertIds = new Set(user.certificates.filter(c => c.id).map(c => c.id));

      // Trova certificati da eliminare (esistono nel DB ma non nella lista nuova)
      const toDelete = existingList.filter(c => !newCertIds.has(c.id));
      for (const cert of toDelete) {
        if (cert.file_url && typeof cert.file_url === 'string') {
          try {
            await deleteStorageUrl(cert.file_url);
          } catch (err) {
            console.warn(`Errore rimozione file storage per certificato ${cert.id}:`, err);
          }
        }
        const { error: deleteError } = await supabase
          .from('certificates')
          .delete()
          .eq('id', cert.id);

        if (deleteError) {
          console.error(`Errore eliminazione certificato ${cert.id}:`, deleteError);
        }
      }

      // Trova certificati da aggiungere (nuovi, con ID temporaneo o senza ID nel DB)
      const toAdd = user.certificates.filter(c => !existingIds.has(c.id));

      // Trova certificati da aggiornare (già presenti nel DB)
      const toUpdate = user.certificates.filter(c => existingIds.has(c.id));

      // Aggiorna certificati esistenti
      for (const cert of toUpdate) {
        const existing = existingById.get(cert.id);
        if (!existing) continue;

        const fileUrl = await prepareFileUrl(cert.fileUrl, cert.name, id);

        const updatePayload = {
          name: cert.name,
          issue_date: cert.issueDate || null,
          expiry_date: cert.expiryDate,
          file_url: fileUrl
        };

        const isSame =
          (existing.name as string) === updatePayload.name &&
          (existing.issue_date as string | null) === updatePayload.issue_date &&
          (existing.expiry_date as string) === updatePayload.expiry_date &&
          (existing.file_url as string | null) === updatePayload.file_url;

        if (!isSame) {
          const { error: updateError } = await supabase
            .from('certificates')
            .update(updatePayload)
            .eq('id', cert.id);

          if (updateError) {
            console.error(`Errore aggiornamento certificato ${cert.name}:`, updateError);
            if (updateError.message?.includes('too large') || updateError.code === '54000') {
              throw new Error(`Il file allegato al certificato "${cert.name}" è troppo grande. Rimuovi il file e riprova.`);
            } else {
              throw new Error(`Impossibile aggiornare il certificato "${cert.name}": ${updateError.message || 'errore sconosciuto'}`);
            }
          } else {
            const oldFileUrl = existing.file_url as string | null;
            const newFileUrl = updatePayload.file_url as string | null;
            if (oldFileUrl && oldFileUrl.startsWith('storage://') && oldFileUrl !== newFileUrl) {
              try {
                await deleteStorageUrl(oldFileUrl);
              } catch (err) {
                console.warn(`Errore rimozione vecchio file storage per certificato ${cert.id}:`, err);
              }
            }
          }
        }
      }

      // Prepara i file URL per i nuovi certificati (prima di inserirli)
      const toAddWithUrls: Array<{ cert: Certificate; fileUrl: string | null }> = [];
      for (const cert of toAdd) {
        const fileUrl = await prepareFileUrl(cert.fileUrl, cert.name, id);
        toAddWithUrls.push({ cert, fileUrl });
      }

      // Inserisci nuovi certificati con retry
      const insertErrors: string[] = [];
      for (const { cert, fileUrl } of toAddWithUrls) {
        const result = await insertCertificateWithRetry(cert, id, fileUrl);
        if (!result.success && result.error) {
          insertErrors.push(result.error);
        }
      }

      // VERIFICA POST-SALVATAGGIO: controlla che tutti i certificati siano nel DB
      const { data: savedCerts, error: verifyError } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', id);

      if (verifyError) {
        console.error('Errore verifica certificati:', verifyError);
      }

      const savedCertNames = new Set((savedCerts || []).map(c => (c.name as string).toLowerCase().trim()));
      const expectedCerts = user.certificates.filter(c => c.name && c.expiryDate);
      const missingCerts = expectedCerts.filter(c => !savedCertNames.has(c.name.toLowerCase().trim()));

      // Se ci sono certificati mancanti, riprova
      if (missingCerts.length > 0) {
        console.warn(`[Cert] Verifica fallita: ${missingCerts.length} certificati mancanti. Riprovo...`);

        for (const cert of missingCerts) {
          const fileUrl = await prepareFileUrl(cert.fileUrl, cert.name, id);
          const result = await insertCertificateWithRetry(cert, id, fileUrl, 2);
          if (!result.success && result.error) {
            insertErrors.push(result.error);
          }
        }

        // Verifica finale
        const { data: finalCerts } = await supabase
          .from('certificates')
          .select('name')
          .eq('user_id', id);

        const finalCertNames = new Set((finalCerts || []).map(c => (c.name as string).toLowerCase().trim()));
        const stillMissing = expectedCerts.filter(c => !finalCertNames.has(c.name.toLowerCase().trim()));

        if (stillMissing.length > 0) {
          const missingNames = stillMissing.map(c => c.name).join(', ');
          throw new Error(`Impossibile salvare i seguenti certificati: ${missingNames}. Verifica la connessione e riprova.`);
        }
      }

      // Se ci sono stati errori ma tutti i certificati sono ora salvati, mostra warning
      if (insertErrors.length > 0) {
        console.warn('[Cert] Alcuni errori durante il salvataggio (risolti con retry):', insertErrors);
      }
    }

    // Recupera certificati aggiornati
    const { data: certs, error: certsError } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', id);

    if (certsError) {
      console.error('Errore recupero certificati finali:', certsError);
    }

    return mapDbUserToUser({ ...data, certificates: certs || [] });
  },

  async delete(id: string): Promise<void> {
    const { data: certs, error: certsError } = await supabase
      .from('certificates')
      .select('file_url')
      .eq('user_id', id);

    if (!certsError && certs) {
      for (const cert of certs) {
        if (cert.file_url && typeof cert.file_url === 'string') {
          try {
            await deleteStorageUrl(cert.file_url);
          } catch (err) {
            console.warn(`Errore rimozione file storage per utente ${id}:`, err);
          }
        }
      }
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async deleteMany(ids: string[]): Promise<void> {
    const { data: certs, error: certsError } = await supabase
      .from('certificates')
      .select('file_url')
      .in('user_id', ids);

    if (!certsError && certs) {
      for (const cert of certs) {
        if (cert.file_url && typeof cert.file_url === 'string') {
          try {
            await deleteStorageUrl(cert.file_url);
          } catch (err) {
            console.warn('Errore rimozione file storage per eliminazione multipla:', err);
          }
        }
      }
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .in('id', ids);

    if (error) throw error;
  }
};

// ============ CERTIFICATES SERVICE ============

export const certificatesService = {
  async create(userId: string, cert: Omit<Certificate, 'id'>): Promise<Certificate> {
    const { data, error } = await supabase
      .from('certificates')
      .insert({
        user_id: userId,
        name: cert.name,
        issue_date: cert.issueDate || null,
        expiry_date: cert.expiryDate,
        file_url: cert.fileUrl || null
      })
      .select()
      .single();

    if (error) throw error;
    return mapDbCertToCert(data);
  },

  async delete(id: string): Promise<void> {
    const { data: existing, error: fetchError } = await supabase
      .from('certificates')
      .select('file_url')
      .eq('id', id)
      .single();

    if (!fetchError && existing?.file_url) {
      try {
        await deleteStorageUrl(existing.file_url as string);
      } catch (err) {
        console.warn(`Errore rimozione file storage per certificato ${id}:`, err);
      }
    }

    const { error } = await supabase
      .from('certificates')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getExpiring(days: number): Promise<{ user: User; certificate: Certificate }[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const { data, error } = await supabase
      .from('certificates')
      .select(`
        *,
        users (*)
      `)
      .lte('expiry_date', futureDate.toISOString().split('T')[0])
      .gte('expiry_date', new Date().toISOString().split('T')[0]);

    if (error) throw error;

    return (data || []).map(item => ({
      user: mapDbUserToUser({ ...item.users, certificates: [] }),
      certificate: mapDbCertToCert(item)
    }));
  }
};

// ============ OPERATORS SERVICE ============

export const operatorsService = {
  async getAll(): Promise<Operator[]> {
    const { data, error } = await supabase
      .from('operators')
      .select('*')
      .order('last_name', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapDbOperatorToOperator);
  },

  async getByEmail(email: string): Promise<Operator | null> {
    const { data, error } = await supabase
      .from('operators')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapDbOperatorToOperator(data) : null;
  },

  async getByAuthUserId(authUserId: string): Promise<Operator | null> {
    const { data, error } = await supabase
      .from('operators')
      .select('*')
      .eq('auth_user_id', authUserId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? mapDbOperatorToOperator(data) : null;
  },

  async create(operator: Omit<Operator, 'id'> & { password?: string; passwordHash?: string }): Promise<Operator> {
    let passwordHash = operator.passwordHash;
    if (!passwordHash && operator.password) {
      passwordHash = await hashPassword(operator.password);
    }
    const { data, error } = await supabase
      .from('operators')
      .insert({
        first_name: operator.firstName,
        last_name: operator.lastName,
        email: operator.email.toLowerCase().trim(),
        password_hash: passwordHash || null,
        role: operator.role,
        status: operator.status
      })
      .select()
      .single();

    if (error) throw error;
    return mapDbOperatorToOperator(data);
  },

  async update(id: string, operator: Partial<Operator> & { password?: string; passwordHash?: string }): Promise<Operator> {
    const updateData: Record<string, unknown> = {};
    if (operator.firstName) updateData.first_name = operator.firstName;
    if (operator.lastName) updateData.last_name = operator.lastName;
    if (operator.email) updateData.email = operator.email.toLowerCase().trim();
    if (operator.role) updateData.role = operator.role;
    if (operator.status) updateData.status = operator.status;
    if (operator.passwordHash) {
      updateData.password_hash = operator.passwordHash;
    } else if (operator.password) {
      updateData.password_hash = await hashPassword(operator.password);
    }

    const { data, error } = await supabase
      .from('operators')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapDbOperatorToOperator(data);
  },

  async updateLastAccess(id: string): Promise<void> {
    const { error } = await supabase
      .from('operators')
      .update({ last_access: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('operators')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};

// ============ SETTINGS SERVICE ============

export const settingsService = {
  // In modalità hybrid, usiamo operator_email come identificatore
  async get(operatorIdOrEmail: string): Promise<AppSettings | null> {
    // Prova prima con operator_email (hybrid mode)
    let { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('operator_email', operatorIdOrEmail)
      .single();

    // Se non trova, prova con operator_id (retrocompatibilità)
    if (error?.code === 'PGRST116') {
      const result = await supabase
        .from('settings')
        .select('*')
        .eq('operator_id', operatorIdOrEmail)
        .single();
      data = result.data;
      error = result.error;
    }

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) return null;

    return {
      theme: data.theme as 'light' | 'dark',
      fontSize: data.font_size as 'small' | 'medium' | 'large',
      widgets: data.widgets as AppSettings['widgets'],
      smtp: data.smtp_config as AppSettings['smtp']
    };
  },

  async upsert(operatorIdOrEmail: string, settings: AppSettings): Promise<void> {
    // Usa operator_email per hybrid mode
    const { error } = await supabase
      .from('settings')
      .upsert({
        operator_email: operatorIdOrEmail,
        theme: settings.theme,
        font_size: settings.fontSize,
        widgets: settings.widgets,
        smtp_config: settings.smtp,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'operator_email'
      });

    if (error) throw error;
  }
};

// ============ BACHECA SERVICE ============

export interface NotaBacheca {
  id: string;
  contenuto: string;
  operatoreId?: string;
  operatoreNome: string;
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  completedById?: string;
}

export const bachecaService = {
  async getAll(): Promise<NotaBacheca[]> {
    // Pulizia automatica: elimina note completate più vecchie di 60 giorni
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { error: cleanupError } = await supabase
      .from('bacheca')
      .delete()
      .eq('completed', true)
      .lt('completed_at', sixtyDaysAgo.toISOString());

    if (cleanupError) {
      console.warn('[Bacheca] Errore pulizia note vecchie:', cleanupError.message);
    }

    // Recupera le note (ordinate per data, più recenti prima)
    const { data, error } = await supabase
      .from('bacheca')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;
    return (data || []).map(mapDbNotaToNota);
  },

  async create(contenuto: string, _operatoreId: string, operatoreNome: string): Promise<NotaBacheca> {
    const { data, error } = await supabase
      .from('bacheca')
      .insert({
        contenuto,
        operatore_nome: operatoreNome
        // operatore_id non usato in modalità hybrid (ID locale non valido su Supabase)
      })
      .select()
      .single();

    if (error) throw error;
    return mapDbNotaToNota(data);
  },

  async update(id: string, contenuto: string): Promise<NotaBacheca> {
    const { data, error } = await supabase
      .from('bacheca')
      .update({
        contenuto,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapDbNotaToNota(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('bacheca')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async toggle(id: string, operatoreId: string, operatoreNome: string): Promise<NotaBacheca> {
    // Prima recupera lo stato attuale
    const { data: current, error: fetchError } = await supabase
      .from('bacheca')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const isCompleted = current.completed as boolean;

    const updateData = isCompleted
      ? {
          completed: false,
          completed_at: null,
          completed_by: null,
          completed_by_id: null,
          updated_at: new Date().toISOString()
        }
      : {
          completed: true,
          completed_at: new Date().toISOString(),
          completed_by: operatoreNome,
          completed_by_id: operatoreId,
          updated_at: new Date().toISOString()
        };

    const { data, error } = await supabase
      .from('bacheca')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return mapDbNotaToNota(data);
  },

  async clearCompleted(): Promise<void> {
    const { error } = await supabase
      .from('bacheca')
      .delete()
      .eq('completed', true);

    if (error) throw error;
  }
};

function mapDbNotaToNota(dbNota: Record<string, unknown>): NotaBacheca {
  return {
    id: dbNota.id as string,
    contenuto: dbNota.contenuto as string,
    operatoreId: dbNota.operatore_id as string | undefined,
    operatoreNome: dbNota.operatore_nome as string || 'Sistema',
    createdAt: dbNota.created_at as string,
    updatedAt: dbNota.updated_at as string,
    completed: dbNota.completed as boolean || false,
    completedAt: dbNota.completed_at as string | undefined,
    completedBy: dbNota.completed_by as string | undefined,
    completedById: dbNota.completed_by_id as string | undefined
  };
}

// ============ MAPPERS ============

function mapDbUserToUser(dbUser: Record<string, unknown>): User {
  return {
    id: dbUser.id as string,
    firstName: (dbUser.first_name as string) || '',
    lastName: (dbUser.last_name as string) || '',
    email: (dbUser.email as string) || '', // Converte NULL in stringa vuota
    phone: dbUser.phone as string | undefined,
    mobile: dbUser.mobile as string | undefined,
    fiscalCode: (dbUser.fiscal_code as string) || '',
    gender: dbUser.gender as 'M' | 'F',
    birthDate: dbUser.birth_date as string,
    birthPlace: dbUser.birth_place as string,
    birthCountry: (dbUser.birth_country as string) || 'IT',
    nationality: dbUser.nationality as string,
    address: dbUser.address as string,
    houseNumber: dbUser.house_number as string | undefined,
    zipCode: dbUser.zip_code as string,
    city: dbUser.city as string,
    province: dbUser.province as string,
    group: dbUser.user_group as string | undefined,
    notes: dbUser.notes as string | undefined,
    status: dbUser.status as UserStatus,
    certificates: ((dbUser.certificates as Record<string, unknown>[]) || []).map(mapDbCertToCert),
    createdAt: dbUser.created_at as string | undefined
  };
}

function mapUserToDbUser(user: User): Record<string, unknown> {
  return {
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    phone: user.phone,
    mobile: user.mobile,
    fiscal_code: user.fiscalCode,
    gender: user.gender,
    birth_date: user.birthDate || null,
    birth_place: user.birthPlace,
    birth_country: user.birthCountry || 'IT',
    nationality: user.nationality,
    address: user.address,
    house_number: user.houseNumber,
    zip_code: user.zipCode,
    city: user.city,
    province: user.province,
    user_group: user.group,
    notes: user.notes,
    status: user.status
  };
}

function mapDbCertToCert(dbCert: Record<string, unknown>): Certificate {
  return {
    id: dbCert.id as string,
    name: dbCert.name as string,
    issueDate: dbCert.issue_date as string,
    expiryDate: dbCert.expiry_date as string,
    fileUrl: dbCert.file_url as string | undefined
  };
}

function mapDbOperatorToOperator(dbOp: Record<string, unknown>): Operator {
  return {
    id: dbOp.id as string,
    firstName: dbOp.first_name as string,
    lastName: dbOp.last_name as string,
    email: dbOp.email as string,
    role: dbOp.role as Role,
    status: dbOp.status as UserStatus,
    lastAccess: dbOp.last_access as string | undefined,
    passwordHash: dbOp.password_hash as string | undefined,
    authUserId: dbOp.auth_user_id as string | undefined
  };
}

// ============ MAINTENANCE SERVICE ============

export const maintenanceService = {
  async removeDuplicateCertificates(): Promise<{ removed: number; usersAffected: number }> {
    const { data, error } = await supabase
      .from('certificates')
      .select('id,user_id,name,issue_date,expiry_date,file_url,created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const seen = new Set<string>();
    const toDelete: string[] = [];
    const affectedUsers = new Set<string>();

    for (const cert of data || []) {
      const key = [
        cert.user_id,
        (cert.name || '').trim(),
        cert.issue_date || '',
        cert.expiry_date || '',
        cert.file_url || ''
      ].join('|');

      if (seen.has(key)) {
        toDelete.push(cert.id as string);
        affectedUsers.add(cert.user_id as string);
      } else {
        seen.add(key);
      }
    }

    if (toDelete.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        const { error: delError } = await supabase
          .from('certificates')
          .delete()
          .in('id', chunk);
        if (delError) throw delError;
      }
    }

    return { removed: toDelete.length, usersAffected: affectedUsers.size };
  }
};

// ============ RESTORE SERVICE ============

export const restoreService = {
  async restoreUsers(users: User[]): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;

    console.log(`[Restore] Inizio ripristino di ${users.length} utenti...`);

    for (const user of users) {
      try {
        console.log(`[Restore] Elaborazione: ${user.lastName} ${user.firstName} (CF: ${user.fiscalCode}, Email: ${user.email})`);

        // Elimina utenti esistenti che potrebbero creare conflitti
        // 1. Per codice fiscale (se presente)
        if (user.fiscalCode && user.fiscalCode.trim() !== '') {
          const { error: delCfError } = await supabase
            .from('users')
            .delete()
            .eq('fiscal_code', user.fiscalCode.toUpperCase().trim());

          if (delCfError) {
            console.warn(`[Restore] Errore eliminazione per CF: ${delCfError.message}`);
          }
        }

        // 2. Per email (se presente e non vuota)
        if (user.email && user.email.trim() !== '') {
          const { error: delEmailError } = await supabase
            .from('users')
            .delete()
            .eq('email', user.email.toLowerCase().trim());

          if (delEmailError) {
            console.warn(`[Restore] Errore eliminazione per email: ${delEmailError.message}`);
          }
        }

        // Prepara i dati utente per l'inserimento
        const dbUser = mapUserToDbUser(user);

        // Gestisci email vuota come NULL per evitare conflitti unique constraint
        if (!user.email || user.email.trim() === '') {
          dbUser.email = null;
        } else {
          dbUser.email = user.email.toLowerCase().trim();
        }

        // Normalizza fiscal_code
        if (dbUser.fiscal_code) {
          dbUser.fiscal_code = (dbUser.fiscal_code as string).toUpperCase().trim();
        }

        console.log(`[Restore] Inserimento utente...`, dbUser);

        // Inserisci l'utente
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert(dbUser)
          .select()
          .single();

        if (userError) {
          console.error(`[Restore] Errore inserimento utente:`, userError);
          errors.push(`Utente ${user.lastName} ${user.firstName}: ${userError.message}`);
          continue;
        }

        console.log(`[Restore] Utente creato con ID: ${newUser.id}`);

        // Inserisci i certificati
        if (user.certificates && user.certificates.length > 0) {
          console.log(`[Restore] Inserimento ${user.certificates.length} certificati...`);

          for (const cert of user.certificates) {
            let fileUrl = cert.fileUrl || null;
            if (fileUrl && fileUrl.startsWith('data:')) {
              const safeName = cert.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ_-]/g, '_');
              const ext = fileUrl.startsWith('data:application/pdf') ? 'pdf' : fileUrl.startsWith('data:image/png') ? 'png' : fileUrl.startsWith('data:image/jpeg') ? 'jpg' : 'bin';
              const path = `users/${newUser.id}/${Date.now()}_${safeName}.${ext}`;
              const uploaded = await uploadDataUrlToStorage(STORAGE_BUCKET, path, fileUrl);
              fileUrl = uploaded ? storageUrlFor(STORAGE_BUCKET, path) : null;
            }

            const certData = {
              user_id: newUser.id,
              name: cert.name,
              issue_date: cert.issueDate || null,
              expiry_date: cert.expiryDate,
              file_url: fileUrl || null
            };

            const { error: certError } = await supabase
              .from('certificates')
              .insert(certData);

            if (certError) {
              console.error(`[Restore] Errore inserimento certificato ${cert.name}:`, certError);
              // Se l'errore è per file troppo grande, segnala ma continua
              if (certError.message?.includes('too large') || certError.code === '54000') {
                errors.push(`Certificato "${cert.name}" per ${user.lastName}: file troppo grande, salvato senza allegato`);
                // Riprova senza file
                await supabase
                  .from('certificates')
                  .insert({ ...certData, file_url: null });
              } else {
                errors.push(`Certificato ${cert.name} per ${user.lastName}: ${certError.message}`);
              }
            }
          }
        }

        success++;
        console.log(`[Restore] Utente ${user.lastName} ${user.firstName} ripristinato con successo`);

      } catch (err) {
        console.error(`[Restore] Eccezione per utente ${user.lastName}:`, err);
        errors.push(`Utente ${user.lastName} ${user.firstName}: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`);
      }
    }

    console.log(`[Restore] Completato: ${success}/${users.length} utenti ripristinati, ${errors.length} errori`);
    return { success, errors };
  },

  async restoreBacheca(note: NotaBacheca[]): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;

    // Prima elimina tutte le note esistenti
    await supabase.from('bacheca').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    for (const nota of note) {
      try {
        const { error } = await supabase
          .from('bacheca')
          .insert({
            contenuto: nota.contenuto,
            operatore_id: nota.operatoreId || null,
            operatore_nome: nota.operatoreNome,
            created_at: nota.createdAt,
            updated_at: nota.updatedAt
          });

        if (error) {
          errors.push(`Nota bacheca: ${error.message}`);
        } else {
          success++;
        }
      } catch (err) {
        errors.push(`Nota bacheca: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`);
      }
    }

    return { success, errors };
  }
};

export const restoreServiceExtras = {
  async restoreOperators(operators: Operator[]): Promise<void> {
    if (!operators || operators.length === 0) return;
    await supabase.from('operators').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    for (const op of operators) {
      await supabase.from('operators').insert({
        id: op.id,
        first_name: op.firstName,
        last_name: op.lastName,
        email: op.email.toLowerCase().trim(),
        role: op.role,
        status: op.status,
        last_access: op.lastAccess || null,
        password_hash: op.passwordHash || null,
        auth_user_id: op.authUserId || null
      });
    }
  },

  async restoreSettings(settings: AppSettings): Promise<void> {
    if (!settings) return;
    await supabase.from('settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { data: operators } = await supabase.from('operators').select('id');
    const ops = operators || [];
    for (const op of ops) {
      await supabase.from('settings').insert({
        operator_id: op.id,
        theme: settings.theme,
        font_size: settings.fontSize,
        widgets: settings.widgets,
        smtp_config: settings.smtp || null
      });
    }
  }
};
