import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { message, channelPost, editedMessage, editedChannelPost } from 'telegraf/filters';
import { v2 as TranslateV2 } from '@google-cloud/translate';
import * as dotenv from 'dotenv';
import * as http from 'http';

// Load environment variables
dotenv.config();

const token = process.env.BOT_TOKEN;
const googleProjectId = process.env.GOOGLE_PROJECT_ID;

if (!token) {
    throw new Error('BOT_TOKEN must be provided in the .env file');
}

// Parse credentials from an environment variable string on Render
let credentialsConfig: Record<string, unknown> | undefined = undefined;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
        credentialsConfig = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } catch (e) {
        console.error('Failed to parse GOOGLE_CREDENTIALS_JSON:', e);
    }
}

// Initialize Google Cloud Translation API with parsed credentials or fallback to default file path
const { Translate } = TranslateV2;
const translateClient = new Translate({
    projectId: googleProjectId,
    credentials: credentialsConfig
});

// --- Admin Configuration State ---
const translationConfig = {
    enabled: true,
    languages: {
        ar: { name: '🇸🇦 Arabic', enabled: true },
        fr: { name: '🇫🇷 French', enabled: true },
        hi: { name: '🇮🇳 Hindi', enabled: true },
        fa: { name: '🇮🇷 Persian/Farsi', enabled: true }
    },
    targetChatId: process.env.TARGET_CHAT_ID // Optional: Restrict live translations to a specific channel/group
};

// Map to track original message IDs to their translated message IDs for live edits
const translationMap = new Map<number, number>();

// --- Dummy Server for Render ---
const port = Number(process.env.PORT) || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running successfully!');
}).listen(port, '0.0.0.0', () => {
    console.log(`🌐 Dummy web server is listening on port ${port} for Render checks`);
});

const bot = new Telegraf(token);

// --- Existing Ad Bot Logic ---
const activeCycles = new Map<number, NodeJS.Timeout>();
const DELETE_DELAY_MS = 30 * 60 * 1000; // 30 minutes
const POST_DELAY_MS = 1 * 60 * 1000;    // 1 minute

