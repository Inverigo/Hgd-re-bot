import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

Modes:
- task="consult": ask missing questions, give short advice and next_action.
- task="classify": segment + score + reasons + missing_fields + urgency + preferred_contact (if known).
- task="handoff": CRM-ready summary + suggested callback slot/channel.

Few-shot style notes (do not output literally):
- RU: "Ищу 2к в Хургаде, до 80,000 USD, ближайшие 1–2 месяца, рассрочка, связь — Telegram." → segment=hot, urgency=2-8w, missing_fields: район, метраж.
- EN: "Budget 120k USD, El Kawther or Intercontinental, move in <2 months, WhatsApp." → hot, reasons: clear budget+area+timeline.
- AR: keep concise MSA; confirm consent to be contacted and preferred time window (with timezone).
`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    task: { type: "string", enum: ["consult", "classify", "handoff"] },
    language: { type: "string", enum: ["ru","uk","en","de","ar"] },
    need_tools: { type: "boolean" },
    consult: {
      type: "object",
      properties: {
        next_questions: { type: "array", items: { type: "string" } },
        advice: { type: "array", items: { type: "string" } },
        next_action: { type: "string" }
      }
    },
    classify: {
      type: "object",
      properties: {
        segment: { type: "string", enum: ["hot","warm","cold","spam","invalid"] },
        lead_score: { type: "integer", minimum: 0, maximum: 100 },
        reasons: { type: "array", items: { type: "string" } },
        missing_fields: { type: "array", items: { type: "string" } },
        urgency: { type: "string", enum: ["<2w","2-8w",">8w","unknown"] },
        preferred_contact: { type: "string" }
      },
      required: ["segment","lead_score"]
    },
    handoff: {
      type: "object",
      properties: {
        brief_summary: { type: "string" },
        key_facts: { type: "array", items: { type: "string" } },
        priority: { type: "string", enum: ["P0","P1","P2"] },
        next_step: { type: "string" },
        scheduled_call: {
          type: "object",
          properties: {
            datetime_iso: { type: "string" },
            channel: { type: "string" }
          }
        }
      },
      required: ["brief_summary","priority"]
    },
    tool_requests: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, arguments: { type: "object" } },
        required: ["name","arguments"]
      }
    }
  },
  required: ["task","language","need_tools"]
};

app.post("/chat", async (req, res) => {
  try {
    const { message, task = "consult" } = req.body;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `task=${task}\n${message}` }
      ],
      temperature: task === "consult" ? 0.5 : 0.25,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "HurghadaRE_V1",
          schema: OUTPUT_SCHEMA,
          strict: true
        }
      }
    });

    const out = JSON.parse(response.output_text);
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error", details: String(e) });
  }
});

// Stub endpoint: add email/Sheet/CRM later
app.post("/handoff", async (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
