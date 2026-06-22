import { handleDanbooruRequest } from "../lib/danbooru.js";

export default {
    name: "danbooru",
    aliases: ["dan", "dnbooru"],
    category: "anime",
    description: "Ambil gambar dari Danbooru menggunakan ID atau Link",
    usage: "!d <post_id or URL>",
    async handler({ message, args, sock }) {
        if (args.length === 0) {
            await message.reply("❌ Berikan ID post atau URL Danbooru.\nContoh: `!d 11467630` atau `!d https://danbooru.donmai.us/posts/11467630`");
            return;
        }

        const input = args[0];
        await handleDanbooruRequest({ input, sock, message, isAutoDetect: false });
    }
};
