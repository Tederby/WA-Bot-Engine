import { getAllCommands } from "./_registry.js";
import setting from "../setting.js";

/** Display name for each category. */
const CATEGORY_LABELS = {
    general: "👤 General",
    utility: "🔧 Utility",
    media: "🖼️ Media",
    download: "📥 Download",
    search: "🔎 Search",
    anime: "🎌 Anime",
    admin: "🔑 Admin",
    owner: "👑 Owner"
};

/** Fallback label for commands without a category. */
const DEFAULT_CATEGORY = "📦 Lainnya";

export default {
    name: "menu",
    aliases: ["help", "list"],
    category: "utility",
    description: "Menampilkan semua daftar perintah bot",
    usage: "!menu",
    async handler({ message, prefix, sock }) {
        const commands = getAllCommands();

        // Group commands by category
        const groups = new Map();
        for (const cmd of commands) {
            const cat = cmd.category || "other";
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(cmd);
        }

        const formatUptime = (seconds) => {
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
        };

        const uptimeStr = formatUptime(process.uptime());
        let menuText = `╭━━━〔 👾 ${setting.name || "Bot Menu"} 👾 〕━━━\n`;
        menuText += `┃ 💻 Prefix : [ ${setting.prefixes.join(" / ")} ]\n`;
        menuText += `┃ ⏱️ Uptime : ${uptimeStr}\n`;
        menuText += `┃ ⚠️ Menu akan timeout dalam 1 menit\n`;
        menuText += `╰━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Sort categories by CATEGORY_LABELS order, unknowns at end
        const orderedKeys = [...Object.keys(CATEGORY_LABELS)];
        const allKeys = [...groups.keys()].sort((a, b) => {
            const ai = orderedKeys.indexOf(a);
            const bi = orderedKeys.indexOf(b);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        for (const cat of allKeys) {
            const label = CATEGORY_LABELS[cat] || DEFAULT_CATEGORY;
            const cmds = groups.get(cat);
            menuText += `╭───「 ${label} 」\n`;

            for (const cmd of cmds) {
                let cmdNames = [`*${cmd.name}*`];
                if (cmd.aliases && cmd.aliases.length > 0) {
                    cmdNames.push(...cmd.aliases.map(a => `*${a}*`));
                }
                menuText += `│ ⋄ ${cmdNames.join(" / ")}\n`;
                if (cmd.description) {
                    menuText += `│   └ ${cmd.description}\n`;
                } else {
                    menuText += `│   └ (No description)\n`;
                }
            }
            menuText += `╰──────────────\n\n`;
        }

        menuText += `⚙️ _Powered by Baileys & Node.js_`;

        const sentMsg = await sock.sendMessage(message.chat, { text: menuText.trim() }, { quoted: message });

        setTimeout(async () => {
            try {
                await sock.sendMessage(message.chat, { text: "❌ *Command timeout*", edit: sentMsg.key });
            } catch (err) {
                console.error("[MENU] Gagal edit timeout:", err.message);
            }
        }, 60000);
    }
};
