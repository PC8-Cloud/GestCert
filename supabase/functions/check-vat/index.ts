// Supabase Edge Function – VIES VAT validation proxy
// Bypasses CORS by calling the EU VIES REST API server-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { countryCode, vatNumber } = await req.json();

    if (!countryCode || !vatNumber) {
      return new Response(
        JSON.stringify({ error: "countryCode e vatNumber sono obbligatori" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const cleaned = vatNumber.replace(/[\s.\-]/g, "");
    const viesUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${countryCode}/vat/${cleaned}`;

    console.log(`[check-vat] Calling VIES: ${viesUrl}`);

    const viesResp = await fetch(viesUrl, {
      headers: { Accept: "application/json" },
    });

    if (!viesResp.ok) {
      // Forward VIES error status
      const errorText = await viesResp.text().catch(() => "");
      console.error(`[check-vat] VIES returned ${viesResp.status}: ${errorText}`);
      return new Response(
        JSON.stringify({
          error: `VIES returned ${viesResp.status}`,
          isValid: false,
        }),
        { status: viesResp.status, headers: corsHeaders }
      );
    }

    const data = await viesResp.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("[check-vat] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Errore interno" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
