import { getGroupConfig, saveGroupConfig } from "../lib/database.js";

export default {
    name: "autoreply",
    aliases: ["ar", "autorespond"],
    category: "group",
    description: "Mengatur balasan otomatis khusus untuk grup ini (Admin Only).",
    usage: "!autoreply kata kunci | teks balasan\n!autoreply --list\n!autoreply --del kata kunci",
    groupOnly: true,
    adminOnly: true,
    async handler({ message, rawArgs, prefix }) {
        const textArgs = (rawArgs || "").trim();
        const chat = message.chat;
        const config = getGroupConfig(chat);

        if (!textArgs) {
            return await message.reply(`❌ Format salah. Gunakan:\n1. Tambah: \`${prefix}autoreply kata kunci | teks balasan\`\n2. Hapus: \`${prefix}autoreply --del kata kunci\`\n3. Lihat daftar: \`${prefix}autoreply --list\``);
        }

        if (textArgs.toLowerCase() === "--list") {
            const replies = config.autoReplies || {};
            const keys = Object.keys(replies);
            
            if (keys.length === 0) {
                return await message.reply("Belum ada auto-reply yang disetel di grup ini.");
            }
            
            let listMsg = "📝 *Daftar Auto-Reply Grup Ini:*\n\n";
            keys.forEach((key, index) => {
                listMsg += `${index + 1}. *Trigger:* ${key}\n   *Balasan:* ${replies[key].text}\n\n`;
            });
            
            return await message.reply(listMsg.trim());
        }

        if (textArgs.toLowerCase().startsWith("--del ")) {
            const triggerToDelete = textArgs.slice(6).trim().toLowerCase();
            
            if (!triggerToDelete) {
                return await message.reply(`❌ Masukkan kata kunci yang ingin dihapus. Contoh: \`${prefix}autoreply --del halo\``);
            }

            const replies = config.autoReplies || {};
            let deleted = false;
            
            // Perlu case-insensitive matching untuk menghapus
            for (const key of Object.keys(replies)) {
                if (key.toLowerCase() === triggerToDelete) {
                    delete replies[key];
                    deleted = true;
                    break;
                }
            }

            if (deleted) {
                config.autoReplies = replies;
                saveGroupConfig(chat, config);
                return await message.reply(`✅ Berhasil menghapus auto-reply untuk kata kunci: *${triggerToDelete}*`);
            } else {
                return await message.reply(`❌ Kata kunci *${triggerToDelete}* tidak ditemukan di daftar auto-reply.`);
            }
        }

        // Add auto reply (e.g. "halo | halo juga")
        const splitArgs = textArgs.split("|");
        if (splitArgs.length < 2) {
            return await message.reply(`❌ Format salah. Gunakan tanda *|* (pipa) untuk memisahkan kata kunci dan balasan.\nContoh: \`${prefix}autoreply Halo | Halo juga @Tederby\``);
        }

        const trigger = splitArgs[0].trim();
        const responseText = splitArgs.slice(1).join("|").trim(); // Gabungkan sisa jika ada "|" di teks balasan

        if (!trigger || !responseText) {
            return await message.reply("❌ Kata kunci dan teks balasan tidak boleh kosong.");
        }

        // Ambil mention dari pesan
        const mentions = message.mentionedJid || [];

        if (!config.autoReplies) config.autoReplies = {};
        
        // Cek jika sudah ada dengan key yang sama tapi case berbeda, hapus dulu biar tidak dobel
        for (const key of Object.keys(config.autoReplies)) {
            if (key.toLowerCase() === trigger.toLowerCase()) {
                delete config.autoReplies[key];
            }
        }

        config.autoReplies[trigger] = {
            text: responseText,
            mentions: mentions
        };

        saveGroupConfig(chat, config);

        await message.reply(`✅ Berhasil menambahkan auto-reply!\n\n*Trigger:* ${trigger}\n*Balasan:* ${responseText}`);
    }
};
