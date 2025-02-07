require("dotenv/config");

const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const bot = new TelegramBot(process.env.TOKEN, {
  polling: true,
  onlyFirstMatch: true,
});

bot.onText(/\/start/, (msg, match) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Добро пожаловать! Данный бот поможет вам с применением ФГОС.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Часто задаваемые вопросы",
              callback_data: "faq",
            },
          ],
          [
            {
              text: "Задать вопрос",
              callback_data: "ai",
            },
          ],
          [
            {
              text: "Получить плакат",
              callback_data: "poster",
            },
          ],
          [
            {
              text: "Перейти на сайт ФГОС",
              web_app: {
                url: "https://fgos.ru/",
              },
            },
          ],
        ],
      },
    },
  );
});

bot.on("callback_query", (callback) => {
  const chatId = callback.message.chat.id;
  switch (callback.data) {
    case "faq": {
      return bot.sendMessage(chatId, `В разработке!`);
    }
    case "ai": {
      bot.sendMessage(chatId, `Напишите свой вопрос:`);
      bot.once("message", async (msg) => {
        bot.sendChatAction(chatId, "typing");
        const completion = await openai.chat.completions.create({
            model: "deepseek/deepseek-r1:free",
            messages: [{ role: "user", content: msg.text }],
            provider: {sort: 'throughput'}
          });
          console.log(completion.choices[0].message);
          return bot.sendMessage(chatId, completion.choices[0].message.content, {
            parse_mode: "Markdown"
          });
      })
      break;
    }
    case "poster": {
      return bot.sendDocument(chatId, "./assets/poster.png");
    }
  }
});

bot.on("polling_error", (err) => {
  console.log(err);
});
