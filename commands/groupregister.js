/**
 * Group Register — Admin registers the group in the bot's database.
 */

import { registerGroup, unregisterGroup, getGroupConfig } from "../lib/database.js";

export default {
    name: "gregister",
    aliases: ["groupregister", "gregreg", "gdaftar"],
    category: "admin",
    description: "Mendaftarkan grup ke database bot.",
    usage: "!gregister | !gunregister",
    groupOnly: true,
    adminOnly: true,

    async handler({ message, sender, prefix }) {
        try {
            const text = message.text || "";
            const chatId = message.chat;

            // ── Unregister ──────────────────────────────────────────
            if (text.match(/^[!.#/\-]g(roup)?unreg(ister)?/i)) {
                const config = getGroupConfig(chatId);
                if (!config.registered) {
                    return message.reply("❌ Grup ini belum terdaftar.");
                }

                unregisterGroup(chatId);
                return message.reply("✅ Registrasi grup telah dihapus dari database bot.");
            }

            // ── Register ────────────────────────────────────────────
            const config = getGroupConfig(chatId);
            if (config.registered) {
                const regDate = config.registeredAt
                    ? new Date(config.registeredAt).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                    })
                    : "Tidak diketahui";
                const senderBaseId = (config.registeredBy || "").split("@")[0];

                return message.reply(
                    `⚠️ Grup ini sudah terdaftar!\n\n` +
                    `📅 Terdaftar sejak: ${regDate}\n` +
                    `📝 Didaftarkan oleh: @${senderBaseId}\n\n` +
                    `_Gunakan ${prefix}gunregister untuk menghapus registrasi._`
                );
            }

            registerGroup(chatId, sender);

            return message.reply(
                `✅ *REGISTRASI GRUP BERHASIL*\n\n` +
                `Grup ini sekarang terdaftar di database bot.\n` +
                `Ketik *${prefix}groupprofile* untuk melihat info grup.`
            );

        } catch (error) {
            console.error("[GREGISTER CMD]", error);
            message.reply("Terjadi kesalahan saat memproses registrasi grup.");
        }
    },
};
