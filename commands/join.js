export default {
    name: "join",
    aliases: ["joingc"],
    category: "owner",
    description: "Menggabungkan bot ke dalam grup menggunakan link invite.",
    usage: "!join <link grup>",

    async handler({ message, sock, args, isOwner }) {
        try {
            if (!isOwner) {
                return message.reply("Perintah ini hanya bisa digunakan oleh owner bot.");
            }

            const link = args[0];
            if (!link) {
                return message.reply("Harap masukkan link grup WhatsApp.\nContoh: *!join https://chat.whatsapp.com/ABCD1234EFGH5678*");
            }

            // Regex untuk mendeteksi link invite grup wa
            const urlRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i;
            const match = link.match(urlRegex);

            if (!match) {
                return message.reply("Link grup tidak valid. Pastikan itu adalah link dari *chat.whatsapp.com*.");
            }

            const inviteCode = match[1];

            try {
                const res = await sock.groupAcceptInvite(inviteCode);
                await message.reply(`Berhasil bergabung ke grup!`);
            } catch (err) {
                console.error("Join group internal error:", err);
                const errorMsg = String(err).toLowerCase();

                // Edge cases handling based on common Baileys/WhatsApp errors
                if (errorMsg.includes("not-authorized") || errorMsg.includes("401") || errorMsg.includes("forbidden")) {
                    message.reply("Gagal bergabung: Bot mungkin telah dikeluarkan atau di-banned dari grup tersebut.");
                } else if (errorMsg.includes("404") || errorMsg.includes("not-found")) {
                    message.reply("Gagal bergabung: Link grup sudah di-reset (revoked) atau grup tidak ditemukan.");
                } else if (errorMsg.includes("409") || errorMsg.includes("conflict")) {
                    message.reply("Gagal bergabung: Bot kemungkinan sudah ada di dalam grup tersebut.");
                } else if (errorMsg.includes("410")) {
                     message.reply("Gagal bergabung: Link grup sudah expired/kedaluwarsa.");
                } else if (errorMsg.includes("419") || errorMsg.includes("428") || errorMsg.includes("approval")) {
                    message.reply("Berhasil mengirim permintaan bergabung! Grup ini memerlukan persetujuan admin. Harap tunggu admin grup menyetujui permintaan bot.");
                } else {
                    message.reply("Gagal bergabung ke grup. Pastikan link masih aktif dan bot memiliki akses ke grup tersebut.");
                }
            }

        } catch (error) {
            console.error("Join command wrapper error:", error);
            message.reply("Terjadi kesalahan sistem saat memproses perintah join.");
        }
    }
};