// Safe chunks with the continuous 5-language inline format + the final choice text
const adMessages = [
    `https://r-node.xyz\nhttps://r-node.xyz\n🔹 <b>L40S</b> — 5.00 USDT⏱ 3 Days | Daily Payout: 2.17 USDT💰 Total Revenue: 6.51 USDT💎 <b>اختر باقتك</b>🔹 <b>L40S</b> — 5.00 USDT⏱ 3 أيام | العائد اليومي: 2.17 USDT💰 إجمالي الإيرادات: 6.51 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>L40S</b> — 5.00 USDT⏱ 3 jours | Paiement quotidien : 2.17 USDT💰 Revenu total : 6.51 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>L40S</b> — 5.00 USDT⏱ 3 दिन | दैनिक भुगतान: 2.17 USDT💰 कुल राजस्व: 6.51 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>L40S</b> — 5.00 USDT⏱ ۳ روز | پرداخت روزانه: 2.17 USDT💰 درآمد کل: 6.51 USDT`,

    `🔹 <b>H100 PCIe</b> — 10.00 USDT⏱ 7 Days | Daily Payout: 2.00 USDT💰 Total Revenue: 14.00 USDT💎 <b>اختر باقتك</b>🔹 <b>H100 PCIe</b> — 10.00 USDT⏱ 7 أيام | العائد اليومي: 2.00 USDT💰 إجمالي الإيرادات: 14.00 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>H100 PCIe</b> — 10.00 USDT⏱ 7 jours | Paiement quotidien : 2.00 USDT💰 Revenu total : 14.00 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>H100 PCIe</b> — 10.00 USDT⏱ 7 दिन | दैनिक भुगतान: 2.00 USDT💰 कुल राजस्व: 14.00 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>H100 PCIe</b> — 10.00 USDT⏱ ۷ روز | پرداخت روزانه: 2.00 USDT💰 درآمد کل: 14.00 USDT`,

    `🔹 <b>MI300X</b> — 15.00 USDT⏱ 10 Days | Daily Payout: 2.10 USDT💰 Total Revenue: 21.00 USDT💎 <b>اختر باقتك</b>🔹 <b>MI300X</b> — 15.00 USDT⏱ 10 أيام | العائد اليومي: 2.10 USDT💰 إجمالي الإيرادات: 21.00 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>MI300X</b> — 15.00 USDT⏱ 10 jours | Paiement quotidien : 2.10 USDT💰 Revenu total : 21.00 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>MI300X</b> — 15.00 USDT⏱ 10 दिन | दैनिक भुगतान: 2.10 USDT💰 कुल राजस्व: 21.00 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>MI300X</b> — 15.00 USDT⏱ ۱۰ روز | پرداخت روزانه: 2.10 USDT💰 درآمد کل: 21.00 USDT`,

    `🔹 <b>H200 NVL</b> — 25.00 USDT⏱ 20 Days | Daily Payout: 1.88 USDT💰 Total Revenue: 37.60 USDT💎 <b>اختر باقتك</b>🔹 <b>H200 NVL</b> — 25.00 USDT⏱ 20 يومًا | العائد اليومي: 1.88 USDT💰 إجمالي الإيرادات: 37.60 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>H200 NVL</b> — 25.00 USDT⏱ 20 jours | Paiement quotidien : 1.88 USDT💰 Revenu total : 37.60 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>H200 NVL</b> — 25.00 USDT⏱ 20 दिन | दैनिक भुगतान: 1.88 USDT💰 कुल राजस्व: 37.60 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>H200 NVL</b> — 25.00 USDT⏱ ۲۰ روز | پرداخت روزانه: 1.88 USDT💰 درآمد کل: 37.60 USDT`,

    `🔹 <b>B200</b> — 50.00 USDT⏱ 30 Days | Daily Payout: 2.58 USDT💰 Total Revenue: 77.40 USDT💎 <b>اختر باقتك</b>🔹 <b>B200</b> — 50.00 USDT⏱ 30 يومًا | العائد اليومي: 2.58 USDT💰 إجمالي الإيرادات: 77.40 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>B200</b> — 50.00 USDT⏱ 30 jours | Paiement quotidien : 2.58 USDT💰 Revenu total : 77.40 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>B200</b> — 50.00 USDT⏱ 30 दिन | दैनिक भुगतान: 2.58 USDT💰 कुल राजस्व: 77.40 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>B200</b> — 50.00 USDT⏱ ۳۰ روز | پرداخت روزانه: 2.58 USDT💰 درآمد کل: 77.40 USDT`,

    `🔹 <b>RTX PRO 6000 WK</b> — 70.00 USDT⏱ 25 Days | Expected Profit: 70.00 USDT💰 Total at Maturity: 140.00 USDT💎 <b>اختر باقتك</b>🔹 <b>RTX PRO 6000 WK</b> — 70.00 USDT⏱ 25 يومًا | الربح المتوقع: 70.00 USDT💰 الإجمالي عند الاستحقاق: 140.00 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>RTX PRO 6000 WK</b> — 70.00 USDT⏱ 25 jours | Profit attendu : 70.00 USDT💰 Total à l'échéance : 140.00 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>RTX PRO 6000 WK</b> — 70.00 USDT⏱ 25 दिन | अपेक्षित लाभ: 70.00 USDT💰 परिपक्वता पर कुल: 140.00 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>RTX PRO 6000 WK</b> — 70.00 USDT⏱ ۲۵ روز | سود مورد انتظار: 70.00 USDT💰 کل در سررسید: 140.00 USDT`,

    `🔹 <b>B300</b> — 35.00 USDT⏱ 7 Days | Expected Profit: 15.00 USDT💰 Total at Maturity: 50.00 USDT💎 <b>اختر باقتك</b>🔹 <b>B300</b> — 35.00 USDT⏱ 7 أيام | الربح المتوقع: 15.00 USDT💰 الإجمالي عند الاستحقاق: 50.00 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>B300</b> — 35.00 USDT⏱ 7 jours | Profit attendu : 15.00 USDT💰 Total à l'échéance : 50.00 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>B300</b> — 35.00 USDT⏱ 7 दिन | अपेक्षित लाभ: 15.00 USDT💰 परिपक्वता पर कुल: 50.00 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>B300</b> — 35.00 USDT⏱ ۷ روز | سود مورد انتظار: 15.00 USDT💰 کل در سررسید: 50.00 USDT`,

    `🔹 <b>RTX PRO 4500 SE</b> — 20.00 USDT⏱ 7 Days | Expected Profit: 8.00 USDT💰 Total at Maturity: 28.00 USDT💎 <b>اختر باقتك</b>🔹 <b>RTX PRO 4500 SE</b> — 20.00 USDT⏱ 7 أيام | الربح المتوقع: 8.00 USDT💰 الإجمالي عند الاستحقاق: 28.00 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>RTX PRO 4500 SE</b> — 20.00 USDT⏱ 7 jours | Profit attendu : 8.00 USDT💰 Total à l'échéance : 28.00 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>RTX PRO 4500 SE</b> — 20.00 USDT⏱ 7 दिन | अपेक्षित लाभ: 8.00 USDT💰 परिपक्वता पर कुल: 28.00 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>RTX PRO 4500 SE</b> — 20.00 USDT⏱ ۷ روز | سود مورد انتظار: 8.00 USDT💰 کل در سررسید: 28.00 USDT`,

    `🔹 <b>RTX A5000</b> — 13.00 USDT⏱ 7 Days | Expected Profit: 5.00 USDT💰 Total at Maturity: 18.00 USDT💎 <b>اختر باقتك</b>🔹 <b>RTX A5000</b> — 13.00 USDT⏱ 7 أيام | الربح المتوقع: 5.00 USDT💰 الإجمالي عند الاستحقاق: 18.00 USDT💎 <b>CHOISISSEZ VOTRE FORFAIT</b>🔹 <b>RTX A5000</b> — 13.00 USDT⏱ 7 jours | Profit attendu : 5.00 USDT💰 Total à l'échéance : 18.00 USDT💎 <b>अपना पैकेज चुनें</b>🔹 <b>RTX A5000</b> — 13.00 USDT⏱ 7 दिन | अपेक्षित लाभ: 5.00 USDT💰 परिपक्वता पर कुल: 18.00 USDT💎 <b>بسته خود را انتخاب کنید</b>🔹 <b>RTX A5000</b> — 13.00 USDT⏱ ۷ روز | سود مورد انتظار: 5.00 USDT💰 کل در سررسید: 18.00 USDT`,

    `🚀 <b>THE CHOICE IS YOURS</b>\nStart with the package that matches your financial capacity.\nDifferent packages.\nDifferent durations.\nDifferent capital levels.\n\nFind the package that works for your plan.\n\n🚀 <b>الخيار لك</b>\nابدأ بالباقة التي تتناسب مع قدرتك المالية.\nباقات مختلفة.\nمدد مختلفة.\nمستويات رأس مال مختلفة.\n\nابحث عن الباقة التي تناسب خطتك.\n\n🚀 <b>LE CHOIX VOUS APPARTIENT</b>\nCommencez par le forfait qui correspond à votre capacité financière.\nDifférents forfaits.\nDifférentes durées.\nDifférents niveaux de capital.\n\nTrouvez le forfait qui convient à votre plan.\n\n🚀 <b>चुनाव आपका है</b>\nउस पैकेज से शुरुआत करें जो आपकी वित्तीय क्षमता से मेल खाता हो।\nविभिन्न पैकेज।\nविभिन्न अवधियाँ।\nविभिन्न पूंजी स्तर।\n\nवह पैकेज खोजें जो आपकी योजना के लिए काम करे।\n\n🚀 <b>انتخاب با شماست</b>\nبا بسته‌ای شروع کنید که با ظرفیت مالی شما مطابقت دارد.\nبسته‌های مختلف.\nمدت زمان‌های مختلف.\nسطوح مختلف سرمایه.\n\nبسته‌ای را پیدا کنید که برای برنامه شما مناسب باشد.`
];

