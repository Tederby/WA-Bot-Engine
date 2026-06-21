import { getAllCommands } from "./_registry.js";
import setting from "../setting.js";

/** Display name for each category. */
const CATEGORY_LABELS = {
    utility: "🔧 Utility",
    media: "🖼️ Media",
    download: "📥 Download",
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
    async handler({ message, prefix }) {
        const commands = getAllCommands();

        // Group commands by category
        const groups = new Map();
        for (const cmd of commands) {
            const cat = cmd.category || "other";
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(cmd);
        }

        let menuText = `*👾 ${setting.name || "Bot Menu"} 👾*\n`;
        menuText += `_Prefix: ${setting.prefixes.join(" ")}_\n\n`;

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
            menuText += `━━ ${label} ━━\n`;

            for (const cmd of cmds) {
                menuText += `*${prefix}${cmd.name}*`;
                if (cmd.aliases && cmd.aliases.length > 0) {
                    menuText += ` _(${cmd.aliases.join(", ")})_`;
                }
                menuText += `\n`;
                if (cmd.description) {
                    menuText += `┗ ${cmd.description}\n`;
                }
            }
            menuText += `\n`;
        }

        menuText += `*Powered by Baileys & Node.js*`;

        await message.reply(menuText.trim());
    }
};
