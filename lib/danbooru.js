import axios from "axios";

/**
 * Fetch post data from Danbooru JSON API
 * @param {string|number} input Post ID or URL
 * @returns {Promise<object>}
 */
export const fetchDanbooruPost = async (input) => {
    let postId = String(input).trim();

    // Extract ID if input is a URL
    const regex = /(?:https?:\/\/)?(?:www\.)?danbooru\.donmai\.us\/posts\/(\d+)(?:\?.*)?/i;
    const match = postId.match(regex);
    if (match) {
        postId = match[1];
    }

    if (!/^\d+$/.test(postId)) {
        throw new Error("Invalid Danbooru Post ID or URL.");
    }

    const response = await axios.get(`https://danbooru.donmai.us/posts/${postId}.json`);

    if (!response.data || Object.keys(response.data).length === 0) {
        throw new Error("Post tidak ditemukan atau API error.");
    }

    return response.data;
};

/**
 * Handle shared logic for processing Danbooru Request and sending the message
 * @param {object} params - { input, sock, message, isAutoDetect }
 */
export const handleDanbooruRequest = async ({ input, sock, message, isAutoDetect = false, isGacha = false }) => {
    try {
        const postData = await fetchDanbooruPost(input);

        // Extract basic data
        const imageUrl = postData.file_url || postData.large_file_url;
        const postId = postData.id;
        const rating = postData.rating; // 'g', 's', 'q', 'e'

        if (!imageUrl) {
            if (!isAutoDetect) await message.reply("❌ Gambar tidak ditemukan atau post ini berupa video/animasi.");
            return;
        }

        const captionLines = [
            `🖼️ *Danbooru Post:* ${postId}`,
            `©️ *Copyright:* ${postData.tag_string_copyright || 'Original'}`,
            `🎨 *Artist:* ${postData.tag_string_artist || 'Unknown'}`,
            `📄 *Character:* ${postData.tag_string_character || 'Original'}`,
            `🔗 *Source:* ${postData.source || 'N/A'}`,
            `🌐 *Post Link:* https://danbooru.donmai.us/posts/${postId}`
        ];

        // Explicit filter
        if (rating === 'e') {
            await message.reply(`❌ Gambar NSFW (Explicit) diblokir.\n\n🌐 *Post Link:* https://danbooru.donmai.us/posts/${postId}\n💡 *Tip:* Balas pesan ini dengan !tag untuk melihat daftar tags dari post ${postId}`);
            return;
        }

        // Questionable warning
        if (rating === 'q') {
            captionLines.unshift("⚠️ *WARNING:* Gambar ini memiliki rating Questionable.\n");
        }

        // Add tag tip
        captionLines.push(`\n💡 *Tip:* Balas pesan ini dengan !tag untuk melihat semua tags.`);
        if (isGacha) {
            captionLines.push(`💡 *Tip:* Kamu juga bisa mencari spesifik menggunakan \`!danbooru <ID>\``);
        }

        await sock.sendMessage(
            message.chat,
            {
                image: { url: imageUrl },
                caption: captionLines.join('\n')
            },
            { quoted: message }
        );
    } catch (err) {
        if (!isAutoDetect) {
            await message.reply(`❌ Error: ${err.message}`);
        } else {
            console.error("Danbooru Auto-Detect Error:", err.message);
        }
    }
};

