import { registerReplyHandler, deleteReplyHandler } from './_registry.js';

export default {
    name: "add",
    aliases: ["tambah"],
    category: "admin",
    description: "Menambahkan member ke dalam grup berdasarkan nomor WA.",
    usage: "!add 628xxx",

    async handler({ message, sock, isGroup, isGroupAdmins, isBotGroupAdmins, groupMetadata, sender, args }) {
        try {
            if (!isGroup) {
                return message.reply("Perintah ini hanya bisa digunakan dalam grup!");
            }

            if (!isGroupAdmins) {
                return message.reply("Kamu bukan admin grup.");
            }

            if (!isBotGroupAdmins) {
                return message.reply("Bot bukan admin grup, tidak bisa menambahkan member.");
            }

            if (args.length === 0) {
                return message.reply("Harap masukkan nomor WhatsApp yang ingin ditambahkan!\nContoh: *!add 6281234567890*");
            }

            // Gabungkan argumen kalau ada spasi (misal !add 62812 3456 7890)
            let rawNumber = args.join("");
            
            // Bersihkan dari karakter non-angka
            let number = rawNumber.replace(/[^0-9]/g, '');

            // Sesuaikan awalan nomor dengan kode negara (Indonesia '62')
            if (number.startsWith('0')) {
                number = '62' + number.slice(1);
            } else if (number.startsWith('8')) {
                number = '62' + number;
            }

            if (number.length < 10) {
                return message.reply("Nomor WhatsApp tidak valid. Pastikan nomor dimasukkan dengan benar.");
            }

            const targetJid = number + "@s.whatsapp.net";

            // Memeriksa apakah target sudah ada di grup
            const isTargetInGroup = groupMetadata.participants.some(p => {
                const participantBaseId = p.id.split(':')[0].split('@')[0];
                return participantBaseId === number;
            });

            if (isTargetInGroup) {
                return message.reply("Nomor tersebut sudah ada di dalam grup ini.");
            }

            // Mengirim pesan konfirmasi
            const sentMsg = await sock.sendMessage(
                message.chat,
                { 
                    text: `Apakah Anda yakin ingin menambahkan *@${number}* ke dalam grup?\n\nBalas pesan ini dengan mengetik *confirm* untuk melanjutkan.\nAtau ketik *cancel* untuk membatalkan.`,
                    mentions: [targetJid] 
                },
                { quoted: message }
            );

            // Mendaftarkan reply handler
            registerReplyHandler(sentMsg.key.id, async ({ message: replyMessage, sock: replySock, state }) => {
                const replyText = replyMessage.text?.toLowerCase()?.trim();
                
                if (replyText === 'confirm') {
                    try {
                        const response = await replySock.groupParticipantsUpdate(replyMessage.chat, [state.targetJid], 'add');
                        
                        // Baileys mereturn status dari masing-masing partisipan yang coba ditambahkan.
                        // 200 = Sukses
                        // 403 / 408 = Dibatasi privasi, hanya mengirim undangan
                        // 409 = Sudah dalam grup
                        const resInfo = response[0] || {};
                        const status = resInfo.status || '200';
                        
                        if (status == 200) {
                            await replySock.sendMessage(
                                replyMessage.chat, 
                                { 
                                    text: `Berhasil menambahkan *@${state.number}* ke grup.`,
                                    mentions: [state.targetJid]
                                }, 
                                { quoted: replyMessage }
                            );
                        } else if (status == 403 || status == 408) {
                            await replySock.sendMessage(
                                replyMessage.chat, 
                                { 
                                    text: `Gagal menambahkan secara langsung karena privasi. Namun WhatsApp secara otomatis mengirimkan tautan undangan grup ke *@${state.number}*.`,
                                    mentions: [state.targetJid]
                                }, 
                                { quoted: replyMessage }
                            );
                        } else if (status == 409) {
                            await replySock.sendMessage(
                                replyMessage.chat, 
                                { 
                                    text: `Gagal, *@${state.number}* ternyata sudah ada di dalam grup.`,
                                    mentions: [state.targetJid]
                                }, 
                                { quoted: replyMessage }
                            );
                        } else {
                            await replySock.sendMessage(
                                replyMessage.chat, 
                                { 
                                    text: `Tidak dapat menambahkan *@${state.number}*. (Kode status WA: ${status})`,
                                    mentions: [state.targetJid]
                                }, 
                                { quoted: replyMessage }
                            );
                        }
                    } catch (error) {
                        console.error('Add execution error:', error);
                        await replyMessage.reply("Terjadi kesalahan fatal saat menambahkan member. Pastikan nomor terdaftar di WhatsApp.");
                    }
                    deleteReplyHandler(sentMsg.key.id);
                } else if (replyText === 'cancel') {
                    await replyMessage.reply("Proses penambahan member dibatalkan.");
                    deleteReplyHandler(sentMsg.key.id);
                } else {
                    await replyMessage.reply("Instruksi tidak dikenali. Ketik *confirm* untuk melanjutkan, atau *cancel* untuk membatalkan.");
                }
            }, { targetJid, number, commandName: "add", userId: sender });

        } catch (error) {
            console.error('Add command error:', error);
            message.reply("Terjadi kesalahan saat memproses perintah add.");
        }
    }
};
