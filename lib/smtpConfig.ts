import { supabase } from './supabase';
import { SmtpConfig, DEFAULT_SMTP_CONFIG } from './emailService';

const SMTP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export async function getSmtpConfig(): Promise<SmtpConfig & { hasPassword?: boolean }> {
  const { data, error } = await supabase
    .from('smtp_settings')
    // Non leggiamo smtp_password per sicurezza - rimane solo lato server
    .select('id, host, port, encryption, smtp_user, sender_email, sender_name, reply_to, enabled, smtp_password')
    .eq('id', SMTP_SETTINGS_ID)
    .maybeSingle();

  if (error || !data) return DEFAULT_SMTP_CONFIG;

  return {
    host: data.host || '',
    port: data.port || 465,
    encryption: (data.encryption as SmtpConfig['encryption']) || 'SSL',
    user: data.smtp_user || '',
    password: '', // Non esponiamo la password al frontend
    senderEmail: data.sender_email || '',
    senderName: data.sender_name || DEFAULT_SMTP_CONFIG.senderName,
    replyTo: data.reply_to || '',
    enabled: !!data.enabled,
    hasPassword: !!data.smtp_password // Indica se è configurata
  };
}

export async function saveSmtpConfig(config: SmtpConfig): Promise<void> {
  // Costruiamo l'oggetto da salvare
  const updateData: Record<string, unknown> = {
    id: SMTP_SETTINGS_ID,
    host: config.host,
    port: config.port,
    encryption: config.encryption,
    smtp_user: config.user,
    sender_email: config.senderEmail,
    sender_name: config.senderName,
    reply_to: config.replyTo || null,
    enabled: config.enabled,
    updated_at: new Date().toISOString()
  };

  // Aggiorna la password SOLO se ne viene fornita una nuova
  // (evita di sovrascrivere con stringa vuota)
  if (config.password && config.password.trim() !== '') {
    updateData.smtp_password = config.password;
  }

  const { error } = await supabase
    .from('smtp_settings')
    .upsert(updateData, { onConflict: 'id' });

  if (error) throw error;
}
