import fs from "fs";
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } from "baileys";
import Pino from "pino";

// Anti-spam / concurrent request lock (menyimpan nomor yang sedang diproses)
const pairingSessions = new Set();

export default {
    name: "addbot",
    aliases: ["jadibot", "pair"],
    category: "owner",
    description: "Menambahkan bot baru menggunakan Pairing Code (tanpa scan QR)",
    usage: "!addbot <nomor HP>",
    ownerOnly: true,

    async handler({ message, args, rawArgs }) {
        if (!rawArgs) {
            return message.reply("❌ Masukkan nomor HP target!\nContoh: `!addbot 081234567890`");
        }

        // 1. Normalisasi Nomor
        let number = rawArgs.replace(/[^0-9]/g, ""); // Hanya sisakan angka
        if (number.startsWith("08")) {
            number = "628" + number.slice(2);
        } else if (number.startsWith("8")) {
            number = "628" + number.slice(1);
        } else if (number.startsWith("00")) {
            number = number.slice(2);
        }

        if (number.length < 10 || number.length > 15) {
            return message.reply("❌ Nomor tidak valid.");
        }

        // 2. Cek Concurrency (Pencegahan Spam)
        if (pairingSessions.has(number)) {
            return message.reply(`⏳ Nomor ${number} sedang dalam proses pendaftaran. Tunggu hingga selesai atau batas waktu habis (3 menit).`);
        }

        // 3. Cek Duplikasi Sesi
        const sessionDir = `./sessions/session_${number}`;
        if (fs.existsSync(sessionDir)) {
            // Cek apakah ada file kredensial (auth)
            if (fs.existsSync(`${sessionDir}/creds.json`)) {
                return message.reply(`❌ Sesi untuk nomor ${number} sudah ada di folder \`${sessionDir}\`.\nJika ingin mendaftar ulang, hapus folder tersebut secara manual terlebih dahulu.`);
            }
        } else {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Kunci sesi agar tidak ada yang bisa spam nomor ini
        pairingSessions.add(number);

        const updateMsg = await message.replyUpdate(`⏳ Sedang menginisiasi *socket* untuk nomor ${number}...`);
        
        let tempSock = null;
        let isSuccess = false;
        
        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion();
            const logger = Pino({ level: "silent" });

            tempSock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                retryRequestDelayMs: 300,
                version,
                logger,
                markOnlineOnConnect: true,
                browser: Browsers.macOS("Chrome"),
            });

            // 4. Request Code
            if (!tempSock.authState.creds.registered) {
                // Tunggu sebentar agar WebSocket Baileys benar-benar terhubung ke WhatsApp server
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                try {
                    const code = await tempSock.requestPairingCode(number);
                    
                    await updateMsg(
                        `📱 *PAIRING CODE BERHASIL DIBUAT!*\n\n` +
                        `Nomor Target: ${number}\n` +
                        `Kode Anda: *${code}*\n\n` +
                        `Langkah-langkah:\n` +
                        `1. Buka aplikasi WhatsApp di HP target.\n` +
                        `2. Buka *Setelan* > *Perangkat Tertaut* > *Tautkan Perangkat*.\n` +
                        `3. Ketuk tulisan *Tautkan dengan nomor telepon saja* (di bagian paling bawah layar scanner).\n` +
                        `4. Masukkan kode di atas.\n\n` +
                        `⏳ _Sesi ini akan otomatis ditutup (timeout) dalam 3 menit jika kode tidak dimasukkan._`
                    );
                } catch (err) {
                    pairingSessions.delete(number);
                    try { tempSock.end(); } catch (e) {}
                    if (fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length === 0) {
                        fs.rmdirSync(sessionDir);
                    }
                    return await updateMsg(`❌ Gagal meminta Pairing Code: ${err.message || "Pastikan nomor terdaftar di WhatsApp dan bukan nomor virtual abal-abal."}`);
                }
            } else {
                pairingSessions.delete(number);
                try { tempSock.end(); } catch (e) {}
                return await updateMsg(`❌ Kredensial sudah terdaftar (Registered: true).`);
            }

            // 5. Listener & Timeout 3 Menit
            return new Promise((resolve) => {
                const timeoutId = setTimeout(async () => {
                    if (!isSuccess) {
                        pairingSessions.delete(number);
                        try { tempSock.end(); } catch(e) {}
                        
                        // Hapus folder sesi yang cacat / tidak jadi ditautkan
                        try {
                            if (fs.existsSync(sessionDir)) {
                                fs.rmSync(sessionDir, { recursive: true, force: true });
                            }
                        } catch (e) {}
                        
                        await updateMsg(`❌ *Proses dibatalkan (Timeout)*\nKode tidak dimasukkan ke dalam WhatsApp target dalam waktu 3 menit. Folder sesi telah dibersihkan.`);
                        resolve();
                    }
                }, 3 * 60 * 1000); // 3 Menit timeout

                // Simpan kredensial jika ada perubahan
                tempSock.ev.on("creds.update", saveCreds);

                // Pantau status koneksi
                tempSock.ev.on("connection.update", async (update) => {
                    const { connection } = update;
                    
                    if (connection === "open") {
                        isSuccess = true;
                        clearTimeout(timeoutId); // Batalkan timeout
                        pairingSessions.delete(number); // Buka kunci sesi
                        
                        await updateMsg(
                            `✅ *Bot Baru Berhasil Didaftarkan!*\n\n` +
                            `Kredensial telah disimpan dengan aman di folder:\n\`${sessionDir}\`\n\n` +
                            `*Langkah Selanjutnya:*\n` +
                            `Tambahkan konfigurasi berikut ke dalam file \`ecosystem.config.cjs\` lalu jalankan \`pm2 restart all\` di terminal VPS:\n\n` +
                            `{\n` +
                            `  name: "bot-${number}",\n` +
                            `  script: "./index.js",\n` +
                            `  node_args: "--experimental-vm-modules",\n` +
                            `  env: {\n` +
                            `    BOT_ID: "${number}",\n` +
                            `    BOT_NAME: "Bot Baru",\n` +
                            `    OWNER_NUMBER: "628...",\n` +
                            `    PREFIXES: "!.#/-",\n` +
                            `    SPAM_DELAY: "5000"\n` +
                            `  }\n` +
                            `}`
                        );
                        
                        // Tutup socket. Biarkan PM2 yang menghidupkan ulang secara permanen.
                        setTimeout(() => {
                            try { tempSock.end(); } catch (e) {}
                        }, 2000);
                        
                        resolve();
                    }
                });
            });

        } catch (err) {
            pairingSessions.delete(number);
            if (tempSock) {
                try { tempSock.end(); } catch(e) {}
            }
            await updateMsg(`❌ Terjadi kesalahan fatal: ${err.message}`);
        }
    }
};
