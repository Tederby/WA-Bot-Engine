import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { downloadContentFromMessage } from 'baileys';
import setting from '../setting.js';

export default {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'media',
    description: 'Membuat stiker dari gambar atau video pendek',
    usage: '!s (send/reply to an image or short video) atau !s Pack|Author',
    async handler({ message, sock, rawArgs, prefix, pushname }) {
        try {
            // Check original message media
            let isMedia = false;
            let isQuotedMedia = false;

            if (message.message?.imageMessage || message.message?.videoMessage) {
                isMedia = true;
            }
            if (message.quoted?.message?.imageMessage || message.quoted?.message?.videoMessage) {
                isQuotedMedia = true;
            }

            const targetMsg = isQuotedMedia ? message.quoted : (isMedia ? message : null);

            if (!targetMsg) {
                return await message.reply(`❌ Kirim gambar/video dengan caption *${prefix}s* atau balas (reply) media yang sudah ada.`);
            }

            const isVideo = !!targetMsg.message?.videoMessage;
            const mediaMessage = targetMsg.message?.imageMessage || targetMsg.message?.videoMessage;

            if (!mediaMessage) {
                return await message.reply('❌ Format media tidak didukung. Harap kirim gambar, video pendek, atau GIF.');
            }

            // Verify video duration
            if (isVideo && mediaMessage.seconds && mediaMessage.seconds > 10) {
                return await message.reply('❌ Video terlalu panjang. Maksimal 10 detik.');
            }

            const textArgs = (rawArgs || '').trim();

            // Di WhatsApp, Author ditampilkan di atas (kiri), Pack di bawah (kanan).
            // User ingin "Bot Name - User Name" -> Author: Bot Name, Pack: User Name
            let authorName = setting.name || 'Bot Stiker';
            let packName = pushname || 'WhatsApp User';

            let replyMsg = '⏳ Sedang membuat stiker...';

            if (textArgs) {
                const splitArgs = textArgs.split('|');
                // User input: Tederby|Anime (Tederby sebagai Author, Anime sebagai Pack)
                authorName = splitArgs[0].trim();
                if (splitArgs.length > 1) {
                    packName = splitArgs[1].trim();
                } else {
                    packName = pushname || 'WhatsApp User';
                }
            } else {
                replyMsg += `\n\n💡 *Tips*: Kamu bisa menambahkan watermark dengan perintah \`${prefix}s NamaAuthor|NamaPack\` (contoh: \`${prefix}s Tederby|Anime\`)`;
            }

            await message.reply(replyMsg);

            // Download media natively using baileys
            const stream = await downloadContentFromMessage(mediaMessage, isVideo ? 'video' : 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // Build sticker
            const sticker = new Sticker(buffer, {
                pack: packName,
                author: authorName,
                type: StickerTypes.FULL,
                quality: 70
            });

            const stickerBuffer = await sticker.toBuffer();

            // Send sticker message
            await sock.sendMessage(message.chat, { sticker: stickerBuffer }, { quoted: message });

        } catch (error) {
            console.error('[ERROR STICKER]', error);
            await message.reply('❌ Terjadi kesalahan saat membuat stiker. Silakan coba lagi nanti.');
        }
    }
};