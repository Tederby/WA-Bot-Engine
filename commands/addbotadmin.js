import { jidNormalizedUser } from "baileys";
import { setBotAdmin, resolveUserId } from "../lib/database.js";

export default {
    name: "addbotadmin",
    aliases: ["promote-bot"],
    category: "system",
    description: "Mengangkat seseorang menjadi Bot Admin (System Owner Only)",
    usage: "!addbotadmin @user",
    ownerOnly: true, // HANYA hardcoded owner yang bisa eksekusi

    async handler({ message, sock, args, sender, prefix }) {
        try {
            let target = null;
            if (message.mentionedJid && message.mentionedJid.length > 0) {
                target = message.mentionedJid[0];
            } else if (message.quoted) {
                target = message.quoted.sender || message.quoted.participant;
            } else if (args[0]) {
                const num = args[0].replace(/[^0-9]/g, "");
                if (num) target = num + "@s.whatsapp.net";
            }

            if (!target) {
                return message.reply(`Tag, reply, atau masukkan nomor user yang ingin diangkat menjadi Bot Admin.\nContoh: \`${prefix}addbotadmin @user\``);
            }

            // Resolve LID → PN agar bot admin tersimpan dengan key PN yang konsisten
            const normalizedTarget = resolveUserId(jidNormalizedUser(target));
            const targetBaseId = normalizedTarget.split("@")[0];

            setBotAdmin(normalizedTarget, true);

            return sock.sendMessage(
                message.chat,
                {
                    text: `✅ @${targetBaseId} telah diangkat menjadi *Bot Admin*.\nMereka sekarang memiliki akses ke command moderasi bot (seperti ban, broadcast, dll).`,
                    mentions: [normalizedTarget],
                },
                { quoted: message }
            );
        } catch (error) {
            console.error("[ADDBOTADMIN CMD]", error);
            message.reply("❌ Terjadi kesalahan saat mengangkat Bot Admin.");
        }
    }
};
