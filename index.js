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

let menu = function (chatId) {
  bot.sendMessage(
    chatId,
    `Добро пожаловать!\nДанный бот создан для методического сопровождения учителей в процессе реализации федеральных государственных образовательных стандартов (ФГОС) в России.\n\nПожалуйста, выберите действие:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Узнать информацию о ФГОС",
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
        ],
      },
    },
  );
};

bot.onText(/\/start/, (msg, match) => {
  const chatId = msg.chat.id;
  bot.setChatMenuButton({
    chat_id: chatId,
    menu_button: {
      text: "Начать работу",
      type: "commands",
    },
  });
  for (let i = 0; i < 101; i++) {
    bot.deleteMessage(msg.chat.id, msg.message_id - i).catch((err) => {
      return;
    });
  }
  menu(chatId);
});

bot.on("callback_query", (callback) => {
  const chatId = callback.message.chat.id;
  bot.deleteMessage(chatId, callback.message.message_id);
  bot.answerCallbackQuery(callback.id);
  switch (callback.data) {
    case "cancel": {
      bot.removeListener("message");
      return menu(chatId);
    }
    case "faq": {
      let faq = db.prepare("SELECT * FROM faq").all();
      let buttons = [];
      faq.forEach((question) => {
        buttons.push([
          {
            text: question.title,
            callback_data: question.id,
          },
        ]);
      });
      buttons.push([
        {
          text: "<< Назад",
          callback_data: "cancel",
        },
      ]);
      bot.sendMessage(chatId, `Что вы хотите узнать сегодня?`, {
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
      bot.once("callback_query", async (q) => {
        let question = db
          .prepare(`SELECT * FROM faq WHERE id = '${q.data}'`)
          .get();
        if (!question || question === undefined) {
          return false;
        } else {
          await bot.sendMessage(
            chatId,
            `*${question.title}*\n\n${question.value}`,
            {
              parse_mode: "Markdown",
            },
          );
          await bot.sendMessage(
            chatId,
            "_Если вам понравился этот ответ, вы можете сохранить его в Избранное._",
            {
              parse_mode: "Markdown",
            },
          );
          return menu(chatId);
        }
      });
      break;
    }
    case "ai": {
      let prompt = bot.sendMessage(
        chatId,
        `Задайте свой вопрос - наш помощник попробует дать на него ответ.\n⚠️ Будьте вежливы и старайтесь чётко формулировать вопрос.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "<< Назад",
                  callback_data: "cancel",
                },
              ],
            ],
          },
        },
      );
      bot.once("message", async (msg) => {
        bot.deleteMessage(chatId, (await prompt).message_id);
        let faq = db.prepare("SELECT * FROM faq").all();
        let response = undefined;
        if (faq.some((q) => msg.text.toLowerCase() === q.title.toLowerCase())) {
          let question = faq.find(
            (q) => msg.text.toLowerCase() === q.title.toLowerCase(),
          );
          response = question.value;
        } else {
          let wait = bot.sendMessage(
            chatId,
            "Помощник обрабатывает ваш запрос. Это может занять некоторое время. Пожалуйста, подождите...",
          );
          const completion = await openai.chat.completions.create({
            model: "google/gemini-2.0-flash-thinking-exp:free",
            messages: [
              {
                role: "system",
                content: process.env.SYSTEM_PROMPT,
              },
              { role: "user", content: msg.text },
            ],
            provider: { sort: "throughput" },
          });
          bot.deleteMessage(chatId, (await wait).message_id);
          response = completion.choices[0].message.content;
        }
        await bot.sendMessage(chatId, response, {
          reply_to_message_id: msg.message_id,
        });
        await bot.sendMessage(
          chatId,
          "_Если вам понравился этот ответ, вы можете сохранить его в Избранное._",
          {
            parse_mode: "Markdown",
          },
        );
        return menu(chatId);
      });
      break;
    }
    case "poster": {
      bot.sendMessage(
        chatId,
        "Выберите формат, в котором хотите получить плакаты.",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "PDF (для печати)",
                  callback_data: "poster_pdf",
                },
                {
                  text: "PNG (для пересылки)",
                  callback_data: "poster_png",
                },
              ],
              [
                {
                  text: "<< Назад",
                  callback_data: "cancel",
                },
              ],
            ],
          },
        },
      );
      bot.once("callback_query", async (format) => {
        switch (format.data) {
          case "poster_pdf": {
            await bot.sendDocument(chatId, "./assets/poster.pdf");
            await bot.sendMessage(
              chatId,
              "_Вы можете поделиться плакатами с другими людьми, а также сохранить их на своё устройство или в Избранное._",
              {
                parse_mode: "Markdown",
              },
            );
            return menu(chatId);
          }
          case "poster_png": {
            await bot.sendDocument(chatId, "./assets/poster1.png");
            await bot.sendDocument(chatId, "./assets/poster2.png");
            await bot.sendMessage(
              chatId,
              "_Вы можете поделиться плакатами с другими людьми, а также сохранить их на своё устройство или в Избранное._",
              {
                parse_mode: "Markdown",
              },
            );
            return menu(chatId);
          }
        }
      });
    }
  }
});

bot.on("polling_error", (err) => {
  console.log(err);
});
