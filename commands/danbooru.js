import { handleDanbooruRequest, fetchDanbooruPost } from "../lib/danbooru.js";

export default {
    name: "danbooru",
    aliases: ["dan", "dnbooru", "d"],
    category: "anime",
    description: "Gacha gambar random dari Danbooru, atau ambil spesifik menggunakan ID/Link",
    usage: "!d [post_id or URL]",
    async handler({ message, args, sock }) {
        let input;
        let isGacha = false;

        if (args.length === 0) {
            isGacha = true;
            let validId = null;
            let attempts = 0;
            const maxAttempts = 3;

            await message.reply("🎲 Mengambil post random (Gacha)...");

            while (attempts < maxAttempts) {
                attempts++;
                // Generate ID from 1 to 11642728
                const randomId = Math.floor(Math.random() * 11642728) + 1;
                try {
                    const postData = await fetchDanbooruPost(randomId);
                    // Jika post eksplisit, skip dan coba cari lagi (jangan dihitung valid)
                    if (postData.rating === 'e') continue;
                    
                    validId = randomId;
                    break;
                } catch (err) {
                    // Ignore error and try again
                }
            }

            if (!validId) {
                await message.reply("Ampas banget gacha lu hari ini ngab, udah 3 kali ngeroll dapet ID zonk semua wkwkwk. Coba lagi ntar yak!");
                return;
            }

            input = validId;
        } else {
            input = args[0];
        }

        await handleDanbooruRequest({ input, sock, message, isAutoDetect: false, isGacha });
    }
};
