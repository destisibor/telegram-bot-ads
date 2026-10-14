import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { message, channelPost, editedMessage, editedChannelPost } from 'telegraf/filters';
import { translate } from '@vitalets/google-translate-api';
import { HttpsProxyAgent } from 'https-proxy-agent'; // <-- FIXED: Using HTTPS agent
import * as dotenv from 'dotenv';
import express from 'express';

// Load environment variables
dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN must be provided in the .env file');
}

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

const bot = new Telegraf(token);

// --- Global Error Handler ---
// Prevents the bot from crashing on unhandled middleware errors
bot.catch((err: any, ctx: Context) => {
    console.error(`❌ Error for ${ctx.updateType}:`, err);
});

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

// =========================================
// SHARED AD CYCLE TRIGGER
//
// Extracted from the original /start_ads command handler so both the
// Telegram command and the HTTP /trigger-ads endpoint can start the
// ad cycle. Returns an object indicating whether the cycle was started
// or was already running.
//
// Uses bot.telegram.sendMessage / deleteMessage directly (rather than
// ctx.telegram) so it can be called outside of a command context.
// =========================================
async function triggerAdsCycle(chatId: number): Promise<{ started: boolean; reason?: string }> {
    if (activeCycles.has(chatId)) {
        return { started: false, reason: 'already_running' };
    }

    const runCycle = async () => {
        try {
            const sentMessageIds: number[] = [];

            for (const msgText of adMessages) {
                const sentMsg = await bot.telegram.sendMessage(chatId, msgText, { parse_mode: 'HTML' });
                sentMessageIds.push(sentMsg.message_id);
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const deletionTimeout = setTimeout(async () => {
                for (const msgId of sentMessageIds) {
                    await bot.telegram.deleteMessage(chatId, msgId).catch(() => { });
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
    return { started: true };
}

// Handles manual /packages command
bot.command('packages', async (ctx: Context) => {
    for (const msg of adMessages) {
        await ctx.reply(msg, { parse_mode: 'HTML' });
        await new Promise(resolve => setTimeout(resolve, 300));
    }
});

// Handles the automated posting cycle (Telegram command path)
bot.command('start_ads', async (ctx: Context) => {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;

    const result = await triggerAdsCycle(chatId);

    if (!result.started) {
        await ctx.reply('⚠️ The automated ads are already running in this group!');
        return;
    }

    await ctx.reply('✅ Auto-ads activated! The bot will post the packages sequentially, delete them after 30 minutes, wait 1 minute, and post again.');
});

// Stops the automated cycle
bot.command('stop_ads', async (ctx: Context) => {
    if (!ctx.chat) return;
    const chatId = ctx.chat.id;
    const timeout = activeCycles.get(chatId);

    if (timeout) {
        clearTimeout(timeout);
        activeCycles.delete(chatId);
        await ctx.reply('🛑 Auto-ads stopped.');
    } else {
        await ctx.reply('There are no ads currently running in this group.');
    }
});

// --- Live Translation Engine Logic ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- FIXED: Proxy setup using HttpsProxyAgent ---
const proxyUrl = process.env.PROXY_URL;
const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

async function translateContent(text: string, langCode: string): Promise<string> {
    try {
        const translatePromise = translate(text, {
            to: langCode,
            fetchOptions: { agent } // Injects the proxy into the fetch request
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Translation API timeout')), 10000)
        );

        const result = await Promise.race([translatePromise, timeoutPromise]);
        return result.text;
    } catch (error) {
        console.error(`Translation failed for ${langCode}:`, (error as Error).message);
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
            await delay(1500);
        }
    }
    return finalMessage.trim();
}

const handleNewMessage = async (ctx: Context) => {
    if (!translationConfig.enabled) return;

    let originalText = '';
    const msg = ctx.message || ctx.channelPost;
    if (!msg) return;

    if ('text' in msg && msg.text) originalText = msg.text;
    if ('caption' in msg && msg.caption) originalText = msg.caption;

    const originalMsgId = msg.message_id;
    if (!originalText || !originalMsgId) return;
    if (ctx.from?.is_bot && ctx.from.username !== 'GroupAnonymousBot' && ctx.from.username !== 'Channel_Bot') return;
    if (translationConfig.targetChatId && ctx.chat && ctx.chat.id.toString() !== translationConfig.targetChatId) return;

    const translatedPayload = await generateTranslationMessage(originalText);

    if (translatedPayload) {
        try {
            const sentMsg = await ctx.reply(translatedPayload, {
                parse_mode: 'HTML',
                reply_parameters: { message_id: originalMsgId }
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

// =========================================
// RENDER WEBHOOK + HTTP TRIGGER LAUNCH LOGIC
//
// Replaces the previous bot.launch({ webhook }) setup with an
// Express server that:
//
//   • Mounts the Telegraf webhook at /webhook — this is where
//     Telegram delivers updates (messages, commands, channel posts,
//     etc.). Same behaviour as before from the bot's perspective.
//
//   • Exposes POST /trigger-ads — a plain HTTP endpoint the cron
//     job can hit directly. Requires the x-api-key header to match
//     the ADS_TRIGGER_API_KEY env var, so nobody else can spam ads
//     into your group.
//
//   • Exposes GET /health — a trivial 200 OK for uptime monitors
//     that just want to keep the container warm without triggering
//     ads. No auth required.
//
// ENV VARS THIS SECTION NEEDS:
//   • RENDER_EXTERNAL_URL  (already set by Render — e.g.
//                           https://telegram-bot-ads-fk4q.onrender.com)
//   • PORT                 (already set by Render)
//   • WEBHOOK_SECRET       (optional — passed to Telegram as the
//                           webhook secret_token; Telegraf verifies
//                           it on every incoming webhook call)
//   • ADS_TRIGGER_API_KEY  (NEW — a long random string. Used to
//                           authenticate the /trigger-ads endpoint)
//   • ADS_TARGET_CHAT_ID   (NEW — the group/channel where ads
//                           should be posted. Example: -1003955992205)
// =========================================

const PORT = Number(process.env.PORT) || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
const ADS_TRIGGER_API_KEY = process.env.ADS_TRIGGER_API_KEY;

if (RENDER_URL) {
    // ---- Webhook mode (production, on Render) ----

    const app = express();
    app.use(express.json());

    // ---- Telegram webhook route ----
    //
    // bot.webhookCallback() returns an Express-compatible middleware
    // that verifies the secret_token (if WEBHOOK_SECRET is set) and
    // dispatches updates into Telegraf's middleware chain.
    const webhookPath = '/webhook';
    const webhookMiddleware = bot.webhookCallback(webhookPath, {
        secretToken: process.env.WEBHOOK_SECRET
    });
    app.use(webhookMiddleware);

    // ---- Cron-triggered ad endpoint ----
    //
    // Accepts POST with header  x-api-key: <ADS_TRIGGER_API_KEY>.
    // Body (optional): { "chatId": -100... } to override the
    // default chat from ADS_TARGET_CHAT_ID.
    //
    // Returns:
    //   200 { success: true,  chatId, message }   — cycle started
    //   409 { success: false, reason, chatId }    — already running
    //   400 { error }                             — missing chat id
    //   403 { error }                             — bad/missing API key
    app.post('/trigger-ads', async (req, res) => {
        const providedKey = req.headers['x-api-key'];
        if (!ADS_TRIGGER_API_KEY || providedKey !== ADS_TRIGGER_API_KEY) {
            return res.status(403).json({ error: 'Forbidden — invalid or missing x-api-key' });
        }

        const chatId = Number((req.body && req.body.chatId) || process.env.ADS_TARGET_CHAT_ID);
        if (!chatId || !Number.isFinite(chatId)) {
            return res.status(400).json({
                error: 'Missing chatId. Provide it in the body or set ADS_TARGET_CHAT_ID env var.'
            });
        }

        const result = await triggerAdsCycle(chatId);

        if (!result.started) {
            return res.status(409).json({ success: false, reason: result.reason, chatId });
        }
        return res.json({ success: true, chatId, message: 'Ad cycle started.' });
    });

    // ---- Health check (no auth) ----
    //
    // Useful if you'd rather have the cron job just keep the container
    // warm without triggering ads. Not required — /trigger-ads also
    // wakes the container.
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });

    // ---- Register the webhook with Telegram and start listening ----
    app.listen(PORT, async () => {
        console.log(`🚀 Ads bot running on Render (Port ${PORT})`);
        console.log(`   Webhook endpoint: ${RENDER_URL}${webhookPath}`);
        console.log(`   Cron trigger:     ${RENDER_URL}/trigger-ads`);
        console.log(`   Health check:     ${RENDER_URL}/health`);

        try {
            await bot.telegram.setWebhook(`${RENDER_URL}${webhookPath}`, {
                secret_token: process.env.WEBHOOK_SECRET
            });
            console.log('✅ Telegram webhook registered.');
        } catch (err) {
            console.error('❌ Failed to register Telegram webhook:', err);
        }
    });
} else {
    // ---- Local polling mode (development) ----

    bot.launch({ dropPendingUpdates: true }).then(() => {
        console.log('🤖 Bot is running in Local Polling mode');
    }).catch((err) => {
        console.error('Critical error launching Polling:', err);
    });
}

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });