import { jidNormalizedUser } from "baileys";

export default {
    name: "profile",
    aliases: ["pfp", "profil"],
    category: "general",
    description: "Melihat profil, nama, dan PFP pengguna (diri sendiri, yang di-quote, atau yang di-mention).",
    usage: "!profile [@user/reply]",

    async handler({ message, sock, sender, pushname }) {
        try {
            console.log("=========================================");
            console.log("[DEBUG-PROFILE] Memulai eksekusi perintah profile");
            console.log(`[DEBUG-PROFILE] Original Sender: ${sender}, Pushname: ${pushname}`);
            
            let target = null;
            let targetName = "Tidak diketahui";

            // Prioritas 1: Mention
            if (message.mentionedJid && message.mentionedJid.length > 0) {
                target = message.mentionedJid[0];
                console.log("[DEBUG-PROFILE] Target diatur dari mention:", target);
            } 
            // Prioritas 2: Quoted Message
            else if (message.quoted) {
                target = message.quoted.sender || message.quoted.participant;
                console.log("[DEBUG-PROFILE] Target diatur dari quoted message:", target);
            } 
            // Prioritas 3: Diri Sendiri (Sender)
            else {
                target = sender;
                targetName = pushname || "Tidak diketahui";
                console.log("[DEBUG-PROFILE] Target diatur dari sender (diri sendiri):", target);
            }

            if (!target) {
                console.log("[DEBUG-PROFILE] Gagal menentukan target. Menghentikan perintah.");
                return message.reply("Gagal mendapatkan target pengguna. Pastikan tag atau reply pesan dengan benar.");
            }

            // Normalisasi JID (Hanya untuk keperluan display, LID dan s.whatsapp.net)
            const normalizedTarget = jidNormalizedUser(target);
            const isLid = target.includes('@lid');
            const targetBaseId = target.split(':')[0].split('@')[0];
            
            console.log(`[DEBUG-PROFILE] Normalized Target: ${normalizedTarget}`);
            console.log(`[DEBUG-PROFILE] Is LID Format?: ${isLid}`);
            console.log(`[DEBUG-PROFILE] Target Base ID: ${targetBaseId}`);

            // Jika target bukan sender, kita tidak memiliki pushname (karena kita tidak pakai memory store).
            // Kita akan gunakan base JID sebagai fallback nama agar UI tetap rapi.
            if (target !== sender) {
                targetName = `User (${targetBaseId})`;
            }

            let pfpUrl = null;
            
            try {
                // Mencoba mem-fetch URL foto profil dengan JID yang ditemukan (Full Resolution)
                console.log(`[DEBUG-PROFILE] Memanggil sock.profilePictureUrl untuk JID: ${target} (tipe: image)`);
                pfpUrl = await sock.profilePictureUrl(target, 'image');
                
                if (!pfpUrl) throw new Error("PFP URL undefined (Full-res tidak tersedia)");
                console.log("[DEBUG-PROFILE] Berhasil mendapatkan PFP URL (Full):", pfpUrl);
            } catch (err) {
                console.log("[DEBUG-PROFILE] Gagal mendapatkan PFP Full-res. Error:", err.message);
                
                // Fallback 1: Coba ambil resolusi rendah ('preview')
                try {
                    console.log(`[DEBUG-PROFILE] Mencoba mem-fetch PFP resolusi rendah (tipe: preview) untuk: ${target}`);
                    pfpUrl = await sock.profilePictureUrl(target, 'preview');
                    if (!pfpUrl) throw new Error("PFP URL undefined (Preview tidak tersedia)");
                    console.log("[DEBUG-PROFILE] Berhasil mendapatkan PFP URL (Preview):", pfpUrl);
                } catch (previewErr) {
                    console.log("[DEBUG-PROFILE] Gagal mendapatkan PFP Preview. Error:", previewErr.message);
                    
                    // Fallback 2: Jika target beda dengan normalizedTarget (misal ada karakter ekstra di sesi)
                    if (target !== normalizedTarget) {
                        try {
                            console.log(`[DEBUG-PROFILE] Mencoba fallback dengan Normalized Target: ${normalizedTarget}`);
                            pfpUrl = await sock.profilePictureUrl(normalizedTarget, 'preview');
                            if (!pfpUrl) throw new Error("PFP URL undefined pada fallback normalisasi");
                            console.log("[DEBUG-PROFILE] Berhasil mendapatkan PFP URL (Fallback Normalized):", pfpUrl);
                        } catch (fallbackErr) {
                             console.log("[DEBUG-PROFILE] Fallback normalisasi juga gagal. Kemungkinan besar PFP diprivasi atau tidak ada.");
                        }
                    } else {
                        console.log("[DEBUG-PROFILE] Semua upaya fetching PFP gagal. Target tidak memakai PFP atau diprivasi.");
                    }
                }
            }

            // Membentuk caption balasan
            let caption = `*PROFILE INFO*\n\n`;
            caption += `👤 *Nama:* ${targetName}\n`;
            caption += `📌 *JID:* ${target}\n`;
            
            if (isLid) {
                caption += `\n_Catatan: Nomor disembunyikan oleh WhatsApp (Menggunakan ID Privat / LID)._\n`;
            }

            // Kirim pesan dengan atau tanpa gambar sesuai hasil fetching PFP
            if (pfpUrl) {
                console.log("[DEBUG-PROFILE] Mengirim pesan disertai gambar profil...");
                await sock.sendMessage(
                    message.chat,
                    { image: { url: pfpUrl }, caption: caption },
                    { quoted: message }
                );
            } else {
                console.log("[DEBUG-PROFILE] Mengirim pesan teks saja (tanpa PFP)...");
                caption += `\n_Gambar profil tidak ditemukan atau diprivasi._`;
                await sock.sendMessage(
                    message.chat,
                    { text: caption },
                    { quoted: message }
                );
            }

            console.log("[DEBUG-PROFILE] Perintah profile selesai dengan sukses.");
            console.log("=========================================");

        } catch (error) {
            console.error('[DEBUG-PROFILE] TERJADI KESALAHAN FATAL:', error);
            message.reply("Terjadi kesalahan sistem saat memproses profil. Cek log di terminal.");
        }
    }
};
