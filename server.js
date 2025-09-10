import express from "express";
import cors from "cors";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Хранение диалогов и лидов
const conversations = new Map();
const leads = [];

// Веб-интерфейс для чатбота
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Консультант по недвижимости в Хургаде</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
        .chat-container { background: white; border-radius: 15px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; color: #333; margin-bottom: 20px; }
        .messages { height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 10px; background: #f9f9f9; }
        .message { margin-bottom: 10px; padding: 10px; border-radius: 8px; }
        .user-message { background: #007cba; color: white; text-align: right; }
        .bot-message { background: #e3f2fd; }
        .input-container { display: flex; gap: 10px; }
        .input-container input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
        .input-container button { background: #007cba; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; }
        .loading { text-align: center; color: #666; }
        .contact-form { background: #e8f5e8; padding: 15px; border-radius: 10px; margin: 10px 0; }
        .contact-form input { width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px; }
        .contact-form button { background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <h2>🏠 Консультант по недвижимости в Хургаде</h2>
            <p>Получите персональную консультацию и подберите идеальную недвижимость!</p>
        </div>
        
        <div id="messages" class="messages">
            <div class="message bot-message">
                <strong>🤖 Консультант:</strong> Привет! Я помогу вам найти идеальную недвижимость в Хургаде. Расскажите, что вас интересует?
            </div>
        </div>
        
        <div class="input-container">
            <input type="text" id="userInput" placeholder="Например: Ищу квартиру у моря до 50,000 USD..." />
            <button onclick="sendMessage()">Отправить</button>
        </div>
    </div>

    <script>
        let sessionId = 'session_' + Date.now();
        
        async function sendMessage() {
            const input = document.getElementById('userInput');
            const message = input.value.trim();
            if (!message) return;
            
            const messagesDiv = document.getElementById('messages');
            
            // Добавляем сообщение пользователя
            const userDiv = document.createElement('div');
            userDiv.className = 'message user-message';
            userDiv.innerHTML = '<strong>Вы:</strong> ' + message;
            messagesDiv.appendChild(userDiv);
            
            // Очищаем поле ввода
            input.value = '';
            
            // Показываем загрузку
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message loading';
            loadingDiv.innerHTML = '🤖 Консультант думает...';
            messagesDiv.appendChild(loadingDiv);
            
            // Прокручиваем вниз
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            
            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message: message, 
                        task: 'consult',
                        sessionId: sessionId
                    })
                });
                
                const data = await response.json();
                
                // Удаляем загрузку
                messagesDiv.removeChild(loadingDiv);
                
                // Добавляем ответ бота
                const botDiv = document.createElement('div');
                botDiv.className = 'message bot-message';
                
                let responseText = '';
                if (data.consult) {
                    if (data.consult.advice && data.consult.advice.length > 0) {
                        responseText += data.consult.advice.join('<br>') + '<br><br>';
                    }
                    if (data.consult.next_questions && data.consult.next_questions.length > 0) {
                        responseText += '<strong>Дополнительные вопросы:</strong><br>' + data.consult.next_questions.join('<br>') + '<br><br>';
                    }
                    if (data.consult.next_action) {
                        responseText += '<strong>Следующий шаг:</strong> ' + data.consult.next_action;
                    }
                    
                    // Если нужно собрать контакты
                    if (data.need_contact && data.contact_form) {
                        responseText += '<br><br><div class="contact-form">';
                        responseText += '<strong>📞 Оставьте контакты для персональной консультации:</strong><br>';
                        responseText += '<input type="text" id="leadName" placeholder="Ваше имя" /><br>';
                        responseText += '<input type="email" id="leadEmail" placeholder="Email" /><br>';
                        responseText += '<input type="tel" id="leadPhone" placeholder="Телефон" /><br>';
                        responseText += '<button onclick="submitLead()">Отправить контакты</button>';
                        responseText += '</div>';
                    }
                } else {
                    responseText = 'Спасибо за ваш вопрос! Я передам его нашему менеджеру.';
                }
                
                botDiv.innerHTML = '<strong>🤖 Консультант:</strong> ' + responseText;
                messagesDiv.appendChild(botDiv);
                
            } catch (error) {
                // Удаляем загрузку
                messagesDiv.removeChild(loadingDiv);
                
                // Показываем ошибку
                const errorDiv = document.createElement('div');
                errorDiv.className = 'message bot-message';
                errorDiv.innerHTML = '<strong>🤖 Консультант:</strong> Извините, произошла ошибка. Попробуйте еще раз.';
                messagesDiv.appendChild(errorDiv);
            }
            
            // Прокручиваем вниз
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        async function submitLead() {
            const name = document.getElementById('leadName').value;
            const email = document.getElementById('leadEmail').value;
            const phone = document.getElementById('leadPhone').value;
            
            if (!name || !email || !phone) {
                alert('Пожалуйста, заполните все поля');
                return;
            }
            
            try {
                await fetch('/lead', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        name: name,
                        email: email,
                        phone: phone
                    })
                });
                
                alert('Спасибо! Мы свяжемся с вами в ближайшее время.');
                
                // Убираем форму
                const contactForm = document.querySelector('.contact-form');
                if (contactForm) {
                    contactForm.innerHTML = '<strong>✅ Контакты получены! Мы свяжемся с вами.</strong>';
                }
                
            } catch (error) {
                alert('Ошибка при отправке контактов');
            }
        }
        
        // Отправка по Enter
        document.getElementById('userInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    </script>
</body>
</html>
  `);
});

// Улучшенный промпт для сбора лидов
const SYSTEM_PROMPT = `
You are a professional real estate sales assistant for Hurghada, Egypt. Your goal is to collect leads and provide excellent customer service.

IMPORTANT: Always try to collect contact information (name, email, phone) from interested clients.

Tasks: (1) consult; (2) classify lead; (3) handoff to manager.
Always reply in the user's language. If Arabic, use concise Modern Standard Arabic.

Rules:
- Be friendly, professional, and helpful
- Ask specific questions to understand client needs
- Always try to get contact information for serious inquiries
- Do not invent listings, prices, or guarantees
- Collect: area (Hurghada districts: El Kawther, Intercontinental, Al Ahyaa/Al Ahia, Mubarak areas, Sahl Hasheesh, Makadi, El Gouna), budget + currency (USD/EUR/EGP), type (apartment/house), rooms, size, distance to sea, beach access/pool, furnished, new build vs resale, payment plan/installments, purchase timing, citizenship/residency, purpose (investment/living), preferred contact/channel/timezone/language, consent for contact.

Lead Collection Strategy:
- After 2-3 exchanges, if client seems interested, ask for contact details
- Offer personalized consultation as incentive
- Mention that you'll send them specific listings
- Be persistent but not pushy

Output strictly valid JSON with these top-level fields:
- task: "consult" | "classify" | "handoff"
- language: "ru" | "uk" | "en" | "de" | "ar"
- need_contact: boolean (true if should ask for contact info)
- contact_form: boolean (true if should show contact form)
- consult?: { next_questions?: string[], advice?: string[], next_action?: string }
- classify?: { segment: "hot"|"warm"|"cold"|"spam"|"invalid", lead_score: number, reasons?: string[], missing_fields?: string[], urgency?: "<2w"|"2-8w"|">8w"|"unknown", preferred_contact?: string }
- handoff?: { brief_summary: string, key_facts?: string[], priority: "P0"|"P1"|"P2", next_step?: string, scheduled_call?: { datetime_iso?: string, channel?: string } }

Do not include any extra fields. Return JSON only, no text outside JSON.

Modes:
- task="consult": ask missing questions, short advice, next_action. If client seems interested, set need_contact=true and contact_form=true.
- task="classify": segment + score + reasons + missing_fields + urgency + preferred_contact (if known).
- task="handoff": CRM-ready summary + suggested callback slot/channel.
`;

// Сохранение диалогов
function saveConversation(sessionId, message, response) {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, []);
  }
  
  conversations.get(sessionId).push({
    timestamp: new Date().toISOString(),
    user_message: message,
    bot_response: response
  });
  
  // Сохраняем в файл
  try {
    const data = {
      conversations: Object.fromEntries(conversations),
      leads: leads,
      last_updated: new Date().toISOString()
    };
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

app.post("/chat", async (req, res) => {
  try {
    const { message, task = "consult", sessionId } = req.body || {};
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
    
    // Сохраняем диалог
    if (sessionId) {
      saveConversation(sessionId, message, out);
    }
    
    return res.json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", details: String(e) });
  }
});

// Сохранение лидов
app.post("/lead", async (req, res) => {
  try {
    const { sessionId, name, email, phone } = req.body;
    
    const lead = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
      name: name,
      email: email,
      phone: phone,
      conversation: conversations.get(sessionId) || []
    };
    
    leads.push(lead);
    
    // Сохраняем в файл
    try {
      const data = {
        conversations: Object.fromEntries(conversations),
        leads: leads,
        last_updated: new Date().toISOString()
      };
      fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving data:', error);
    }
    
    res.json({ success: true, leadId: lead.id });
  } catch (error) {
    console.error('Error saving lead:', error);
    res.status(500).json({ error: 'Failed to save lead' });
  }
});

// Получение всех лидов
app.get("/leads", (req, res) => {
  res.json({
    leads: leads,
    total: leads.length,
    last_updated: new Date().toISOString()
  });
});

// Экспорт лидов в CSV
app.get("/export/leads.csv", (req, res) => {
  const csvHeader = "ID,Дата,Имя,Email,Телефон,Сообщений\n";
  const csvData = leads.map(lead => 
    `${lead.id},${lead.timestamp},${lead.name},${lead.email},${lead.phone},${lead.conversation.length}`
  ).join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(csvHeader + csvData);
});

// Заглушка для интеграции (email/Sheet/CRM)
app.post("/handoff", async (req, res) => {
  return res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
});
