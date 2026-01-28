import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { AppSettings, Role, User, Certificate, Operator } from '../types';
import { NotaBacheca } from '../lib/hooks';
import { Layout, Mail, Save, Download, FileSpreadsheet, Info, Award, Plus, Edit, Trash2, X, Check, RotateCcw, Archive, Loader2, Upload, AlertTriangle, Send, Bell, Clock } from 'lucide-react';
import { useCertificateTypes, CertificateType } from '../lib/hooks';
import { STORAGE_MODE, STORAGE_BUCKET } from '../lib/config';
import { maintenanceService, restoreService, restoreServiceExtras } from '../lib/services';
import { localMaintenanceService } from '../lib/localServices';
import { formatDate } from '../lib/date';
import { createSignedUrl, parseStorageUrl } from '../lib/storage';
import { SmtpConfig, DEFAULT_SMTP_CONFIG, sendTestEmail, sendExpiryNotificationsNow } from '../lib/emailService';
import { getSmtpConfig, saveSmtpConfig } from '../lib/smtpConfig';
import {
  NotificationSettings,
  EmailTemplate,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_EMAIL_TEMPLATES,
  getNotificationSettings,
  saveNotificationSettings,
  getEmailTemplates,
  saveEmailTemplates
} from '../lib/notificationSettings';

interface SettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  role: Role;
  users: User[];
  operators: Operator[];
  bacheca: { note: NotaBacheca[]; loading: boolean; clearAll: () => Promise<void> };
}

