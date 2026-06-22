export default {
    name: "setname",
    aliases: ["botname", "setbotname"],
    category: "owner",
    description: "Mengganti nama profil (username) bot.",
    usage: "!setname <nama baru>",
    ownerOnly: true,

    async handler({ message, sock, args }) {
        try {
            const newName = args.join(" ");
            if (!newName) {
                return message.reply("Harap masukkan nama baru untuk bot.\nContoh: *!setname Tederby Bot*");
            }

            // Batas maksimal nama profil di WhatsApp adalah 25 karakter
            if (newName.length > 25) {
                return message.reply("Nama bot tidak boleh lebih dari 25 karakter.");
            }

            await sock.updateProfileName(newName);
            await message.reply(`Berhasil mengubah nama bot menjadi *${newName}*.`);
            
        } catch (error) {
            console.error("Setname error:", error);
            message.reply("Gagal mengubah nama bot. Mungkin terkena limit dari WhatsApp (rate-limit) atau terjadi kesalahan.");
        }
    }
};
