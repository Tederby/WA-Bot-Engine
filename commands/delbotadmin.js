import { jidNormalizedUser } from "baileys";
import { setBotAdmin, resolveUserId, resolveToLid } from "../lib/database.js";

export default {
    name: "delbotadmin",
    aliases: ["demote-bot"],
    category: "system",
    description: "Mencabut jabatan seseorang dari Bot Admin (System Owner Only)",
    usage: "!delbotadmin @user",
    ownerOnly: true,

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
                return message.reply(`Tag, reply, atau masukkan nomor user yang ingin dicabut jabatannya.\nContoh: \`${prefix}delbotadmin @user\``);
            }

            // Resolve LID → PN untuk konsistensi
            const normalizedTarget = resolveUserId(jidNormalizedUser(target));
            const targetBaseId = normalizedTarget.split("@")[0];

            // Demote di kedua key (PN dan LID) untuk bersihkan data lama
            setBotAdmin(normalizedTarget, false);
            const lidVariant = resolveToLid(normalizedTarget);
            if (lidVariant) setBotAdmin(lidVariant, false);

            return sock.sendMessage(
                message.chat,
                {
                    text: `✅ Jabatan *Bot Admin* untuk @${targetBaseId} telah dicabut.`,
                    mentions: [normalizedTarget],
                },
                { quoted: message }
            );
        } catch (error) {
            console.error("[DELBOTADMIN CMD]", error);
            message.reply("❌ Terjadi kesalahan saat mencabut jabatan Bot Admin.");
        }
    }
};
