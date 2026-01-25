import { supabase } from './supabase';
import { SmtpConfig, DEFAULT_SMTP_CONFIG } from './emailService';

const SMTP_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const { data, error } = await supabase
    .from('smtp_settings')
    .select('*')
    .eq('id', SMTP_SETTINGS_ID)
    .maybeSingle();

  if (error || !data) return DEFAULT_SMTP_CONFIG;

  return {
    host: data.host || '',
    port: data.port || 465,
    encryption: (data.encryption as SmtpConfig['encryption']) || 'SSL',
    user: data.smtp_user || '',
    password: data.smtp_password || '',
    senderEmail: data.sender_email || '',
    senderName: data.sender_name || DEFAULT_SMTP_CONFIG.senderName,
    replyTo: data.reply_to || '',
    enabled: !!data.enabled
  };
}

export async function saveSmtpConfig(config: SmtpConfig): Promise<void> {
  const { error } = await supabase
    .from('smtp_settings')
    .upsert({
      id: SMTP_SETTINGS_ID,
      host: config.host,
      port: config.port,
      encryption: config.encryption,
      smtp_user: config.user,
      smtp_password: config.password,
      sender_email: config.senderEmail,
      sender_name: config.senderName,
      reply_to: config.replyTo || null,
      enabled: config.enabled,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

  if (error) throw error;
}
