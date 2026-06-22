/**
 * Register — User registration command.
 *
 * Scalable design: stores basic metadata now, extensible via meta bag
 * for future features (XP, level, bio, etc.)
 */

import { registerUser, unregisterUser, isRegistered, getUser } from "../lib/database.js";

export default {
    name: "register",
    aliases: ["reg", "daftar"],
    category: "general",
    description: "Mendaftarkan diri ke database bot.",
    usage: "!register | !unregister",

    async handler({ message, sender, pushname, prefix }) {
        try {
            const text = message.text || "";

            // ── !unregister ─────────────────────────────────────────
            if (text.match(/^[!.#/\-](unreg(ister)?)/i)) {
                if (!isRegistered(sender)) {
                    return message.reply("❌ Kamu belum terdaftar.");
                }

                unregisterUser(sender);
                return message.reply("✅ Registrasi kamu telah dihapus dari database bot.");
            }

            // ── !register ───────────────────────────────────────────
            if (isRegistered(sender)) {
                const user = getUser(sender);
                const regDate = user.registeredAt
                    ? new Date(user.registeredAt).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                    })
                    : "Tidak diketahui";

                return message.reply(
                    `⚠️ Kamu sudah terdaftar!\n\n` +
                    `👤 Nama: ${user.name || "Tidak diketahui"}\n` +
                    `📅 Terdaftar sejak: ${regDate}\n\n` +
                    `_Gunakan ${prefix}unregister untuk menghapus registrasi._`
                );
            }

            const user = registerUser(sender, pushname);
            const regDate = new Date(user.registeredAt).toLocaleDateString("id-ID", {
                day: "numeric", month: "long", year: "numeric",
            });

            return message.reply(
                `✅ *REGISTRASI BERHASIL*\n\n` +
                `👤 Nama: ${pushname || "Tidak diketahui"}\n` +
                `📅 Tanggal: ${regDate}\n\n` +
                `Selamat! Kamu sekarang terdaftar di database bot. ` +
                `Ketik *${prefix}profile* untuk melihat profil kamu.`
            );

        } catch (error) {
            console.error("[REGISTER CMD]", error);
            message.reply("Terjadi kesalahan saat memproses registrasi.");
        }
    },
};
