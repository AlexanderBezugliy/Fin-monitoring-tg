import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// Конфигурация из .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// Настройка авторизации Google Sheets
const serviceAccountAuth = new JWT({
    email: EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

// Главная клавиатура
const mainKeyboard = Markup.keyboard([
    ["📊 Мой отчет", "❓ Помощь"],
    ["📈 Статистика (текст)"],
]).resize();

// Функция для получения текущей даты в формате ДД.ММ.ГГГГ
const getFormattedDate = () => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

// Функция генерации отчета
const sendVisualReport = async (ctx) => {
    let waitMsg;
    try {
        waitMsg = await ctx.reply(
            "⏳ Собираю и рисую статистику за этот месяц...",
        );

        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();

        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
        const currentYear = String(now.getFullYear());

        const stats = {};
        let total = 0;

        rows.forEach((row) => {
            const rowDate = row.get("Дата");
            if (rowDate) {
                const [day, month, year] = rowDate.split(".");
                if (month === currentMonth && year === currentYear) {
                    const amount = parseFloat(row.get("Сумма"));
                    const category = row.get("Категория") || "Прочее";
                    const categoryLower =
                        category.charAt(0).toUpperCase() +
                        category.slice(1).toLowerCase();

                    if (!isNaN(amount)) {
                        stats[categoryLower] =
                            (stats[categoryLower] || 0) + amount;
                        total += amount;
                    }
                }
            }
        });

        if (total === 0) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitMsg.message_id,
                null,
                "📊 В этом месяце трат пока нет.",
            );
            return;
        }

        const labels = Object.keys(stats);
        const data = Object.values(stats);

        const chartConfig = {
            type: "pie",
            data: {
                labels: labels,
                datasets: [
                    {
                        data: data,
                        backgroundColor: [
                            "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", 
                            "#9966FF", "#FF9F40", "#8bc34a", "#ff5722", "#795548",
                        ],
                    },
                ],
            },
            options: {
                title: {
                    display: true,
                    text: `Итого за месяц: ${total} грн.`,
                    fontSize: 20,
                },
                plugins: {
                    datalabels: {
                        display: true,
                        color: "#fff",
                        font: { weight: "bold", size: 16 },
                    },
                },
            },
        };

        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id);
        } catch (err) {}

        await ctx.replyWithPhoto(chartUrl, {
            caption: `📊 Ваша статистика за текущий месяц\n💰 Итого: ${total} грн.`,
        });
    } catch (error) {
        console.error("Ошибка при создании отчета:", error);
        const errorText = "❌ Произошла ошибка при генерации отчета.";
        if (waitMsg) {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, errorText).catch(() => ctx.reply(errorText));
        } else {
            await ctx.reply(errorText);
        }
    }
};

// --- ОБРАБОТЧИКИ ---

bot.start(async (ctx) => {
    await ctx.reply(
        `Привет, ${ctx.from.first_name}! 👋\n\nЯ твой финансовый помощник.\n\n` +
        `📝 **Как записывать траты:**\nПросто напиши мне: \`Сумма Категория\`\nПример: \`500 продукты\`\n\n` +
        `Используй кнопки меню ниже для отчетов. 👇`,
        { parse_mode: "Markdown", ...mainKeyboard }
    );
});

bot.hears("📊 Мой отчет", sendVisualReport);
bot.command("report", sendVisualReport);

bot.hears("❓ Помощь", async (ctx) => {
    await ctx.reply(
        "📝 **Инструкция по использованию:**\n\n" +
        "Чтобы записать трату, отправь сообщение в формате:\n" +
        "`Сумма Категория`\n\n" +
        "Примеры:\n" +
        "• `100 кофе` — запишет 100 грн в категорию кофе.\n" +
        "• `1200 такси` — запишет 1200 грн в категорию такси.\n\n" +
        "📊 Кнопка **Мой отчет** пришлет график трат за текущий месяц.\n" +
        "📈 Кнопка **Статистика** пришлет текстовую сумму за месяц.",
        { parse_mode: "Markdown" }
    );
});

const sendTextStats = async (ctx) => {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();

        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
        const currentYear = String(now.getFullYear());

        let total = 0;
        rows.forEach((row) => {
            const rowDate = row.get("Дата");
            if (rowDate) {
                const [day, month, year] = rowDate.split(".");
                if (month === currentMonth && year === currentYear) {
                    const amount = parseFloat(row.get("Сумма"));
                    if (!isNaN(amount)) total += amount;
                }
            }
        });

        await ctx.reply(`📊 Траты за этот месяц: ${total} грн.`);
    } catch (error) {
        console.error("Ошибка при получении статистики:", error);
        await ctx.reply("❌ Не удалось получить статистику.");
    }
};

bot.hears("📈 Статистика (текст)", sendTextStats);
bot.command("stats", sendTextStats);

bot.on("text", async (ctx) => {
    const text = ctx.message.text;
    const regex = /^(\d+)\s+(.+)$/;
    const match = text.match(regex);

    if (match) {
        const amount = match[1];
        const category = match[2];
        const date = getFormattedDate();

        try {
            await doc.loadInfo();
            const sheet = doc.sheetsByIndex[0];
            await sheet.loadHeaderRow().catch(async () => {
                await sheet.setHeaderRow(["Дата", "Сумма", "Категория"]);
            });

            await sheet.addRow({ Дата: date, Сумма: amount, Категория: category });

            const replyMessage = await ctx.reply(`✅ Записано: ${amount} грн. на ${category}`);

            try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}

            setTimeout(async () => {
                try { await ctx.telegram.deleteMessage(ctx.chat.id, replyMessage.message_id); } catch (e) {}
            }, 3000);
        } catch (error) {
            console.error("Ошибка при записи в таблицу:", error);
            await ctx.reply("❌ Произошла ошибка при сохранении данных.");
        }
    } else {
        const errorMsg = await ctx.reply('Не понимаю тебя. Используй формат: "Сумма Категория" (например: 500 кофе).');
        try { await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}
        setTimeout(async () => {
            try { await ctx.telegram.deleteMessage(ctx.chat.id, errorMsg.message_id); } catch (e) {}
        }, 3000);
    }
});

// Экспорт обработчика для Vercel (ESM)
export default async function handler(req, res) {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Please send a POST request with Telegram Update');
        }
    } catch (error) {
        console.error('Ошибка вебхука:', error);
        res.status(500).send('Error');
    }
};
