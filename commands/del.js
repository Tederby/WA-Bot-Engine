export default {
    name: "delete",
    aliases: ["del"],
    category: "admin",
    description: "Menghapus pesan pengguna di group",
    usage: "!delete (reply to a message)",
    groupOnly: true,

    async handler({ message, sock, isGroupAdmins, isBotGroupAdmins }) {
        try {
            const contextInfo = message.contextInfo;
            const quotedMessage = contextInfo?.quotedMessage;
            const quotedKey = contextInfo?.stanzaId;
            const quotedSender = contextInfo?.participant;

            if (!quotedMessage || !quotedKey || !quotedSender) {
                return message.reply("Harap kutip pesan yang ingin dihapus!");
            }

            // Pengecekan apakah pesan yang direply adalah dari bot itu sendiri
            // Pastikan mengambil base ID saja agar tidak terganggu oleh device ID (misal: :12)
            const botBaseId = sock.user.id.split(':')[0].split('@')[0];
            const senderBaseId = quotedSender.split(':')[0].split('@')[0];
            const isQuotedFromBot = botBaseId === senderBaseId;

            // Jika bukan pesan bot dan pengirim perintah bukan admin, tolak
            if (!isQuotedFromBot && !isGroupAdmins) {
                return message.reply("Kamu bukan admin grup dan hanya bisa menghapus pesan dari bot.");
            }

            // Jika bukan pesan bot dan bot bukan admin, tolak
            if (!isQuotedFromBot && !isBotGroupAdmins) {
                return message.reply("Bot bukan admin grup, tidak bisa menghapus pesan pengguna lain.");
            }

            // Hapus pesan menggunakan context key dari pesan yang dikutip
            await sock.sendMessage(message.chat, {
                delete: {
                    remoteJid: message.chat,
                    fromMe: isQuotedFromBot,
                    id: quotedKey,
                    ...(isQuotedFromBot ? {} : { participant: quotedSender })
                }
            });

        } catch (error) {
            console.error('Delete command error:', error);
            message.reply("Gagal menghapus pesan.");
        }
    }
};