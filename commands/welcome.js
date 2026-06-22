import { getGroupConfig, saveGroupConfig } from "../lib/database.js";

export default {
    name: 'welcome',
    aliases: [],
    category: 'admin',
    description: 'Mengatur fitur welcome di grup',
    usage: '!welcome [on|off|set] [teks]',
    groupOnly: true,
    adminOnly: true,

    async handler({ message, args, rawArgs, prefix }) {
        try {
            const chatId = message.chat;
            const sub = args[0]?.toLowerCase();
            const config = getGroupConfig(chatId);

            if (sub === "on") {
                config.welcome = true;
                saveGroupConfig(chatId, config);
                return message.reply("Fitur welcome diaktifkan!");

            } else if (sub === "off") {
                config.welcome = false;
                saveGroupConfig(chatId, config);
                return message.reply("Fitur welcome dinonaktifkan!");

            } else if (sub === "set") {
                // rawArgs removes the prefix and command name
                const welcomeText = rawArgs.replace(/^set\s*/i, "").trim();
                
                if (!welcomeText) {
                    return message.reply(`Gunakan perintah:\n${prefix}welcome set <teks selamat datang>\n\nContoh:\n${prefix}welcome set Selamat datang @user di grup @group!`);
                }

                config.welcome = true;
                config.welcomeText = welcomeText;
                saveGroupConfig(chatId, config);

                return message.reply(`Pesan selamat datang diperbarui dan fitur diaktifkan:\n\n${welcomeText}`);

            } else {
                return message.reply(`Penggunaan:\n${prefix}welcome on → Aktifkan welcome\n${prefix}welcome off → Nonaktifkan welcome\n${prefix}welcome set <teks> → Atur teks welcome\n\nKamu bisa menggunakan @user untuk tag member baru dan @group untuk nama grup.`);
            }

        } catch (error) {
            console.error('Welcome command error:', error);
            return message.reply(`Error: ${error.message || error}`);
        }
    }
};