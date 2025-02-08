require("dotenv/config");

const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const sql = require("better-sqlite3");

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const bot = new TelegramBot(process.env.TOKEN, {
  polling: true,
  onlyFirstMatch: true,
});

let db = new sql("./assets/data.db");
db.prepare(
  "CREATE TABLE IF NOT EXISTS faq(id INTEGER PRIMARY KEY AUTOINCREMENT, title STRING, value STRING)",
).run();

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
      let faq = db.prepare("SELECT * FROM faq").all();
      console.log(faq);
      let buttons = [];
      faq.forEach((question) => {
        buttons.push([
          {
            text: question.title,
            callback_data: question.id,
          },
        ]);
      });
      console.log(buttons);
      return bot.sendMessage(chatId, `На какой вопрос вы хотите получить ответ?`, {
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
    }
    case "ai": {
      let prompt = bot.sendMessage(chatId, `Напишите свой вопрос:`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Отмена",
                callback_data: "ai_cancel"
              }
            ]
          ]
        }
      });
      bot.once("callback_query", (callback => {
        if (callback.data === "ai_cancel") {
          bot.removeListener("message");
          return bot.deleteMessage(chatId, callback.message.message_id);
        }
        else return;
      }))
      bot.once("message", async (msg) => {
        bot.deleteMessage(chatId, (await prompt).message_id);
        bot.sendChatAction(chatId, "typing");
        console.log("Activating AI...")
        const completion = await openai.chat.completions.create({
          model: "deepseek/deepseek-r1:free",
          messages: [{ role: "user", content: msg.text }],
          provider: { sort: "throughput" },
        });
        console.log(completion.choices[0].message);
        await bot.sendMessage(chatId, completion.choices[0].message.content, {
          parse_mode: "Markdown",
          reply_to_message_id: msg.message_id
        });
        return bot.sendMessage(chatId, "Понравился ли вам ответ?", {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Да",
                  callback_data: "ai_like",
                },
              ],
              [
                {
                  text: "Нет",
                  callback_data: "ai_dislike",
                },
              ],
            ],
          },
        });
      });
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
