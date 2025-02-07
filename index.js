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
              text: "Перейти на сайт ФГОС",
              callback_data: "website",
            },
          ],
          [
            {
              text: "Получить плакат",
              callback_data: "poster",
            },
          ],
        ],
      },
    },
  );
});

bot.onText(/\/faq/, (msg, match) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `В разработке!`);
});

bot.onText(/\/askai/, async (msg, match) => {
  const chatId = msg.chat.id;
  const completion = await openai.chat.completions.create({
    model: "deepseek/deepseek-r1:free",
    messages: [{ role: "user", content: "What is the meaning of life?" }],
  });
  console.log(completion.choices[0].message);
  bot.sendMessage(chatId, completion.choices[0].message.content);
});

bot.on("polling_error", (err) => {
  console.log(err);
});
