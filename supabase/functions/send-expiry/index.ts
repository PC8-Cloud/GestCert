import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

type SmtpRow = {
  host: string;
  port: number;
  encryption: "NONE" | "SSL" | "TLS";
  smtp_user: string;
  smtp_password: string;
  sender_email: string;
  sender_name: string;
  reply_to?: string | null;
  enabled: boolean;
};

type NotificationRow = {
  days_before_expiry: number[];
  notify_operators: boolean;
  operator_email?: string | null;
  notify_users: boolean;
  daily_digest: boolean;
  enabled: boolean;
  last_sent_date?: string | null;
};

type TemplateRow = {
  key: string;
  subject: string;
  body: string;
};

const SMTP_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
const NOTIFICATION_SETTINGS_ID = "00000000-0000-0000-0000-000000000002";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  return `${day}/${month}/${year}`;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const force = payload?.force === true;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ message: "Env Supabase mancanti" }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: smtpData, error: smtpError } = await supabase
      .from("smtp_settings")
      .select("*")
      .eq("id", SMTP_SETTINGS_ID)
      .single();

    if (smtpError || !smtpData) {
      return new Response(JSON.stringify({ message: "Configurazione SMTP non trovata" }), { status: 400, headers: corsHeaders });
    }

    const smtp = smtpData as SmtpRow;
    if (!smtp.enabled) {
      return new Response(JSON.stringify({ message: "SMTP disabilitato" }), { status: 400, headers: corsHeaders });
    }

    const { data: notifData } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("id", NOTIFICATION_SETTINGS_ID)
      .single();

    const settings: NotificationRow = {
      days_before_expiry: [30, 14, 7, 1],
      notify_operators: true,
      operator_email: null,
      notify_users: true,
      daily_digest: true,
      enabled: true,
      last_sent_date: null,
      ...(notifData || {})
    };

    if (!settings.enabled) {
      return new Response(JSON.stringify({ message: "Notifiche disabilitate" }), { status: 400, headers: corsHeaders });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (settings.daily_digest && !force && settings.last_sent_date === todayStr) {
      return new Response(JSON.stringify({ message: "Notifiche già inviate oggi", sent: 0 }), { status: 200, headers: corsHeaders });
    }

    const { data: templates } = await supabase
      .from("email_templates")
      .select("*")
      .in("key", ["user_expiry", "operator_digest"]);

    const templateMap = new Map<string, TemplateRow>();
    (templates || []).forEach((t) => templateMap.set(t.key, t as TemplateRow));

    const userTemplate = templateMap.get("user_expiry") || {
      key: "user_expiry",
      subject: "Scadenza certificato",
      body: "Il tuo {{certificateName}} depositato presso la Cassa Edile di Agrigento scadrà in data {{expiryDate}}. Non dimenticare di farci pervenire la copia valida."
    };

    const operatorTemplate = templateMap.get("operator_digest") || {
      key: "operator_digest",
      subject: "Riepilogo notifiche scadenze",
      body: "Sono stati avvisati:\n\n{{digestList}}"
    };

    const { data: certs, error: certError } = await supabase
      .from("certificates")
      .select("id, name, expiry_date, users ( id, first_name, last_name, email )");

    if (certError) {
      return new Response(JSON.stringify({ message: certError.message }), { status: 500, headers: corsHeaders });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thresholds = new Set((settings.days_before_expiry || []).filter((n) => Number.isFinite(n)));
    const maxDays = thresholds.size > 0 ? Math.max(...thresholds) : 0;

    const expiring = (certs || [])
      .map((c: any) => {
        const expiry = c.expiry_date ? new Date(c.expiry_date) : null;
        if (!expiry || !c.users) return null;
        expiry.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return null;
        if (thresholds.size > 0 && !thresholds.has(diffDays)) return null;
        return {
          cert: c,
          user: c.users,
          daysUntilExpiry: diffDays
        };
      })
      .filter((x) => x && x.daysUntilExpiry >= 0 && x.daysUntilExpiry <= maxDays);

    if (expiring.length === 0) {
      if (settings.daily_digest && !force) {
        await supabase
          .from("notification_settings")
          .update({ last_sent_date: todayStr })
          .eq("id", NOTIFICATION_SETTINGS_ID);
      }
      return new Response(JSON.stringify({ message: "Nessun certificato in scadenza", sent: 0 }), { status: 200, headers: corsHeaders });
    }

    const byUser = new Map<string, typeof expiring>();
    for (const item of expiring) {
      const list = byUser.get(item.user.id) || [];
      list.push(item);
      byUser.set(item.user.id, list);
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.encryption === "SSL",
      auth: { user: smtp.smtp_user, pass: smtp.smtp_password },
      tls: smtp.encryption === "TLS" ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    let sent = 0;
    const digestLines: string[] = [];

    if (settings.notify_users) {
      for (const [, items] of byUser) {
        const user = items[0].user;
        if (!user.email) continue;

        if (items.length === 1) {
          const item = items[0];
          const subject = applyTemplate(userTemplate.subject, {
            firstName: user.first_name,
            lastName: user.last_name,
            certificateName: item.cert.name,
            expiryDate: formatDate(item.cert.expiry_date),
            daysUntilExpiry: String(item.daysUntilExpiry),
            certList: ""
          });
          const body = applyTemplate(userTemplate.body, {
            firstName: user.first_name,
            lastName: user.last_name,
            certificateName: item.cert.name,
            expiryDate: formatDate(item.cert.expiry_date),
            daysUntilExpiry: String(item.daysUntilExpiry),
            certList: ""
          });

          await transporter.sendMail({
            from: `"${smtp.sender_name}" <${smtp.sender_email}>`,
            to: user.email,
            subject,
            text: body,
            replyTo: smtp.reply_to || undefined
          });
          sent++;
          digestLines.push(`L'utente ${user.first_name} ${user.last_name} è stato avvisato che ${item.cert.name} scade il ${formatDate(item.cert.expiry_date)}`);
        } else {
          const list = items.map((i) => `- ${i.cert.name} (scade il ${formatDate(i.cert.expiry_date)})`).join("\n");
          const subject = applyTemplate(userTemplate.subject, {
            firstName: user.first_name,
            lastName: user.last_name,
            certificateName: "più certificati",
            expiryDate: "",
            daysUntilExpiry: "",
            certList: list
          });
          const body = applyTemplate(userTemplate.body, {
            firstName: user.first_name,
            lastName: user.last_name,
            certificateName: "più certificati",
            expiryDate: "",
            daysUntilExpiry: "",
            certList: list
          });

          await transporter.sendMail({
            from: `"${smtp.sender_name}" <${smtp.sender_email}>`,
            to: user.email,
            subject,
            text: body,
            replyTo: smtp.reply_to || undefined
          });
          sent++;
          items.forEach((i) => {
            digestLines.push(`L'utente ${user.first_name} ${user.last_name} è stato avvisato che ${i.cert.name} scade il ${formatDate(i.cert.expiry_date)}`);
          });
        }
      }
    }

    if (settings.notify_operators && settings.operator_email && digestLines.length > 0) {
      const digest = digestLines.join("\n");
      const subject = applyTemplate(operatorTemplate.subject, { digestList: digest });
      const body = applyTemplate(operatorTemplate.body, { digestList: digest });
      await transporter.sendMail({
        from: `"${smtp.sender_name}" <${smtp.sender_email}>`,
        to: settings.operator_email,
        subject,
        text: body,
        replyTo: smtp.reply_to || undefined
      });
      sent++;
    }

    if (settings.daily_digest && !force) {
      await supabase
        .from("notification_settings")
        .update({ last_sent_date: todayStr })
        .eq("id", NOTIFICATION_SETTINGS_ID);
    }

    return new Response(JSON.stringify({ message: "Notifiche inviate", sent }), { status: 200, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return new Response(JSON.stringify({ message }), { status: 500, headers: corsHeaders });
  }
});
