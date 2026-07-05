import { jidNormalizedUser } from "baileys";

export default {
    name: "promote",
    aliases: ["admin"],
    category: "group",
    description: "Menaikkan jabatan anggota biasa menjadi Admin grup.",
    usage: "!promote @user",
    groupOnly: true,
    adminOnly: true,
    botAdminRequired: true,

    async handler({ message, sock, args, prefix, groupMetadata }) {
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
                return message.reply(`Tag, reply, atau masukkan nomor user yang ingin dijadikan Admin.\nContoh: \`${prefix}promote @user\``);
            }

            const normalizedTarget = jidNormalizedUser(target);
            const targetBaseId = normalizedTarget.split("@")[0];

            // Pre-check: is target already admin?
            if (groupMetadata?.participants) {
                const participant = groupMetadata.participants.find(p => 
                    p.id.split(":")[0].split("@")[0] === targetBaseId
                );
                if (!participant) {
                    return message.reply(`❌ @${targetBaseId} tidak ditemukan di grup ini.`);
                }
                if (participant.admin) {
                    return sock.sendMessage(
                        message.chat,
                        { text: `⚠️ @${targetBaseId} sudah menjadi Admin Grup.`, mentions: [normalizedTarget] },
                        { quoted: message }
                    );
                }
            }

            await sock.groupParticipantsUpdate(message.chat, [normalizedTarget], "promote");

            return sock.sendMessage(
                message.chat,
                {
                    text: `✅ Berhasil menaikkan @${targetBaseId} menjadi Admin Grup!`,
                    mentions: [normalizedTarget],
                },
                { quoted: message }
            );
        } catch (error) {
            console.error("[PROMOTE CMD]", error);
            message.reply("❌ Gagal menaikkan jabatan admin. Pastikan bot adalah admin dan nomor yang dituju valid.");
        }
    }
};
