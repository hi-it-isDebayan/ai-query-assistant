// Multi-model AI chat with smart routing across Lovable AI models
// Models used:
//  - openai/gpt-5            -> code, complex reasoning, math
//  - google/gemini-2.5-pro   -> long context, vision, deep reasoning
//  - google/gemini-2.5-flash -> default general Q&A (fast)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Msg = { role: "user" | "assistant" | "system"; content: string };

function pickModel(messages: Msg[], override?: string): string {
  if (override && override !== "auto") return override;
  const last = [...messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ?? "";
  const totalLen = messages.reduce((n, m) => n + m.content.length, 0);

  // Code / programming / math / debugging -> GPT-5
  if (
    /\b(code|bug|error|stack trace|function|typescript|javascript|python|rust|go\b|java\b|c\+\+|sql|regex|algorithm|complexity|debug|compile|exception|equation|integral|derivative|theorem|proof|prove)\b/.test(
      last
    ) ||
    /```/.test(last)
  ) {
    return "openai/gpt-5";
  }

  // Long / complex reasoning, vision-style queries -> Gemini 2.5 Pro
  if (
    totalLen > 6000 ||
    /\b(image|picture|diagram|chart|analyze|long|document|pdf|research|compare in detail|step by step|reasoning)\b/.test(
      last
    )
  ) {
    return "google/gemini-2.5-pro";
  }

  // Default fast general Q&A
  return "google/gemini-2.5-flash";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, modelOverride } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = pickModel(messages, modelOverride);

    const systemPrompt = `You are an automated query resolution assistant powered by multiple AI models. You provide clear, accurate, well-structured answers using markdown formatting (headings, lists, code blocks where appropriate). Be concise but complete. The current model serving this turn is "${model}".`;

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (upstream.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Please add credits to your Lovable workspace.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await upstream.text();
      console.error("AI gateway error:", upstream.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-Model-Used": model,
      },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
