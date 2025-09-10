import express from "express";
import cors from "cors";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// Статические файлы
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMAIL_TO = "peredelano.codeshop@gmail.com";
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const leads = [];
const conversations = new Map();

const SYSTEM_PROMPT = `
You are Zizu, a multilingual real estate assistant for Hurghada, Egypt. You help clients buy or rent property and guide them through the process.

Your personality:
- Friendly, professional, and helpful
- Always speak in the user's language (English, Russian, Ukrainian, Arabic, German, French)
- Enthusiastic about helping clients find the perfect property
- Mention early that you have over 100 properties in your database

Your behavior:
- Always greet the user warmly and mention the 100+ properties available
- Ask key questions to understand their needs:
  1. Are you looking to buy or rent?
  2. What type of property? (apartment, villa, compound)
  3. Preferred location?
  4. Budget range?
  5. Number of bedrooms?
  6. Do you need a pool or beach access?
  7. When do you plan to make the transaction?

Lead collection strategy:
- After 2–3 exchanges, if the user seems interested, ask for contact details
- Show a contact form with:
  - Name
  - Phone
  - Email
  - Planning horizon: "Urgent", "1–2 months", "3–5 months"
- Encourage them by saying you’ll send personalized listings

Output format:
Return strictly valid JSON with these fields:

{
  "language": "<en | ru | uk | ar | de | fr>",
  "intent": "<property_inquiry | price_request | schedule_viewing | financing | other>",
  "entities": {
    "location": "...",
    "budget": "...",
    "property_type": "...",
    "preferred_date": "...",
    "planning_horizon": "<urgent | 1-2 months | 3-5 months>"
  },
  "priority": "<hot | warm | cold>",
  "need_contact": true/false,
  "contact_form": true/false,
  "consult": {
    "advice": [ "...", "..."],
    "next_questions": [ "...", "..."],
    "next_action": "..."
  }
}

Rules:
- Always reply in the user's language
- If the user sends a greeting or vague message, respond with a friendly intro and ask what they’re looking for
- If the user provides partial info, ask for missing details
- If the user seems ready to proceed, set need_contact=true and contact_form=true
- Do not invent specific listings or prices
- Do not mention districts unless the user does
- Do not include any extra fields outside the JSON
`;

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId = "default" } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message }
      ]
    });

    const content = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("Invalid JSON from model:", content);
      return res.status(502).json({ error: "Invalid model response", raw: content });
    }

    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, []);
    }
    conversations.get(sessionId).push({
      user_message: message,
      bot_response: parsed,
    });

    res.json(parsed);
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Chat processing failed" });
  }
});

app.post("/lead", async (req, res) => {
  try {
    const { name, email, phone, planning_horizon, sessionId = "default" } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Missing contact fields" });
    }

    const lead = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      name,
      email,
      phone,
      planning_horizon,
      sessionId,
      conversation: conversations.get(sessionId) || [],
    };

    leads.push(lead);

    const textBody = `
New Lead from Zizu Bot

Name: ${name}
Email: ${email}
Phone: ${phone}
Planning Horizon: ${planning_horizon}
Date: ${lead.timestamp}

Conversation:
${lead.conversation.map((msg, i) => `#${i + 1}\nUser: ${msg.user_message}\nZizu: ${JSON.stringify(msg.bot_response)}`).join("\n\n")}
`;

    const htmlBody = `
      <h2>🏠 New Lead from Zizu Bot</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Planning Horizon:</strong> ${planning_horizon}</p>
      <p><strong>Date:</strong> ${lead.timestamp}</p>
      <hr>
      <pre>${lead.conversation.map((msg, i) => `#${i + 1}\nUser: ${msg.user_message}\nZizu: ${JSON.stringify(msg.bot_response)}`).join("\n\n")}</pre>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: EMAIL_TO,
      subject: `🏠 New Lead: ${name}`,
      text: textBody,
      html: htmlBody,
    });

    res.json({ success: true, leadId: lead.id });
  } catch (error) {
    console.error("Lead error:", error);
    res.status(500).json({ error: "Failed to save lead" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Zizu Bot running on port ${PORT}`);
});
