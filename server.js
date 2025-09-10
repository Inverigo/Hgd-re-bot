import express from "express";
import cors from "cors";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json());

// Статические файлы (HTML, CSS, JS)
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

app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId = "default" } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    const prompt = `
You are Zizu, a friendly real estate assistant in Hurghada. Analyze the message and return valid JSON:
{
  "intent": "<property_inquiry | price_request | schedule_viewing | financing | other>",
  "entities": {
    "location": "...",
    "budget": "...",
    "property_type": "...",
    "preferred_date": "..."
  },
  "priority": "<hot | warm | cold>",
  "need_contact": true/false,
  "contact_form": true/false
}
Message: "${message}"
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: prompt }],
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    // Сохраняем диалог
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
    const { name, email, phone, sessionId = "default" } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Missing contact fields" });
    }

    const lead = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      name,
      email,
      phone,
      sessionId,
      conversation: conversations.get(sessionId) || [],
    };

    leads.push(lead);

    const textBody = `
New Lead from Zizu Bot

Name: ${name}
Email: ${email}
Phone: ${phone}
Date: ${lead.timestamp}

Conversation:
${lead.conversation.map((msg, i) => `#${i + 1}\nUser: ${msg.user_message}\nZizu: ${JSON.stringify(msg.bot_response)}`).join("\n\n")}
`;

    const htmlBody = `
      <h2>🏠 New Lead from Zizu Bot</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
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
