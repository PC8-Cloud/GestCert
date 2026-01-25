import { supabaseUrl, supabaseAnonKey } from './supabase';

// ============ TYPES ============

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: 'NONE' | 'SSL' | 'TLS';
  user: string;
  password: string;
  senderEmail: string;
  senderName: string;
  replyTo?: string;
  enabled: boolean;
}

// ============ DEFAULT VALUES ============

export const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  host: '',
  port: 465,
  encryption: 'SSL',
  user: '',
  password: '',
  senderEmail: '',
  senderName: 'GestCert - Cassa Edile',
  replyTo: '',
  enabled: false
};

// ============ EMAIL FUNCTIONS ============

// Invia email di test
export async function sendTestEmail(
  config: SmtpConfig,
  toEmail: string
): Promise<{ success: boolean; message: string }> {
  if (!config.enabled || !config.host || !config.port || !config.senderEmail) {
    return { success: false, message: 'Configurazione SMTP incompleta' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${supabaseUrl}/functions/v1/send-smtp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        to: toEmail,
        subject: 'Test Email - GestCert',
        text: 'Questa è un\'email di test dal sistema GestCert. Se ricevi questo messaggio, la configurazione SMTP è corretta!'
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const raw = await response.text();
    let payload: { message?: string } = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      return { success: false, message: payload?.message || raw || 'Errore invio email' };
    }

    return { success: true, message: payload?.message || raw || 'Email di test inviata con successo!' };
  } catch (error: unknown) {
    console.error('Error sending test email:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    };
  }
}

export async function sendExpiryNotificationsNow(force: boolean = false): Promise<{ success: boolean; message: string; sent?: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${supabaseUrl}/functions/v1/send-expiry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ force }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const raw = await response.text();
    let payload: { message?: string; sent?: number } = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      return { success: false, message: payload?.message || raw || 'Errore invio notifiche' };
    }

    return { success: true, message: payload?.message || raw || 'Notifiche inviate', sent: payload?.sent };
  } catch (error) {
    console.error('Error sending expiry notifications:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Errore sconosciuto nell\'invio notifiche'
    };
  }
}
