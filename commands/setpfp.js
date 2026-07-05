import { downloadContentFromMessage, jidNormalizedUser } from "baileys";
import { Jimp } from "jimp";
import path from "path";
import fs from "fs";
import axios from "axios";
import { getUser, setPfp } from "../lib/database.js";

export default {
    name: "setpfp",
    aliases: ["setprofil", "setpp"],
    category: "general",
    description: "Mengatur foto profil kustom mandiri di database bot.",
    usage: "!setpfp [reply/image] | !setpfp [link] | !setpfp delete",
    
    async handler({ message, sock, args, sender, prefix }) {
        try {
            const normalizedSender = jidNormalizedUser(sender);
            const senderBaseId = normalizedSender.split("@")[0];
            const userData = getUser(normalizedSender);

            if (!userData.registered) {
                return message.reply(`❌ Kamu harus terdaftar terlebih dahulu untuk menggunakan fitur ini. Ketik \`${prefix}register\` untuk mendaftar.`);
            }

            if (args[0] && (args[0].toLowerCase() === "delete" || args[0].toLowerCase() === "remove")) {
                if (!userData.meta?.pfp) {
                    return message.reply("⚠️ Kamu belum memiliki foto profil kustom.");
                }

                setPfp(normalizedSender, null);
                
                const pfpDir = path.resolve(process.cwd(), "database", "pfp");
                const filepath = path.join(pfpDir, `${senderBaseId}.jpg`);
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
                
                return message.reply("✅ Foto profil kustom berhasil dihapus. Bot akan kembali menggunakan foto profil WhatsApp aslimu.");
            }

            let buffer = null;

            // ── Detect media using normalized message type ──────────
            // message.type = the WAMessage key (e.g. "imageMessage")
            // This works correctly even for ephemeral/viewOnce messages
            // because Messages.js unwraps them before setting m.type.
            const isMedia = message.type === "imageMessage";
            const isQuotedMedia = !!(
                message.quoted?.message?.imageMessage ||
                // Handle nested types in quoted messages
                (message.quoted?.mtype && (
                    message.quoted.mtype === "image/jpeg" ||
                    message.quoted.mtype === "image/png" ||
                    message.quoted.mtype === "image/webp" ||
                    message.quoted.mtype === "imageMessage"
                ))
            );

            if (isQuotedMedia && message.quoted?.message) {
                await message.reply("⏳ Sedang mengunduh dan memproses gambar...");

                // Find the imageMessage inside the quoted message
                const quotedMsg = message.quoted.message;
                const imgMsg = quotedMsg.imageMessage
                    || quotedMsg.viewOnceMessageV2?.message?.imageMessage
                    || quotedMsg.ephemeralMessage?.message?.imageMessage;

                if (imgMsg) {
                    const stream = await downloadContentFromMessage(imgMsg, 'image');
                    const chunks = [];
                    for await (const chunk of stream) {
                        chunks.push(chunk);
                    }
                    buffer = Buffer.concat(chunks);
                }
            } else if (isMedia && message.message?.imageMessage) {
                await message.reply("⏳ Sedang mengunduh dan memproses gambar...");
                const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                buffer = Buffer.concat(chunks);
            } else if (args[0] && args[0].startsWith("http")) {
                await message.reply("⏳ Sedang mengambil dan memproses gambar dari link...");
                try {
                    const response = await axios.get(args[0], { responseType: 'arraybuffer', timeout: 10000 });
                    buffer = Buffer.from(response.data);
                } catch (err) {
                    return message.reply("❌ Gagal mengambil gambar dari link. Pastikan link valid dan langsung menuju ke file gambar.");
                }
            } else {
                return message.reply(`❌ Kirim atau reply gambar dengan caption \`${prefix}setpfp\`\nAtau gunakan link: \`${prefix}setpfp https://...\`\nUntuk menghapus: \`${prefix}setpfp delete\``);
            }

            if (!buffer) {
                return message.reply("❌ Gagal memproses media.");
            }

            // Process image with Jimp
            const image = await Jimp.read(buffer);
            
            // Crop 1:1 and Resize to 500x500
            const w = image.bitmap.width;
            const h = image.bitmap.height;
            const size = Math.min(w, h);
            
            const x = (w - size) / 2;
            const y = (h - size) / 2;
            
            image.crop({ x, y, w: size, h: size });
            image.resize({ w: 500, h: 500 });

            // Ensure directory exists
            const pfpDir = path.resolve(process.cwd(), "database", "pfp");
            if (!fs.existsSync(pfpDir)) {
                fs.mkdirSync(pfpDir, { recursive: true });
            }

            const filename = `${senderBaseId}.jpg`;
            const filepath = path.join(pfpDir, filename);

            // Use getBuffer for Jimp v1+ compatibility, fallback to write()
            try {
                const outBuffer = await image.getBuffer("image/jpeg");
                fs.writeFileSync(filepath, outBuffer);
            } catch {
                // Fallback for legacy Jimp versions
                await image.write(filepath);
            }

            // Update database
            setPfp(normalizedSender, filename);

            return message.reply("✅ Foto profil custom berhasil diperbarui! Cek dengan perintah `!profile`.");

        } catch (error) {
            console.error("[SETPFP CMD]", error);
            message.reply("❌ Terjadi kesalahan saat memproses gambar. Pastikan file/link yang diberikan adalah gambar yang valid.");
        }
    }
};