const Settings: React.FC<SettingsProps> = ({ settings, setSettings, role, users, operators, bacheca }) => {
  // Certificate Types Management
  const certificateTypes = useCertificateTypes();
  const [editingType, setEditingType] = useState<CertificateType | null>(null);
  const [newType, setNewType] = useState({ name: '', description: '' });
  const [showNewTypeForm, setShowNewTypeForm] = useState(false);

  // Backup state
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');

  // Bacheca clear state
  const [isClearingBacheca, setIsClearingBacheca] = useState(false);
  const [clearBachecaResult, setClearBachecaResult] = useState('');

  // Restore state
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);
  const [restoreStats, setRestoreStats] = useState<{ users: number; certs: number; date: string } | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  // Maintenance state
  const [isDeduping, setIsDeduping] = useState(false);
  const [dedupeResult, setDedupeResult] = useState('');

  // ============ RESTORE FUNCTION ============
  const handleRestoreFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    if (restoreFileRef.current) {
      restoreFileRef.current.value = '';
    }

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      setRestoreProgress('Errore: Seleziona un file ZIP valido');
      setTimeout(() => setRestoreProgress(''), 3000);
      return;
    }

    try {
      setRestoreProgress('Analisi backup...');

      // Read and analyze ZIP
      const zipData = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(zipData);

      // Check for manifest
      const manifestFile = zip.file('gestcert_backup.json');
      if (!manifestFile) {
        setRestoreProgress('Errore: File di backup non valido (manifest mancante)');
        setTimeout(() => setRestoreProgress(''), 3000);
        return;
      }

      const manifestContent = await manifestFile.async('string');
      const manifest = JSON.parse(manifestContent);

      // Extract backup info for confirmation
      const backupInfo = manifest.backupInfo || {};
      const usersCount = Array.isArray(manifest.users) ? manifest.users.length : 0;
      const certsCount = manifest.backupInfo?.totalCertificates || 0;
      const backupDate = backupInfo.createdAt ? formatDate(backupInfo.createdAt) : 'Sconosciuta';

      setRestoreStats({ users: usersCount, certs: certsCount, date: backupDate });
      setPendingRestoreFile(file);
      setShowRestoreConfirm(true);
      setRestoreProgress('');

    } catch (error) {
      console.error('Error analyzing backup:', error);
      setRestoreProgress(`Errore: ${error instanceof Error ? error.message : 'Impossibile leggere il backup'}`);
      setTimeout(() => setRestoreProgress(''), 3000);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) return;

    setShowRestoreConfirm(false);
    setIsRestoring(true);
    setRestoreProgress('Avvio ripristino...');

    try {
      const zipData = await pendingRestoreFile.arrayBuffer();
      const zip = await JSZip.loadAsync(zipData);

      // Load manifest
      setRestoreProgress('Lettura manifest...');
      const manifestFile = zip.file('gestcert_backup.json');
      if (!manifestFile) throw new Error('Manifest non trovato');

      const manifestContent = await manifestFile.async('string');
      const manifest = JSON.parse(manifestContent);

      // Restore users with certificates
      setRestoreProgress('Elaborazione utenti e certificati...');
      const usersFromBackup: User[] = manifest.users || [];

      // Process users and restore certificate files from ZIP
      const processedUsers: User[] = [];

      for (let i = 0; i < usersFromBackup.length; i++) {
        const user = usersFromBackup[i];
        setRestoreProgress(`Elaborazione ${i + 1}/${usersFromBackup.length}: ${user.lastName} ${user.firstName}...`);

        // Normalize folder name same way as backup
        const folderName = `${user.lastName}_${user.firstName}`.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ_-]/g, '_');
        const userFolderPath = `utenti/${folderName}`;

        // Try to load user data from individual JSON if exists
        const userDataFile = zip.file(`${userFolderPath}/dati_utente.json`);
        let userData = user;
        if (userDataFile) {
          const userDataContent = await userDataFile.async('string');
          userData = JSON.parse(userDataContent);
        }

        // Restore certificates with file data
        const restoredCerts: Certificate[] = [];

        if (userData.certificates && userData.certificates.length > 0) {
          for (const cert of userData.certificates) {
            const extension = (cert as Record<string, unknown>).extension as string | undefined;
            const safeBase = `${cert.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ_-]/g, '_')}_${cert.expiryDate}`;
            let certFile = null as ReturnType<typeof zip.file>;
            let detectedExt = extension;

            const tryExt = extension ? [extension] : ['pdf', 'png', 'jpg', 'jpeg'];
            for (const ext of tryExt) {
              const certFilePath = `${userFolderPath}/certificati/${safeBase}.${ext}`;
              const found = zip.file(certFilePath);
              if (found) {
                certFile = found;
                detectedExt = ext;
                break;
              }
            }

            if (certFile) {
              // Read PDF and convert to base64 data URL
              const pdfData = await certFile.async('base64');
              const dataUrl = detectedExt === 'png'
                ? `data:image/png;base64,${pdfData}`
                : detectedExt === 'jpg' || detectedExt === 'jpeg'
                ? `data:image/jpeg;base64,${pdfData}`
                : `data:application/pdf;base64,${pdfData}`;
              restoredCerts.push({
                ...cert,
                fileUrl: dataUrl
              });
            } else {
              // Certificate without file
              restoredCerts.push({
                ...cert,
                fileUrl: undefined
              });
            }
          }
        }

        processedUsers.push({
          ...userData,
          certificates: restoredCerts
        });
      }

      // Ripristino su Supabase
      if (STORAGE_MODE === 'supabase') {
        setRestoreProgress(`Salvataggio ${processedUsers.length} utenti su Supabase...`);
        const usersResult = await restoreService.restoreUsers(processedUsers);

        // Mostra risultato dettagliato
        let resultMessage = `Utenti ripristinati: ${usersResult.success}/${processedUsers.length}`;

        if (usersResult.errors.length > 0) {
          console.warn('Errori durante il ripristino utenti:', usersResult.errors);
          resultMessage += ` (${usersResult.errors.length} errori)`;
        }

        setRestoreProgress(resultMessage);

        // Restore bacheca
        if (manifest.bacheca && Array.isArray(manifest.bacheca) && manifest.bacheca.length > 0) {
          setRestoreProgress('Ripristino bacheca su Supabase...');
          const bachecaResult = await restoreService.restoreBacheca(manifest.bacheca);
          if (bachecaResult.errors.length > 0) {
            console.warn('Errori durante il ripristino bacheca:', bachecaResult.errors);
          }
        }

        // Restore operators/settings/certificate types
        if (manifest.operators && Array.isArray(manifest.operators)) {
          setRestoreProgress('Ripristino operatori su Supabase...');
          await restoreServiceExtras.restoreOperators(manifest.operators);
        }
        if (manifest.settings && typeof manifest.settings === 'object') {
          setRestoreProgress('Ripristino impostazioni su Supabase...');
          await restoreServiceExtras.restoreSettings(manifest.settings);
        }
        if (manifest.certificateTypes && Array.isArray(manifest.certificateTypes)) {
          setRestoreProgress('Ripristino tipi certificato...');
          localStorage.setItem('gestcert_certificate_types', JSON.stringify(manifest.certificateTypes));
        }

        // Messaggio finale con dettagli
        const finalMessage = usersResult.success > 0
          ? `Ripristino completato! ${usersResult.success} utenti ripristinati.${usersResult.errors.length > 0 ? ` (${usersResult.errors.length} errori - vedi console)` : ''}`
          : `Ripristino fallito! Nessun utente ripristinato. Errori: ${usersResult.errors.slice(0, 3).join('; ')}`;

        setRestoreProgress(finalMessage);

        // Mostra errori in console per debug
        if (usersResult.errors.length > 0) {
          console.error('=== ERRORI RIPRISTINO ===');
          usersResult.errors.forEach((err, i) => console.error(`${i + 1}. ${err}`));
        }
      } else {
        // Fallback per modalità locale (non più usata)
        setRestoreProgress('Modalità Supabase non attiva. Ripristino non disponibile.');
      }

      // Prompt to reload after 2 seconds (solo se ripristino riuscito)
      setTimeout(() => {
        if (window.confirm('Vuoi ricaricare la pagina per vedere i dati ripristinati?')) {
          window.location.reload();
        }
      }, 2000);

    } catch (error) {
      console.error('Error restoring backup:', error);
      setRestoreProgress(`Errore: ${error instanceof Error ? error.message : 'Errore durante il ripristino'}`);
      setTimeout(() => setRestoreProgress(''), 5000);
    } finally {
      setIsRestoring(false);
      setPendingRestoreFile(null);
      setRestoreStats(null);
    }
  };

  const handleCancelRestore = () => {
    setShowRestoreConfirm(false);
    setPendingRestoreFile(null);
    setRestoreStats(null);
  };

  // ============ EMAIL CONFIGURATION STATE ============
  const [emailConfig, setEmailConfig] = useState<SmtpConfig & { hasPassword?: boolean }>(DEFAULT_SMTP_CONFIG);
  const [notificationSettings, setNotificationSettingsState] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [emailTemplates, setEmailTemplates] = useState<Record<EmailTemplate['key'], EmailTemplate>>(DEFAULT_EMAIL_TEMPLATES);
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSendingNotifications, setIsSendingNotifications] = useState(false);
  const [notificationResult, setNotificationResult] = useState<{ success: boolean; message: string; sent?: number } | null>(null);
  const [templatesResult, setTemplatesResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load email config on mount
  useEffect(() => {
    const load = async () => {
      const smtp = await getSmtpConfig();
      setEmailConfig(smtp);
      const notif = await getNotificationSettings();
      const templates = await getEmailTemplates();
      setNotificationSettingsState(notif);
      setEmailTemplates(templates);
    };
    load();
  }, []);

  // Save email config
  const handleSaveEmailConfig = async () => {
    try {
      await saveSmtpConfig(emailConfig);
      setEmailTestResult({ success: true, message: 'Configurazione salvata!' });
      setTimeout(() => setEmailTestResult(null), 2000);
    } catch (error) {
      setEmailTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Errore nel salvataggio'
      });
    }
  };

  // Save notification settings
  const handleSaveNotificationSettings = async () => {
    try {
      await saveNotificationSettings(notificationSettings);
      setNotificationResult({ success: true, message: 'Impostazioni salvate!' });
      setTimeout(() => setNotificationResult(null), 2000);
    } catch (error) {
      setNotificationResult({
        success: false,
        message: error instanceof Error ? error.message : 'Errore nel salvataggio impostazioni'
      });
    }
  };

  const handleSaveEmailTemplates = async () => {
    try {
      await saveEmailTemplates(emailTemplates);
      setTemplatesResult({ success: true, message: 'Template salvati!' });
      setTimeout(() => setTemplatesResult(null), 2000);
    } catch (error) {
      setTemplatesResult({
        success: false,
        message: error instanceof Error ? error.message : 'Errore nel salvataggio template'
      });
    }
  };

  // Send test email
  const handleSendTestEmail = async () => {
    if (!testEmail) {
      setEmailTestResult({ success: false, message: 'Inserisci un\'email di destinazione' });
      return;
    }

    setIsSendingTest(true);
    setEmailTestResult(null);

    try {
      const result = await sendTestEmail(emailConfig, testEmail);
      setEmailTestResult(result);
    } catch (error) {
      setEmailTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Errore sconosciuto'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Toggle day threshold
  const toggleDayThreshold = (day: number) => {
    setNotificationSettingsState(prev => {
      const days = prev.daysBeforeExpiry.includes(day)
        ? prev.daysBeforeExpiry.filter(d => d !== day)
        : [...prev.daysBeforeExpiry, day].sort((a, b) => b - a);
      return { ...prev, daysBeforeExpiry: days };
    });
  };

  const handleTemplateChange = (key: EmailTemplate['key'], field: 'subject' | 'body', value: string) => {
    setEmailTemplates(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  // Manual send notifications (for testing)
  const handleManualSendNotifications = async () => {
    setIsSendingNotifications(true);
    setNotificationResult(null);

    try {
      await saveNotificationSettings(notificationSettings);
      await saveEmailTemplates(emailTemplates);
      const result = await sendExpiryNotificationsNow(true);
      setNotificationResult(result);
    } catch (error) {
      setNotificationResult({
        success: false,
        message: error instanceof Error ? error.message : 'Errore sconosciuto'
      });
    } finally {
      setIsSendingNotifications(false);
    }
  };

  // ============ BACKUP FUNCTION ============
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupProgress('Preparazione backup...');

    try {
      const zip = new JSZip();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      // Raccoglie tutti i dati (usa users passato come prop)
      setBackupProgress('Raccolta dati...');

      const backupData: Record<string, unknown> = {};

      // Utenti - usa i dati passati come prop (da Supabase)
      backupData.users = users.map(u => ({
        ...u,
        certificates: u.certificates?.map(c => ({
          ...c,
          fileUrl: c.fileUrl ? '[FILE SALVATO]' : null
        }))
      }));

      // Operatori - usa i dati passati come prop (da Supabase)
      backupData.operators = operators || [];

      // Impostazioni - usa settings passato come prop
      backupData.settings = settings || {};

      // Bacheca - usa i dati passati come prop (da Supabase)
      backupData.bacheca = bacheca.note || [];

      // Attività - per ora vuoto, sono su Supabase
      backupData.activities = [];

      // Tipi certificato - da hook
      backupData.certificateTypes = certificateTypes.types || [];

      // Informazioni backup
      backupData.backupInfo = {
        createdAt: new Date().toISOString(),
        version: '1.0',
        totalUsers: users.length,
        totalCertificates: users.reduce((acc: number, u: User) => acc + (u.certificates?.length || 0), 0)
      };

      // Salva il manifest JSON principale
      setBackupProgress('Creazione manifest...');
      zip.file('gestcert_backup.json', JSON.stringify(backupData, null, 2));

      // Crea cartelle per ogni utente con i certificati
      setBackupProgress('Elaborazione certificati utenti...');

      const usersFolder = zip.folder('utenti');
      let totalCertsSaved = 0;
      let certsWithoutFile = 0;

      if (usersFolder && users.length > 0) {
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          setBackupProgress(`Elaborazione ${i + 1}/${users.length}: ${user.lastName} ${user.firstName}...`);

          // Normalizza il nome della cartella (rimuovi caratteri speciali)
          const folderName = `${user.lastName}_${user.firstName}`.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ_-]/g, '_');
          const userFolder = usersFolder.folder(folderName);

          if (userFolder) {
            // Salva dati utente come JSON (includi info certificati senza fileUrl)
            const userDataForExport = {
              ...user,
              certificates: user.certificates?.map(c => ({
                id: c.id,
                name: c.name,
                issueDate: c.issueDate,
                expiryDate: c.expiryDate,
                hasFile: !!c.fileUrl,
                extension: (() => {
                  if (!c.fileUrl) return undefined;
                  if (c.fileUrl.startsWith('data:application/pdf')) return 'pdf';
                  if (c.fileUrl.startsWith('data:image/png')) return 'png';
                  if (c.fileUrl.startsWith('data:image/jpeg')) return 'jpg';
                  if (c.fileUrl.startsWith('storage://')) return 'pdf';
                  return undefined;
                })()
              }))
            };
            userFolder.file('dati_utente.json', JSON.stringify(userDataForExport, null, 2));

            // Salva ogni certificato con file
            if (user.certificates && user.certificates.length > 0) {
              const certsFolder = userFolder.folder('certificati');
              if (certsFolder) {
                for (const cert of user.certificates) {
                  if (cert.fileUrl && cert.fileUrl.length > 0) {
                    // Gestisci sia data URL base64 che altri formati
                    let dataUrl = cert.fileUrl;
                    if (dataUrl.startsWith('storage://')) {
                      try {
                        const ref = parseStorageUrl(dataUrl);
                        if (ref) {
                          const signed = await createSignedUrl(ref.bucket, ref.path);
                          const response = await fetch(signed);
                          if (response.ok) {
                            const blob = await response.blob();
                            const mime = blob.type || 'application/pdf';
                            const base64 = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
                              reader.onerror = () => reject(new Error('Errore lettura file'));
                              reader.readAsDataURL(blob);
                            });
                            dataUrl = `data:${mime};base64,${base64}`;
                          }
                        }
                      } catch (err) {
                        console.warn(`Errore download file storage per ${cert.name}:`, err);
                      }
                    }

                    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches) {
                      const mime = matches[1];
                      const base64Data = matches[2];
                      const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'bin';
                      const certFileName = `${cert.name.replace(/[^a-zA-Z0-9àèéìòùÀÈÉÌÒÙ_-]/g, '_')}_${cert.expiryDate}.${ext}`;
                      certsFolder.file(certFileName, base64Data, { base64: true });
                      totalCertsSaved++;
                    } else {
                      console.warn(`Certificato ${cert.name} ha fileUrl non base64:`, cert.fileUrl.substring(0, 50));
                      certsWithoutFile++;
                    }
                  } else {
                    // Certificato senza file allegato
                    certsWithoutFile++;
                  }
                }
              }
            }
          }
        }
      }

      console.log(`Backup: ${totalCertsSaved} certificati con file salvati, ${certsWithoutFile} senza file`);
      if (certsWithoutFile > 0) {
        setBackupProgress(`Attenzione: ${certsWithoutFile} certificati non hanno file allegato`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Genera il file ZIP
      setBackupProgress('Generazione file ZIP...');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        setBackupProgress(`Compressione: ${Math.round(metadata.percent)}%`);
      });

      // Download
      setBackupProgress('Download in corso...');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `gestcert_BK_${timestamp}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      setBackupProgress('Backup completato!');
      setTimeout(() => {
        setBackupProgress('');
      }, 2000);

    } catch (error) {
      console.error('Errore durante il backup:', error);
      setBackupProgress(`Errore: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
      setTimeout(() => {
        setBackupProgress('');
      }, 3000);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleToggleWidget = (key: keyof AppSettings['widgets']) => {
    setSettings(prev => ({
      ...prev,
      widgets: {
        ...prev.widgets,
        [key]: !prev.widgets[key]
      }
    }));
  };

  const handleRemoveDuplicateCertificates = async () => {
    if (!window.confirm('Rimuovere i certificati duplicati? Questa operazione non è reversibile.')) return;
    setIsDeduping(true);
    setDedupeResult('');
    try {
      const result = STORAGE_MODE === 'local'
        ? await localMaintenanceService.removeDuplicateCertificates()
        : await maintenanceService.removeDuplicateCertificates();
      if (result.removed === 0) {
        setDedupeResult('Nessun duplicato trovato.');
      } else {
        setDedupeResult(`Rimossi ${result.removed} duplicati in ${result.usersAffected} utenti.`);
      }
    } catch (error) {
      console.error('Errore rimozione duplicati:', error);
      setDedupeResult(`Errore: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
    } finally {
      setIsDeduping(false);
    }
  };

  const handleClearBacheca = async () => {
    if (!window.confirm('Vuoi eliminare TUTTE le note dalla bacheca? Questa operazione non è reversibile.')) return;
    setIsClearingBacheca(true);
    setClearBachecaResult('');
    try {
      await bacheca.clearAll();
      setClearBachecaResult('Bacheca svuotata con successo!');
    } catch (error) {
      console.error('Errore pulizia bacheca:', error);
      setClearBachecaResult(`Errore: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
    } finally {
      setIsClearingBacheca(false);
    }
  };

  const handleAddType = async () => {
    if (!newType.name.trim()) return;
    try {
      await certificateTypes.createType(newType);
      setNewType({ name: '', description: '' });
      setShowNewTypeForm(false);
    } catch (err) {
      console.error('Error adding certificate type:', err);
    }
  };

  const handleUpdateType = async () => {
    if (!editingType || !editingType.name.trim()) return;
    try {
      await certificateTypes.updateType(editingType.id, {
        name: editingType.name,
        description: editingType.description
      });
      setEditingType(null);
    } catch (err) {
      console.error('Error updating certificate type:', err);
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo tipo di certificato?')) return;
    try {
      await certificateTypes.deleteType(id);
    } catch (err) {
      console.error('Error deleting certificate type:', err);
    }
  };

  const handleResetTypes = async () => {
    if (!window.confirm('Ripristinare i tipi di certificato predefiniti? Questo eliminerà tutte le modifiche.')) return;
    try {
      await certificateTypes.resetToDefaults();
    } catch (err) {
      console.error('Error resetting certificate types:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white border-b dark:border-gray-700 pb-4">Impostazioni</h1>

      {/* Dashboard Widgets */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
         <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
          <Layout className="mr-2" size={20} /> Widget Dashboard
        </h2>
        <div className="space-y-3">
           <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
              <span className="text-sm font-medium dark:text-gray-200">Messaggio di Benvenuto</span>
              <input type="checkbox" checked={settings.widgets.welcome} onChange={() => handleToggleWidget('welcome')} className="rounded text-primary focus:ring-primary" />
           </label>
           <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
              <span className="text-sm font-medium dark:text-gray-200">Orologio Digitale</span>
              <input type="checkbox" checked={settings.widgets.clock} onChange={() => handleToggleWidget('clock')} className="rounded text-primary focus:ring-primary" />
           </label>
           <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
              <span className="text-sm font-medium dark:text-gray-200">Calendario Mensile</span>
              <input type="checkbox" checked={settings.widgets.calendar} onChange={() => handleToggleWidget('calendar')} className="rounded text-primary focus:ring-primary" />
           </label>
           <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
              <span className="text-sm font-medium dark:text-gray-200">Riepilogo Scadenze</span>
              <input type="checkbox" checked={settings.widgets.expiry} onChange={() => handleToggleWidget('expiry')} className="rounded text-primary focus:ring-primary" />
           </label>
        </div>
      </section>

      {/* Import/Export */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
          <FileSpreadsheet className="mr-2" size={20} /> Import/Export Utenti
        </h2>
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" size={20} />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Come importare utenti da Excel</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
                  <li>Scarica il modello CSV qui sotto</li>
                  <li>Apri il file con Excel o LibreOffice Calc</li>
                  <li>Compila i dati degli utenti (una riga per utente)</li>
                  <li>Salva il file mantenendo il formato CSV (separatore: punto e virgola)</li>
                  <li>Vai nella sezione Utenti e clicca su "Importa"</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Modello Importazione Utenti</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">File CSV con intestazioni e 2 righe di esempio</p>
            </div>
            <a
              href="/template_importazione_utenti.csv"
              download="template_importazione_utenti.csv"
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
            >
              <Download size={18} /> Scarica Modello
            </a>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p><strong>Campi obbligatori:</strong> Cognome, Nome, Email, Codice Fiscale, Sesso, Data Nascita</p>
            <p><strong>Formato data:</strong> AAAA-MM-GG (es. 1980-01-31)</p>
            <p><strong>Sesso:</strong> M o F</p>
            <p><strong>Stato:</strong> Attivo, Sospeso, Bloccato</p>
            <p><strong>Paese/Nazionalità:</strong> Codice ISO a 2 lettere (es. IT, DE, FR)</p>
          </div>
        </div>
      </section>

      {/* Backup Completo */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
          <Archive className="mr-2" size={20} /> Backup Completo
        </h2>
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" size={20} />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Cosa include il backup</p>
                <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300">
                  <li>Tutti gli utenti con i loro dati anagrafici</li>
                  <li>Tutti i certificati e documenti allegati (in PDF)</li>
                  <li>Operatori e impostazioni</li>
                  <li>Note bacheca e registro attività</li>
                  <li>Tipi di certificato personalizzati</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Crea Backup Locale</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Scarica un file ZIP con tutti i dati e documenti
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Struttura: cartella per ogni utente con i certificati allegati
              </p>
            </div>
            <button
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium min-w-[160px] justify-center"
            >
              {isCreatingBackup ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Creazione...
                </>
              ) : (
                <>
                  <Archive size={18} /> Crea Backup
                </>
              )}
            </button>
          </div>

          {/* Progress indicator */}
          {backupProgress && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              backupProgress.includes('Errore')
                ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : backupProgress.includes('completato')
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
            }`}>
              {backupProgress}
            </div>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500">
            Il backup verrà salvato come <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">gestcert_BK_[data].zip</code>
          </p>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-600 my-4"></div>

          {/* Restore Section */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Ripristina da Backup</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Carica un file ZIP di backup precedente
              </p>
              <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                Attenzione: sovrascriverà tutti i dati esistenti
              </p>
            </div>
            {/* Hidden file input */}
            <input
              ref={restoreFileRef}
              type="file"
              accept=".zip"
              onChange={handleRestoreFileSelect}
              className="hidden"
            />
            <button
              onClick={() => restoreFileRef.current?.click()}
              disabled={isRestoring}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium min-w-[160px] justify-center"
            >
              {isRestoring ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Ripristino...
                </>
              ) : (
                <>
                  <Upload size={18} /> Ripristina Backup
                </>
              )}
            </button>
          </div>

          {/* Restore Progress indicator */}
          {restoreProgress && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              restoreProgress.includes('Errore')
                ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : restoreProgress.includes('completato')
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
            }`}>
              {restoreProgress}
            </div>
          )}
        </div>
      </section>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && restoreStats && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-amber-600 dark:text-amber-400" size={24} />
                <h3 className="font-bold text-gray-800 dark:text-white text-lg">Conferma Ripristino</h3>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                  Attenzione: tutti i dati attuali verranno sovrascritti!
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Stai per ripristinare un backup con:
                </p>
                <ul className="text-sm space-y-1 ml-4">
                  <li className="text-gray-700 dark:text-gray-200">
                    <strong>{restoreStats.users}</strong> utenti
                  </li>
                  <li className="text-gray-700 dark:text-gray-200">
                    <strong>{restoreStats.certs}</strong> certificati
                  </li>
                  <li className="text-gray-500 dark:text-gray-400 text-xs">
                    Data backup: {restoreStats.date}
                  </li>
                </ul>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                Vuoi procedere con il ripristino?
              </p>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={handleCancelRestore}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md font-medium transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmRestore}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-colors"
              >
                Conferma Ripristino
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data Maintenance */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
          <RotateCcw className="mr-2" size={20} /> Manutenzione Dati
        </h2>
        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Rimuovi certificati duplicati</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Elimina le copie identiche create da salvataggi ripetuti.
              </p>
            </div>
            <button
              onClick={handleRemoveDuplicateCertificates}
              disabled={isDeduping}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-red-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium min-w-[200px] justify-center"
            >
              {isDeduping ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Pulizia...
                </>
              ) : (
                <>
                  <RotateCcw size={18} /> Rimuovi Duplicati
                </>
              )}
            </button>
          </div>

          {dedupeResult && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              dedupeResult.includes('Errore')
                ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            }`}>
              {dedupeResult}
            </div>
          )}

          {/* Pulisci Bacheca */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Pulisci Bacheca</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Elimina tutte le note dalla bacheca ({bacheca.note.length} note presenti).
              </p>
            </div>
            <button
              onClick={handleClearBacheca}
              disabled={isClearingBacheca || bacheca.note.length === 0}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-red-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium min-w-[200px] justify-center"
            >
              {isClearingBacheca ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Pulizia...
                </>
              ) : (
                <>
                  <Trash2 size={18} /> Pulisci Bacheca
                </>
              )}
            </button>
          </div>

          {clearBachecaResult && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              clearBachecaResult.includes('Errore')
                ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            }`}>
              {clearBachecaResult}
            </div>
          )}
        </div>
      </section>

      {/* Certificate Types Management */}
      <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 flex items-center">
            <Award className="mr-2" size={20} /> Tipi di Certificato
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleResetTypes}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="Ripristina tipi predefiniti"
            >
              <RotateCcw size={14} /> Ripristina
            </button>
            <button
              onClick={() => setShowNewTypeForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary hover:bg-secondary text-white rounded-md transition-colors"
            >
              <Plus size={14} /> Aggiungi Tipo
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Gestisci i tipi di certificato disponibili nel menu a tendina quando carichi un certificato.
        </p>

        {/* Add new type form */}
        {showNewTypeForm && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-green-800 dark:text-green-200 mb-3 text-sm">Nuovo Tipo di Certificato</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nome *</label>
                <input
                  type="text"
                  value={newType.name}
                  onChange={e => setNewType({ ...newType, name: e.target.value })}
                  placeholder="Es. Attestato Sicurezza"
                  className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded"
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Descrizione (opzionale)</label>
                <input
                  type="text"
                  value={newType.description}
                  onChange={e => setNewType({ ...newType, description: e.target.value })}
                  placeholder="Es. validità 12 mesi"
                  className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded"
                  maxLength={100}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowNewTypeForm(false); setNewType({ name: '', description: '' }); }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Annulla
              </button>
              <button
                onClick={handleAddType}
                disabled={!newType.name.trim()}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aggiungi
              </button>
            </div>
          </div>
        )}

        {/* List of certificate types */}
        <div className="space-y-2">
          {certificateTypes.loading ? (
            <p className="text-sm text-gray-400 italic py-4 text-center">Caricamento...</p>
          ) : certificateTypes.types.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-4 text-center">Nessun tipo di certificato configurato.</p>
          ) : (
            certificateTypes.types.map(type => (
              <div
                key={type.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg group"
              >
                {editingType?.id === type.id ? (
                  // Edit mode
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2 mr-2">
                    <input
                      type="text"
                      value={editingType.name}
                      onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                      className="p-2 text-sm border border-blue-300 dark:border-blue-600 dark:bg-gray-600 dark:text-white rounded focus:ring-2 focus:ring-blue-200"
                      maxLength={50}
                    />
                    <input
                      type="text"
                      value={editingType.description || ''}
                      onChange={e => setEditingType({ ...editingType, description: e.target.value })}
                      placeholder="Descrizione (opzionale)"
                      className="p-2 text-sm border border-blue-300 dark:border-blue-600 dark:bg-gray-600 dark:text-white rounded focus:ring-2 focus:ring-blue-200"
                      maxLength={100}
                    />
                  </div>
                ) : (
                  // View mode
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">{type.name}</p>
                    {type.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{type.description}</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {editingType?.id === type.id ? (
                    <>
                      <button
                        onClick={handleUpdateType}
                        className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                        title="Salva"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingType(null)}
                        className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        title="Annulla"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditingType(type)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Modifica"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteType(type.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Elimina"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          L'opzione "Altro" viene sempre mostrata automaticamente per permettere l'inserimento manuale.
        </p>
      </section>

      {/* SMTP Configuration */}
      {role === Role.ADMIN && (
        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
            <Mail className="mr-2 text-blue-500" size={20} /> Configurazione Email (SMTP)
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Abilita invio email</label>
              <input
                type="checkbox"
                checked={emailConfig.enabled}
                onChange={e => setEmailConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                className="rounded text-primary focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Server SMTP</label>
                <input
                  type="text"
                  value={emailConfig.host}
                  onChange={e => setEmailConfig(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="smtp.azienda.it"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Porta</label>
                <input
                  type="number"
                  value={emailConfig.port}
                  onChange={e => setEmailConfig(prev => ({ ...prev, port: Number(e.target.value) }))}
                  placeholder="465"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Crittografia</label>
                <select
                  value={emailConfig.encryption}
                  onChange={e => setEmailConfig(prev => ({ ...prev, encryption: e.target.value as SmtpConfig['encryption'] }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                >
                  <option value="SSL">SSL</option>
                  <option value="TLS">TLS</option>
                  <option value="NONE">Nessuna</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Utente SMTP</label>
                <input
                  type="text"
                  value={emailConfig.user}
                  onChange={e => setEmailConfig(prev => ({ ...prev, user: e.target.value }))}
                  placeholder="utente@azienda.it"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Password SMTP
                  {emailConfig.hasPassword && !emailConfig.password && (
                    <span className="ml-2 text-green-600 dark:text-green-400 text-xs">(configurata)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={emailConfig.password}
                  onChange={e => setEmailConfig(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={emailConfig.hasPassword ? '••••••••' : 'Inserisci password'}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
                {emailConfig.hasPassword && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Lascia vuoto per mantenere la password attuale
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email Mittente</label>
                <input
                  type="email"
                  value={emailConfig.senderEmail}
                  onChange={e => setEmailConfig(prev => ({ ...prev, senderEmail: e.target.value }))}
                  placeholder="noreply@azienda.it"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nome Mittente</label>
                <input
                  type="text"
                  value={emailConfig.senderName}
                  onChange={e => setEmailConfig(prev => ({ ...prev, senderName: e.target.value }))}
                  placeholder="GestCert - Cassa Edile"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email Rispondi A</label>
                <input
                  type="email"
                  value={emailConfig.replyTo || ''}
                  onChange={e => setEmailConfig(prev => ({ ...prev, replyTo: e.target.value }))}
                  placeholder="info@cassaedile.ag.it"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveEmailConfig}
                className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                <Save size={16} /> Salva Configurazione
              </button>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Send size={16} /> Invia Email di Test
              </h4>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="email@esempio.it"
                  className="flex-1 p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                />
                <button
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest || !emailConfig.enabled}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
                >
                  {isSendingTest ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {isSendingTest ? 'Invio...' : 'Invia Test'}
                </button>
              </div>
              {emailTestResult && (
                <div className={`mt-2 p-2 rounded text-sm ${
                  emailTestResult.success
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                }`}>
                  {emailTestResult.message}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Notification Settings */}
      {role === Role.ADMIN && (
        <section className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
            <Bell className="mr-2 text-amber-500" size={20} /> Notifiche Scadenze Certificati
          </h2>

          <div className="space-y-6">
            {/* Enable notifications */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Abilita notifiche scadenze</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Invia email quando i certificati stanno per scadere</p>
              </div>
              <input
                type="checkbox"
                checked={notificationSettings.enabled}
                onChange={e => setNotificationSettingsState(prev => ({ ...prev, enabled: e.target.checked }))}
                className="rounded text-primary focus:ring-primary"
              />
            </div>

            {/* Days before expiry */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <Clock size={16} /> Giorni prima della scadenza
              </label>
              <div className="flex flex-wrap gap-2">
                {[60, 30, 14, 7, 3, 1].map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDayThreshold(day)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      notificationSettings.daysBeforeExpiry.includes(day)
                        ? 'bg-primary text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                  >
                    {day} {day === 1 ? 'giorno' : 'giorni'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Clicca per selezionare/deselezionare</p>
            </div>

            {/* Daily digest */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Riepilogo giornaliero</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Invia un'unica email con tutte le scadenze invece di email singole</p>
              </div>
              <input
                type="checkbox"
                checked={notificationSettings.dailyDigest}
                onChange={e => setNotificationSettingsState(prev => ({ ...prev, dailyDigest: e.target.checked }))}
                className="rounded text-primary focus:ring-primary"
              />
            </div>

            {/* Notify operators */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notifica operatori</label>
                <input
                  type="checkbox"
                  checked={notificationSettings.notifyOperators}
                  onChange={e => setNotificationSettingsState(prev => ({ ...prev, notifyOperators: e.target.checked }))}
                  className="rounded text-primary focus:ring-primary"
                />
              </div>

              {notificationSettings.notifyOperators && (
                <div className="ml-4 space-y-2">
                  <input
                    type="email"
                    value={notificationSettings.operatorEmail}
                    onChange={e => setNotificationSettingsState(prev => ({ ...prev, operatorEmail: e.target.value }))}
                    placeholder="email@azienda.it"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                  />
                  {!notificationSettings.operatorEmail && (
                    <span className="text-sm text-gray-400 italic">Nessun operatore configurato</span>
                  )}
                </div>
              )}
            </div>

            {/* Notify users */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Notifica anche gli utenti</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Invia email agli utenti per i loro certificati in scadenza</p>
              </div>
              <input
                type="checkbox"
                checked={notificationSettings.notifyUsers}
                onChange={e => setNotificationSettingsState(prev => ({ ...prev, notifyUsers: e.target.checked }))}
                className="rounded text-primary focus:ring-primary"
              />
            </div>

            {/* Email Templates */}
            <div className="space-y-4 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Template Email</h3>
                <button
                  onClick={handleSaveEmailTemplates}
                  className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-3 py-1.5 rounded text-xs font-medium"
                >
                  <Save size={14} /> Salva Template
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Email utente (certificato in scadenza)</p>
                  <input
                    type="text"
                    value={emailTemplates.user_expiry.subject}
                    onChange={e => handleTemplateChange('user_expiry', 'subject', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                    placeholder="Oggetto email utente"
                  />
                  <textarea
                    value={emailTemplates.user_expiry.body}
                    onChange={e => handleTemplateChange('user_expiry', 'body', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm min-h-[120px]"
                    placeholder="Testo email utente"
                  />
                  <p className="text-xs text-gray-400">
                    Variabili: {'{{firstName}}'}, {'{{lastName}}'}, {'{{certificateName}}'}, {'{{expiryDate}}'}, {'{{daysUntilExpiry}}'}, {'{{certList}}'}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Email riepilogo operatore</p>
                  <input
                    type="text"
                    value={emailTemplates.operator_digest.subject}
                    onChange={e => handleTemplateChange('operator_digest', 'subject', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm"
                    placeholder="Oggetto email operatore"
                  />
                  <textarea
                    value={emailTemplates.operator_digest.body}
                    onChange={e => handleTemplateChange('operator_digest', 'body', e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded text-sm min-h-[120px]"
                    placeholder="Testo email operatore"
                  />
                  <p className="text-xs text-gray-400">
                    Variabili: {'{{digestList}}'}
                  </p>
                </div>
              </div>

              {templatesResult && (
                <div className={`p-2 rounded text-xs ${
                  templatesResult.success
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                }`}>
                  {templatesResult.message}
                </div>
              )}
            </div>

            {/* Save and Test buttons */}
            <div className="flex flex-wrap gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-600">
              <button
                onClick={handleSaveNotificationSettings}
                className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                <Save size={16} /> Salva Impostazioni
              </button>
              <button
                onClick={handleManualSendNotifications}
                disabled={isSendingNotifications || !emailConfig.enabled || !notificationSettings.enabled}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-400 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
              >
                {isSendingNotifications ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isSendingNotifications ? 'Invio...' : 'Invia Notifiche Ora'}
              </button>
            </div>

            {/* Notification result */}
            {notificationResult && (
              <div className={`p-3 rounded-lg text-sm ${
                notificationResult.success
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                  : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700'
              }`}>
                {notificationResult.sent !== undefined && notificationResult.sent > 0 && (
                  <p>Inviate {notificationResult.sent} notifiche</p>
                )}
                <p>{notificationResult.message}</p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex justify-end pt-4">
         <button className="flex items-center gap-2 bg-primary hover:bg-secondary text-white px-6 py-3 rounded-lg shadow-lg transition-all font-semibold">
            <Save size={20} /> Salva Tutte le Impostazioni
         </button>
      </div>
    </div>
  );
};

export default Settings;
