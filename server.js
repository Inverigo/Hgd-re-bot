import express from "express";
import cors from "cors";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

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

const conversations = new Map();
const leads = [];

const SYSTEM_PROMPT = `
You are Zizu, a multilingual real estate assistant for Hurghada, Egypt. You help clients buy, rent, or sell property and guide them through the process.

Always reply in the user's language (English, Russian, Ukrainian, Arabic, German, French). Speak naturally and professionally. Never include technical metadata or JSON — just respond as Zizu.

Scenarios:
- If the user wants to buy: greet them, mention 100+ properties, ask about type, location, budget, bedrooms, pool/beach access, and timeline.
- If the user wants to rent: greet them, ask about area, number of rooms, rental duration, and budget.
- If the user wants to sell: ask for contact details and a brief description of the apartment and location.

After 3–4 exchanges, if the user seems interested, ask for contact details:
- Name
- Phone
- Email
- Planning horizon

Always be friendly, helpful, and focused on guiding the user toward a decision.
`;

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId = "default" } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    const history = conversations.get(sessionId) || [];
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map(msg => ({ role: "user", content: msg.user }, { role: "assistant", content: msg.bot })),
      { role: "user", content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages
    });

    const reply = completion.choices[0].message.content;

    if (!conversations.has(sessionId)) conversations.set(sessionId, []);
    conversations.get(sessionId).push({ user: message, bot: reply });

    const showContactForm = conversations.get(sessionId).length >= 4;

    res.json({
      reply,
      showContactForm
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Chat failed" });
  }
});

app.post("/lead", async (req, res) => {
  try {
    const { name, email, phone, planning, description, sessionId = "default" } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Missing contact fields" });
    }

    const lead = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      name,
      email,
      phone,
      planning,
      description,
      conversation: conversations.get(sessionId) || []
    };

    leads.push(lead);

    const html = `
      <h2>🏠 New Lead from Zizu Bot</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Planning:</strong> ${planning}</p>
      <p><strong>Description:</strong> ${description}</p>
      <hr>
      <pre>${lead.conversation.map((msg, i) => `#${i + 1}\nUser: ${msg.user}\nZizu: ${msg.bot}`).join("\n\n")}</pre>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: EMAIL_TO,
      subject: `🏠 New Lead: ${name}`,
      html
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Lead error:", error);
    res.status(500).json({ error: "Lead failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Zizu Bot running on port ${PORT}`);
});
