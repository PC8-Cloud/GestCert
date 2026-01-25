import { supabase } from './supabase';

export interface NotificationSettings {
  enabled: boolean;
  daysBeforeExpiry: number[];
  notifyOperators: boolean;
  operatorEmail: string;
  notifyUsers: boolean;
  dailyDigest: boolean;
  lastSentDate?: string | null;
}

export interface EmailTemplate {
  key: 'user_expiry' | 'operator_digest';
  subject: string;
  body: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  daysBeforeExpiry: [30, 14, 7, 1],
  notifyOperators: true,
  operatorEmail: '',
  notifyUsers: true,
  dailyDigest: true
};

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplate['key'], EmailTemplate> = {
  user_expiry: {
    key: 'user_expiry',
    subject: 'Scadenza certificato',
    body: 'Il tuo {{certificateName}} depositato presso la Cassa Edile di Agrigento scadrà in data {{expiryDate}}. Non dimenticare di farci pervenire la copia valida.'
  },
  operator_digest: {
    key: 'operator_digest',
    subject: 'Riepilogo notifiche scadenze',
    body: 'Sono stati avvisati:\n\n{{digestList}}'
  }
};

const NOTIFICATION_SETTINGS_ID = '00000000-0000-0000-0000-000000000002';

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('id', NOTIFICATION_SETTINGS_ID)
    .maybeSingle();

  if (!data) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  return {
    enabled: data.enabled ?? true,
    daysBeforeExpiry: Array.isArray(data.days_before_expiry) && data.days_before_expiry.length > 0
      ? data.days_before_expiry
      : DEFAULT_NOTIFICATION_SETTINGS.daysBeforeExpiry,
    notifyOperators: data.notify_operators ?? true,
    operatorEmail: data.operator_email || '',
    notifyUsers: data.notify_users ?? true,
    dailyDigest: data.daily_digest ?? true,
    lastSentDate: data.last_sent_date || null
  };
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  const payload = {
    id: NOTIFICATION_SETTINGS_ID,
    enabled: settings.enabled,
    days_before_expiry: settings.daysBeforeExpiry,
    notify_operators: settings.notifyOperators,
    operator_email: settings.operatorEmail || null,
    notify_users: settings.notifyUsers,
    daily_digest: settings.dailyDigest,
    last_sent_date: settings.lastSentDate || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('notification_settings')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getEmailTemplates(): Promise<Record<EmailTemplate['key'], EmailTemplate>> {
  const { data } = await supabase
    .from('email_templates')
    .select('key, subject, body')
    .in('key', ['user_expiry', 'operator_digest']);

  const templates: Record<EmailTemplate['key'], EmailTemplate> = {
    user_expiry: { ...DEFAULT_EMAIL_TEMPLATES.user_expiry },
    operator_digest: { ...DEFAULT_EMAIL_TEMPLATES.operator_digest }
  };

  if (data) {
    for (const row of data) {
      if (row.key === 'user_expiry' || row.key === 'operator_digest') {
        templates[row.key] = {
          key: row.key,
          subject: row.subject || templates[row.key].subject,
          body: row.body || templates[row.key].body
        };
      }
    }
  }

  return templates;
}

export async function saveEmailTemplates(templates: Record<EmailTemplate['key'], EmailTemplate>): Promise<void> {
  const payload = Object.values(templates).map(template => ({
    key: template.key,
    subject: template.subject,
    body: template.body,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('email_templates')
    .upsert(payload, { onConflict: 'key' });

  if (error) {
    throw new Error(error.message);
  }
}