// Handles manual /packages command
bot.command('packages', async (ctx: Context) => {
    for (const msg of adMessages) {
        await ctx.reply(msg, { parse_mode: 'HTML' });
        await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay prevents Telegram spam limits
    }
});

// Handles the automated posting cycle
bot.command('start_ads', (ctx: Context) => {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;

    if (activeCycles.has(chatId)) {
        ctx.reply('⚠️ The automated ads are already running in this group!');
        return;
    }

    ctx.reply('✅ Auto-ads activated! The bot will post the packages sequentially, delete them after 30 minutes, wait 1 minute, and post again.');

    const runCycle = async () => {
        try {
            const sentMessageIds: number[] = [];

            for (const msgText of adMessages) {
                const sentMsg = await ctx.telegram.sendMessage(chatId, msgText, { parse_mode: 'HTML' });
                sentMessageIds.push(sentMsg.message_id);
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const deletionTimeout = setTimeout(async () => {
                for (const msgId of sentMessageIds) {
                    await ctx.telegram.deleteMessage(chatId, msgId).catch(() => { });
                }

                const nextPostTimeout = setTimeout(() => runCycle(), POST_DELAY_MS);
                activeCycles.set(chatId, nextPostTimeout);

            }, DELETE_DELAY_MS);

            activeCycles.set(chatId, deletionTimeout);
        } catch (error) {
            console.error('Error in posting cycle:', error);
            activeCycles.delete(chatId);
        }
    };
    runCycle();
});

// Stops the automated cycle
bot.command('stop_ads', (ctx: Context) => {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;
    const timeout = activeCycles.get(chatId);

    if (timeout) {
        clearTimeout(timeout);
        activeCycles.delete(chatId);
        ctx.reply('🛑 Auto-ads stopped.');
    } else {
        ctx.reply('There are no ads currently running in this group.');
    }
});

// --- Live Translation Engine Logic ---

async function translateContent(text: string, langCode: string): Promise<string> {
    try {
        const [translation] = await translateClient.translate(text, { to: langCode, format: 'html' });
        return translation;
    } catch (error) {
        console.error(`Translation failed for ${langCode}:`, error);
        return '';
    }
}

async function generateTranslationMessage(text: string): Promise<string> {
    let finalMessage = '';

    for (const [code, config] of Object.entries(translationConfig.languages)) {
        if (config.enabled) {
            const translatedText = await translateContent(text, code);
            if (translatedText) {
                finalMessage += `<b>${config.name}</b>\n${translatedText}\n\n`;
            }
        }
    }
    return finalMessage.trim();
}

// -------------------------------------------------------------------
// Shared handler for incoming (new) messages and photos. Registered
// once per filter below — passing an array to bot.on() is silently
// ignored by Telegraf, so each filter must be registered individually.
// -------------------------------------------------------------------
const handleNewMessage = async (ctx: Context) => {
    if (!translationConfig.enabled) return;

    let originalText = '';
    const msg = ctx.message || ctx.channelPost;

    if (!msg) return;

    // Extract standard text OR the photo caption
    if ('text' in msg && msg.text) originalText = msg.text;
    if ('caption' in msg && msg.caption) originalText = msg.caption;

    const originalMsgId = msg.message_id;

    if (!originalText || !originalMsgId) return;

    // PREVENT BOT LOOPS: Ignore all messages sent by any bot (including itself)
    if (ctx.from?.is_bot) return;

    // Restrict to specific chat if configured in .env
    if (translationConfig.targetChatId && ctx.chat && ctx.chat.id.toString() !== translationConfig.targetChatId) return;

    const translatedPayload = await generateTranslationMessage(originalText);

    if (translatedPayload) {
        try {
            // This will safely reply to the original message/photo with the translations
            const sentMsg = await ctx.reply(translatedPayload, {
                parse_mode: 'HTML',
                reply_to_message_id: originalMsgId
            });
            translationMap.set(originalMsgId, sentMsg.message_id);
        } catch (error) {
            console.error('Failed to send translation payload:', error);
        }
    }
};

bot.on(message('text'), handleNewMessage);
bot.on(message('photo'), handleNewMessage);
bot.on(channelPost('text'), handleNewMessage);
bot.on(channelPost('photo'), handleNewMessage);

// -------------------------------------------------------------------
// Shared handler for edited messages and photos. Registered once per
// filter below for the same reason as above.
// -------------------------------------------------------------------
const handleEditedMessage = async (ctx: Context) => {
    if (!translationConfig.enabled) return;

    let originalText = '';
    const msg = ctx.editedMessage || ctx.editedChannelPost;

    if (!msg) return;
    if (ctx.from?.is_bot) return;

    if ('text' in msg && msg.text) originalText = msg.text;
    if ('caption' in msg && msg.caption) originalText = msg.caption;

    const originalMsgId = msg.message_id;

    const translatedMsgId = translationMap.get(originalMsgId);

    if (translatedMsgId && originalText && ctx.chat) {
        const updatedTranslatedPayload = await generateTranslationMessage(originalText);

        if (updatedTranslatedPayload) {
            try {
                await ctx.telegram.editMessageText(ctx.chat.id, translatedMsgId, undefined, updatedTranslatedPayload, {
                    parse_mode: 'HTML'
                });
            } catch (error) {
                console.error(`Failed to update translation for msg ${originalMsgId}:`, error);
            }
        }
    }
};

bot.on(editedMessage('text'), handleEditedMessage);
bot.on(editedMessage('photo'), handleEditedMessage);
bot.on(editedChannelPost('text'), handleEditedMessage);
bot.on(editedChannelPost('photo'), handleEditedMessage);

// --- Admin Commands ---
bot.command('toggle_translation', (ctx) => {
    translationConfig.enabled = !translationConfig.enabled;
    ctx.reply(`Global translation is now ${translationConfig.enabled ? 'ON ✅' : 'OFF ❌'}`);
});

bot.command('status', (ctx) => {
    let statusText = `<b>Translation System Status:</b>\nEnabled: ${translationConfig.enabled ? '✅' : '❌'}\n\n`;
    for (const [code, config] of Object.entries(translationConfig.languages)) {
        statusText += `${config.name}: ${config.enabled ? '✅' : '❌'}\n`;
    }
    ctx.reply(statusText, { parse_mode: 'HTML' });
});

// --- Launch & Initialization ---
setTimeout(() => {
    bot.launch({ dropPendingUpdates: true }).then(() => {
        console.log('🤖 Bot @Run_Node3_bot with Multi-Translation is up and running!');
    }).catch((err) => {
        console.error('Critical error launching bot:', err);
    });
}, 10000);

process.once('SIGINT', () => {
    bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    process.exit(0);
});