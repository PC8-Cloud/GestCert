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

const SMTP_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    console.log("send-smtp called");
    const body = await req.json();
    const to = body.to as string;
    const subject = body.subject as string;
    const text = body.text as string;
    const html = body.html as string | undefined;

    if (!to || !subject || !text) {
      console.error("Parametri mancanti", { to, subject, textLength: text?.length });
      return new Response(JSON.stringify({ message: "Parametri mancanti" }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Env mancanti", { hasUrl: !!supabaseUrl, hasServiceKey: !!serviceRoleKey });
      return new Response(JSON.stringify({ message: "Env Supabase mancanti" }), { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from("smtp_settings")
      .select("*")
      .eq("id", SMTP_SETTINGS_ID)
      .single();

    if (error || !data) {
      console.error("Configurazione SMTP non trovata", error?.message);
      return new Response(JSON.stringify({ message: "Configurazione SMTP non trovata" }), { status: 400, headers: corsHeaders });
    }

    const smtp = data as SmtpRow;
    if (!smtp.enabled) {
      console.error("SMTP disabilitato");
      return new Response(JSON.stringify({ message: "SMTP disabilitato" }), { status: 400, headers: corsHeaders });
    }

    console.log("SMTP config loaded", {
      host: smtp.host,
      port: smtp.port,
      encryption: smtp.encryption,
      sender: smtp.sender_email
    });

    const secure = smtp.encryption === "SSL";
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure,
      auth: {
        user: smtp.smtp_user,
        pass: smtp.smtp_password
      },
      tls: smtp.encryption === "TLS" ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });

    await transporter.sendMail({
      from: `"${smtp.sender_name}" <${smtp.sender_email}>`,
      to,
      subject,
      text,
      html,
      replyTo: smtp.reply_to || undefined
    });

    console.log("Email inviata");
    return new Response(JSON.stringify({ message: "Email inviata" }), { status: 200, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("Errore send-smtp:", message);
    return new Response(JSON.stringify({ message }), { status: 500, headers: corsHeaders });
  }
});
