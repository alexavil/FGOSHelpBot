require("dotenv/config");

const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://c0f3b8ffd401c00337f393c79c80a6f6@o4506205891985408.ingest.us.sentry.io/4509000116797440",
});

const TelegramBot = require("node-telegram-bot-api");
const OpenAI = require("openai");

const sql = require("better-sqlite3");

const fs = require("fs-extra");

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const bot = new TelegramBot(process.env.TOKEN, {
  polling: true,
  onlyFirstMatch: true,
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4,
    },
  },
});

let db = new sql("./assets/data.db");
db.prepare(
  "CREATE TABLE IF NOT EXISTS faq(id INTEGER PRIMARY KEY AUTOINCREMENT, title STRING, value STRING)",
).run();

let isAiActive = false;

let menu = function (mode, chatId, callbackId) {
  switch (mode) {
    default: {
      return false;
    }
    case "post": {
      return bot.sendMessage(
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
                  text: "Получить плакаты",
                  callback_data: "poster",
                },
              ],
            ],
          },
        },
      );
    }
    case "edit": {
      return bot.editMessageText(
        `Добро пожаловать!\nДанный бот создан для методического сопровождения учителей в процессе реализации федеральных государственных образовательных стандартов (ФГОС) в России.\n\nПожалуйста, выберите действие:`,
        {
          chat_id: chatId,
          message_id: callbackId,
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
                  text: "Получить плакаты",
                  callback_data: "poster",
                },
              ],
            ],
          },
        },
      );
    }
  }
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
  return menu("post", chatId);
});

