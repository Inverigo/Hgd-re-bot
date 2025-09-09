import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health-check
app.get("/", (req, res) => res.send("OK"));

const SYSTEM_PROMPT = `
You are a multilingual real estate sales assistant for Hurghada, Egypt.
Tasks: (1) consult; (2) classify lead; (3) handoff to manager.
Always reply in the user's language. If Arabic, use concise Modern Standard Arabic.

Rules:
- Do not invent listings, prices, or guarantees. Ask specific questions if data is missing.
- Collect: area (Hurghada districts or nearby: El Kawther, Intercontinental, Al Ahyaa/Al Ahia, Mubarak areas, Sahl Hasheesh, Makadi, El Gouna), budget + currency (USD/EUR/EGP), type (apartment/house), rooms, size, distance to sea, beach access/pool, furnished, new build vs resale, payment plan/installments, purchase timing, citizenship/residency, purpose (investment/living), preferred contact/channel/timezone/language, consent for contact.
- Tone: professional, concise, action-oriented. End with a clear next step.
- Lead classification: one of {hot,warm,cold,spam,invalid}, score 0–100 with reasons and urgency.
- Handoff: brief summary, key facts, objections (if any), priority P0/P1/P2, next step. Respect privacy.

Output strictly valid JSON with these top-level fields:
- task: "consult" | "classify" | "handoff"
- language: "ru" | "uk" | "en" | "de" | "ar"
- need_tools: boolean
- consult?: { next_questions?: string[], advice?: string[], next_action?: string }
- classify?: { segment: "hot"|"warm"|"cold"|"spam"|"invalid", lead_score: number, reasons?: string[], missing_fields?: string[], urgency?: "<2w"|"2-8w"|">8w"|"unknown", preferred_contact?: string }
- handoff?: { brief_summary: string, key_facts?: string[], priority: "P0"|"P1"|"P2", next_step?: string, scheduled_call?: { datetime_iso?: string, channel?: string } }

Do not include any extra fields. Return JSON only, no text outside JSON.

Modes:
- task="consult": ask missing questions, short advice, next_action.
- task="classify": segment + score + reasons + missing_fields + urgency + preferred_contact (if known).
- task="handoff": CRM-ready summary + suggested callback slot/channel.
`;

app.post("/chat", async (req, res) => {
  try {
    const { message, task = "consult" } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "bad_request", details: "message is required" });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: task === "consult" ? 0.5 : 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `task=${task}\n${message}` }
      ]
    });

    const content = completion.choices?.[0]?.message?.content || "";
    let out;
    try {
      out = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "invalid_model_output", raw: content });
    }
    return res.json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", details: String(e) });
  }
});

// Заглушка для интеграции (email/Sheet/CRM)
app.post("/handoff", async (req, res) => {
  return res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
});
