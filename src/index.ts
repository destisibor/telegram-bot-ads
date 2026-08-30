import { Telegraf, Context } from 'telegraf';
import * as dotenv from 'dotenv';
import * as http from 'http';

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

// Map to track active timeouts per group, preventing concurrency overrides
const activeCycles = new Map<number, NodeJS.Timeout>();

// Timing configuration (in milliseconds)
const DELETE_DELAY_MS = 30 * 60 * 1000; // 30 minutes before deletion
const POST_DELAY_MS = 1 * 60 * 1000;    // 1 minute delay after deletion before reposting

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
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;

    if (activeCycles.has(chatId)) {
        ctx.reply('⚠️ The automated ads are already running in this group!');
        return;
    }

    ctx.reply('✅ Auto-ads activated! The bot will post, delete the message after 30 minutes, wait 1 minute, and post again.');

    const runCycle = async () => {
        try {
            // 1. Post the ad
            const sentMessage = await ctx.telegram.sendMessage(chatId, adMessageText, { parse_mode: 'HTML' });

            // 2. Schedule the deletion 30 minutes from now
            const deletionTimeout = setTimeout(async () => {
                await ctx.telegram.deleteMessage(chatId, sentMessage.message_id).catch(() => {
                    console.error(`Could not delete message ${sentMessage.message_id} (it may have already been removed).`);
                });

                // 3. Schedule the NEXT post 1 minute after deletion
                const nextPostTimeout = setTimeout(() => {
                    runCycle();
                }, POST_DELAY_MS);

                // Update the tracker so /stop_ads works during the 1-minute gap
                activeCycles.set(chatId, nextPostTimeout);

            }, DELETE_DELAY_MS);

            // Track the initial deletion timeout
            activeCycles.set(chatId, deletionTimeout);

        } catch (error) {
            console.error('Error in the posting cycle:', error);
            activeCycles.delete(chatId);
        }
    };

    // Trigger the first post immediately
    runCycle();
});

// Stop the automated ad cycle
bot.command('stop_ads', (ctx: Context) => {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const timeout = activeCycles.get(chatId);

    if (timeout) {
        clearTimeout(timeout);
        activeCycles.delete(chatId);
        ctx.reply('🛑 Auto-ads have been successfully stopped.');
    } else {
        ctx.reply('There are no ads currently running in this group.');
    }
});

// Launch the bot
bot.launch().then(() => {
    console.log('🤖 Bot @Run_Node3_bot is up and running!');
});

// Enable graceful stop for standard Node.js termination signals
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));