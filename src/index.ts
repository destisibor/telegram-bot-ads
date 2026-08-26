import { Telegraf, Context } from 'telegraf';
import * as dotenv from 'dotenv';
import * as http from 'http'; // Imported native HTTP module for Render

// Load environment variables from the .env file
dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN must be provided in the .env file');
}

// Create a dummy web server so Render's Free Web Service doesn't crash
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running successfully!');
}).listen(process.env.PORT || 3000, () => {
    console.log('🌐 Dummy web server is listening for Render port checks');
});

const bot = new Telegraf(token);

// Store the interval so we can stop it later
let adInterval: NodeJS.Timeout | null = null;

// Timing configuration (in milliseconds)
const POST_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DELETE_DELAY_MS = 20 * 60 * 1000;  // 20 minutes

// The reusable ad message
const adMessageText = `📢 <b>YOUR CAPITAL DESERVES A PLAN — NOT JUST A PLACE TO SIT</b>
Join RunNode

Looking for an opportunity that gives you different entry points, different lease durations, and different earning structures?
Our latest product packages are now available, giving you the flexibility to select according to your available capital.

💎 <b>CHOOSE YOUR PACKAGE</b>

🔹 <b>L40S</b> — ₦3,000
⏱ 3 Days | Daily Payout: ₦1,495
💰 Listed Total Revenue: ₦4,501

🔹 <b>H100 PCIe</b> — ₦7,000
⏱ 14 Days | Daily Payout: ₦1,017
💰 Listed Total Revenue: ₦14,238

🔹 <b>MI300X</b> — ₦15,000
⏱ 10 Days | Daily Payout: ₦2,800
💰 Listed Total Revenue: ₦28,000

🔹 <b>H200 NVL</b> — ₦35,000
⏱ 20 Days | Daily Payout: ₦3,500
💰 Listed Total Revenue: ₦70,000

🔹 <b>B200</b> — ₦75,000
⏱ 35 Days | Daily Payout: ₦4,550
💰 Listed Total Revenue: ₦159,250

🔹 <b>H100 NVL</b> — ₦150,000
⏱ 40 Days | Daily Payout: ₦8,750
💰 Listed Total Revenue: ₦350,000

🚀 <b>THE CHOICE IS YOURS</b>
Start with the package that matches your financial capacity.
Different packages.
Different durations.
Different capital levels.

Find the package that works for your plan.`;

// Handle the /start command
bot.start((ctx: Context) => {
    const userName = ctx.from?.first_name || 'there';
    ctx.reply(`Welcome ${userName}! 🚀 Run_Node3_bot is online.\n\nUse /start_ads in a group to begin the automated posting cycle.`);
});

// Handle manual ad posting
bot.command('packages', (ctx: Context) => {
    ctx.reply(adMessageText, { parse_mode: 'HTML' });
});

// Start the automated ad cycle
bot.command('start_ads', (ctx: Context) => {
    if (!ctx.chat) {
        return;
    }

    const chatId = ctx.chat.id;

    if (adInterval) {
        ctx.reply('⚠️ The automated ads are already running in this group!');
        return;
    }

    ctx.reply('✅ Auto-ads activated! Posting every 10 minutes and deleting after 20 minutes.');

    // The function that posts the ad and schedules its deletion
    const postAndScheduleDeletion = async () => {
        try {
            // 1. Send the message
            const sentMessage = await ctx.telegram.sendMessage(chatId, adMessageText, { parse_mode: 'HTML' });

            // 2. Schedule the deletion 20 minutes from now
            setTimeout(() => {
                ctx.telegram.deleteMessage(chatId, sentMessage.message_id).catch(() => {
                    console.error(`Could not delete message ${sentMessage.message_id} (it may have already been removed).`);
                });
            }, DELETE_DELAY_MS);

        } catch (error) {
            console.error('Error in the posting cycle:', error);
        }
    };

    // Trigger the first post immediately
    postAndScheduleDeletion();

    // Set up the recurring 10-minute loop
    adInterval = setInterval(postAndScheduleDeletion, POST_INTERVAL_MS);
});

// Stop the automated ad cycle
bot.command('stop_ads', (ctx: Context) => {
    if (adInterval) {
        clearInterval(adInterval);
        adInterval = null;
        ctx.reply('🛑 Auto-ads have been successfully stopped.');
    } else {
        ctx.reply('There are no ads currently running.');
    }
});

// Launch the bot
bot.launch().then(() => {
    console.log('🤖 Bot @Run_Node3_bot is up and running!');
});

// Enable graceful stop for standard Node.js termination signals
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));