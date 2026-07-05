import { getAllCommands, registerReplyHandler, deleteReplyHandler } from "./_registry.js";
import setting from "../setting.js";

/** Display name for each category. */
const CATEGORY_LABELS = {
    general: "🌟 General",
    group: "🛡️ Group",
    download: "📥 Downloader",
    media: "🎨 Media",
    anime: "🌸 Anime",
    search: "🔍 Search",
    tools: "🛠️ Tools",
    botadmin: "🛡️ Bot Admin",
    system: "💻 System",
    owner: "👑 Owner"
};

/** Fallback label for commands without a category. */
const DEFAULT_CATEGORY = "📦 Lainnya";

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(" ");
}

function getGroupedCommands() {
    const commands = getAllCommands();
    const groups = new Map();
    for (const cmd of commands) {
        const cat = cmd.category || "other";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(cmd);
    }
    return groups;
}

function getOrderedCategories(groups) {
    const orderedKeys = [...Object.keys(CATEGORY_LABELS)];
    return [...groups.keys()].sort((a, b) => {
        const ai = orderedKeys.indexOf(a);
        const bi = orderedKeys.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

function getHeader(timeoutSec) {
    let text = `╭━━━〔 👾 ${setting.name || "Bot Menu"} 👾 〕━━━\n`;
    text += `┃ 💻 Prefix : [ ${setting.prefixes.join(" / ")} ]\n`;
    text += `┃ ⏱️ Uptime : ${formatUptime(process.uptime())}\n`;
    if (timeoutSec > 0) {
        text += `┃ ⚠️ Menu akan timeout dalam ${timeoutSec} detik\n`;
    }
    text += `╰━━━━━━━━━━━━━━━━━━━━\n\n`;
    return text;
}

function generateCategoryList() {
    const groups = getGroupedCommands();
    const allKeys = getOrderedCategories(groups);

    let text = getHeader(90);
    text += `╭───「 📂 Kategori Menu 」\n`;
    
    for (const cat of allKeys) {
        const label = CATEGORY_LABELS[cat] || DEFAULT_CATEGORY;
        const total = groups.get(cat).length;
        text += `│ ⋄ *${cat}* (${total} cmd)\n`;
    }
    text += `╰──────────────\n\n`;
    text += `💡 _Balas pesan ini dengan nama kategori (misal: 'anime' atau 'tools') untuk melihat daftar perintahnya._\n`;
    text += `_Atau ketik \`!menu all\` untuk melihat semua command._`;

    return text.trim();
}

function generateCategoryCommands(category) {
    const groups = getGroupedCommands();
    let actualCategory = null;
    for (const key of groups.keys()) {
        if (key.toLowerCase() === category.toLowerCase()) {
            actualCategory = key;
            break;
        }
    }

    if (!actualCategory) return null;

    let text = getHeader(60);
    const label = CATEGORY_LABELS[actualCategory] || DEFAULT_CATEGORY;
    const cmds = groups.get(actualCategory);

    text += `╭───「 ${label} 」\n`;
    for (const cmd of cmds) {
        let cmdNames = [`*${cmd.name}*`];
        if (cmd.aliases && cmd.aliases.length > 0) {
            cmdNames.push(...cmd.aliases.map(a => `*${a}*`));
        }
        text += `│ ⋄ ${cmdNames.join(" / ")}\n`;
        if (cmd.description) {
            text += `│   └ ${cmd.description}\n`;
        } else {
            text += `│   └ (No description)\n`;
        }
    }
    text += `╰──────────────\n\n`;
    text += `⚙️ _Powered by Baileys & Node.js_`;

    return text.trim();
}

function generateAllCommands() {
    const groups = getGroupedCommands();
    const allKeys = getOrderedCategories(groups);

    let text = getHeader(60);
    for (const cat of allKeys) {
        const label = CATEGORY_LABELS[cat] || DEFAULT_CATEGORY;
        const cmds = groups.get(cat);
        text += `╭───「 ${label} 」\n`;

        for (const cmd of cmds) {
            let cmdNames = [`*${cmd.name}*`];
            if (cmd.aliases && cmd.aliases.length > 0) {
                cmdNames.push(...cmd.aliases.map(a => `*${a}*`));
            }
            text += `│ ⋄ ${cmdNames.join(" / ")}\n`;
            if (cmd.description) {
                text += `│   └ ${cmd.description}\n`;
            } else {
                text += `│   └ (No description)\n`;
            }
        }
        text += `╰──────────────\n\n`;
    }
    text += `⚙️ _Powered by Baileys & Node.js_`;

    return text.trim();
}

export default {
    name: "menu",
    aliases: ["help", "list"],
    category: "general",
    description: "Menampilkan daftar perintah bot secara interaktif",
    usage: "!menu [all/nama kategori]",
    async handler({ message, args, sock, sender }) {
        let menuText = "";
        let isAll = false;
        let isSpecific = false;
        let timeoutSec = 60;

        if (args.length > 0) {
            const input = args.join(" ").toLowerCase().trim();
            if (input === "all") {
                menuText = generateAllCommands();
                isAll = true;
            } else {
                menuText = generateCategoryCommands(input);
                if (!menuText) {
                    await message.reply(`❌ Kategori *${input}* tidak ditemukan.\nKetik \`!menu\` untuk melihat daftar kategori.`);
                    return;
                }
                isSpecific = true;
            }
        } else {
            menuText = generateCategoryList();
            timeoutSec = 90;
        }

        const sentMsg = await sock.sendMessage(message.chat, { text: menuText }, { quoted: message });

        const timeoutId = setTimeout(async () => {
            try {
                await sock.sendMessage(message.chat, { text: "❌ *Command timeout*", edit: sentMsg.key });
                deleteReplyHandler(sentMsg.key.id);
            } catch (err) {
                console.error("[MENU] Gagal edit timeout:", err.message);
            }
        }, timeoutSec * 1000);

        if (!isAll && !isSpecific) {
            registerReplyHandler(sentMsg.key.id, replyHandler, {
                userId: sender,
                messageKey: sentMsg.key,
                timeoutId,
                commandName: "menu"
            });
        }
    }
};

async function replyHandler({ message, sock, state }) {
    const text = (message.text || "").toLowerCase().trim();
    const { userId, messageKey, timeoutId } = state;

    const newMenuText = generateCategoryCommands(text);
    
    if (!newMenuText) {
        await message.reply(`❌ Kategori *${text}* tidak valid.\nSilakan balas dengan nama kategori yang benar (contoh: 'anime').`);
        return;
    }

    if (timeoutId) clearTimeout(timeoutId);
    
    deleteReplyHandler(messageKey.id);

    await sock.sendMessage(message.chat, { text: newMenuText, edit: messageKey });

    const newTimeoutId = setTimeout(async () => {
        try {
            await sock.sendMessage(message.chat, { text: "❌ *Command timeout*", edit: messageKey });
        } catch (err) {
            // Message too old or already edited — ignore
        }
    }, 60000);
}