bot.on("callback_query", (callback) => {
  const chatId = callback.message.chat.id;
  bot.answerCallbackQuery(callback.id);
  switch (callback.data) {
    default: {
      return false;
    }
    case "cancel": {
      return menu("edit", chatId, callback.message.message_id);
    }
    case "ai_cancel": {
      isAiActive = false;
      bot.removeListener("message");
      return menu("edit", chatId, callback.message.message_id);
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
      bot.editMessageText(
        `Здесь вы можете узнать основную информацию о ФГОС.\nПожалуйста, выберите вопрос.`,
        {
          chat_id: chatId,
          message_id: callback.message.message_id,
          reply_markup: {
            inline_keyboard: buttons,
          },
        },
      );
      bot.once("callback_query", async (q) => {
        let question = db
          .prepare(`SELECT * FROM faq WHERE id = '${q.data}'`)
          .get();
        if (!question || question === undefined) {
          return false;
        } else {
          let wait = bot.editMessageText("Пожалуйста, подождите...", {
            chat_id: chatId,
            message_id: callback.message.message_id,
          });
          await bot.sendMessage(
            chatId,
            `*${question.title}*\n\n${question.value}`,
            {
              parse_mode: "Markdown",
            },
          );
          await bot.editMessageText(
            "_Если вам понравился этот ответ, вы можете сохранить его в Избранное._",
            {
              chat_id: chatId,
              message_id: callback.message.message_id,
              parse_mode: "Markdown",
            },
          );
          return menu("post", chatId);
        }
      });
      break;
    }
    case "ai": {
      switch (isAiActive) {
        case true: {
          return bot.editMessageText(
            `_Вы уже можете задать вопрос. Напишите его, и наш помощник попробует дать на него ответ._`,
            {
              chat_id: chatId,
              message_id: callback.message.message_id,
              parse_mode: "Markdown",
            },
          );
        }
        case false: {
          isAiActive = true;
          let prompt = bot.editMessageText(
            `Задайте свой вопрос - наш помощник попробует дать на него ответ.\n_⚠️ Будьте вежливы и старайтесь чётко формулировать вопрос. Помните о том, что ответственность за реализацию ФГОС на занятиях несёте только вы, и проверяйте информацию._`,
            {
              chat_id: chatId,
              message_id: callback.message.message_id,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "<< Назад",
                      callback_data: "ai_cancel",
                    },
                  ],
                ],
              },
            },
          );
          bot.once("message", async (msg) => {
            if (msg.text === "/start") return false;
            let faq = db.prepare("SELECT * FROM faq").all();
            let response = undefined;
            if (
              faq.some((q) => msg.text.toLowerCase() === q.title.toLowerCase())
            ) {
              let question = faq.find(
                (q) => msg.text.toLowerCase() === q.title.toLowerCase(),
              );
              response = question.value;
            } else {
              await bot.editMessageText(
                "Помощник обрабатывает ваш запрос. Это может занять некоторое время. Пожалуйста, подождите...",
                {
                  chat_id: chatId,
                  message_id: (await prompt).message_id,
                },
              );
              let system = await fs.readFile("./assets/system_prompt.txt");
              const completion = await openai.chat.completions.create({
                models: [
                  "google/gemini-2.0-flash-thinking-exp:free",
                  "google/gemini-2.0-pro-exp-02-05:free",
                  "deepseek/deepseek-r1:free",
                ],
                messages: [
                  {
                    role: "system",
                    content: system.toString(),
                  },
                  { role: "user", content: msg.text },
                ],
                provider: { sort: "throughput" },
                include_reasoning: true,
              });
              console.log(completion);
              if (completion.error || completion.choices === undefined) {
                Sentry.captureException(completion.error);
                message = "Произошла ошибка. Попробуйте задать вопрос ещё раз.";
              }
              else message = completion.choices[0].message.content;
              response = message
                .replaceAll("**", "")
                .replaceAll("*", "")
                .replaceAll(/  +/g, " ");
            }
            if (response.length > 4096) {
              let res = [];
              while (response.length) {
                res.push(response.substring(0, 4096));
                response = response.substring(4096);
              }
              for (const r of res) {
                await bot.sendMessage(chatId, r, {
                  reply_to_message_id: msg.message_id,
                });
              }
              await bot.editMessageText(
                "_Если вам понравился этот ответ, вы можете сохранить его в Избранное._",
                {
                  chat_id: chatId,
                  message_id: (await prompt).message_id,
                  parse_mode: "Markdown",
                },
              );
              isAiActive = false;
            } else {
              await bot.sendMessage(chatId, response, {
                reply_to_message_id: msg.message_id,
              });
              await bot.editMessageText(
                "_Если вам понравился этот ответ, вы можете сохранить его в Избранное._",
                {
                  chat_id: chatId,
                  message_id: (await prompt).message_id,
                  parse_mode: "Markdown",
                },
              );
              isAiActive = false;
            }
            return menu("post", chatId);
          });
        }
      }
      break;
    }
    case "poster": {
      bot.editMessageText(
        "Выберите формат, в котором хотите получить плакаты.",
        {
          chat_id: chatId,
          message_id: callback.message.message_id,
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
          default: {
            return false;
          }
          case "poster_pdf": {
            await bot.editMessageText("Пожалуйста, подождите...", {
              chat_id: chatId,
              message_id: format.message.message_id,
            });
            await bot.sendDocument(chatId, "./assets/Принципы ФГОС.pdf");
            await bot.sendDocument(chatId, "./assets/Качества выпускника.pdf");
            await bot.editMessageText(
              "_Вы можете поделиться плакатами с другими людьми, а также сохранить их на своё устройство или в Избранное._",
              {
                chat_id: chatId,
                message_id: format.message.message_id,
                parse_mode: "Markdown",
              },
            );
            return menu("post", chatId);
          }
          case "poster_png": {
            await bot.editMessageText("Пожалуйста, подождите...", {
              chat_id: chatId,
              message_id: format.message.message_id,
            });
            await bot.sendDocument(chatId, "./assets/Принципы ФГОС.png");
            await bot.sendDocument(chatId, "./assets/Качества выпускника.png");
            await bot.editMessageText(
              "_Вы можете поделиться плакатами с другими людьми, а также сохранить их на своё устройство или в Избранное._",
              {
                chat_id: chatId,
                message_id: format.message.message_id,
                parse_mode: "Markdown",
              },
            );
            return menu("post", chatId);
          }
        }
      });
    }
  }
});

bot.on("polling_error", (err) => {
  Sentry.captureException(err);
  console.log(err);
});

process.on("unhandledRejection", (error) => {
  Sentry.captureException(error);
  console.log("Error: " + error.message);
});

process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  console.log("Error: " + error.message);
});
