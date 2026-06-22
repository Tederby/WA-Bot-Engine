import axios from 'axios';

/**
 * Konversi durasi format ISO 8601 (misal PT4M13S) menjadi string mm:ss atau hh:mm:ss
 * @param {string} duration - Format ISO 8601
 * @returns {string} Durasi yang dapat dibaca
 */
export function parseYtDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return "00:00";

    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);

    let result = "";
    if (hours > 0) {
        result += `${hours}:`;
        result += `${minutes.toString().padStart(2, '0')}:`;
    } else {
        result += `${minutes}:`;
    }
    result += `${seconds.toString().padStart(2, '0')}`;

    return result;
}

/**
 * Mencari video YouTube dan mengambil detail durasinya menggunakan YouTube Data API v3.
 * Memerlukan YOUTUBE_API_KEY di .env.
 * 
 * @param {string} query 
 * @param {number} maxResults 
 * @returns {Promise<Array>} Array berisi detail video
 */
export async function searchYouTube(query, maxResults = 20) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        throw new Error("YOUTUBE_API_KEY belum dikonfigurasi di file .env");
    }

    // 1. Ambil daftar videoId dari endpoint search
    const searchRes = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
        params: {
            part: 'snippet',
            q: query,
            type: 'video',
            maxResults,
            key: apiKey
        }
    });

    if (!searchRes.data || !searchRes.data.items || searchRes.data.items.length === 0) {
        return [];
    }

    const videoIds = searchRes.data.items.map(item => item.id.videoId).join(',');

    // 2. Ambil detail durasi dari endpoint videos
    const videoRes = await axios.get(`https://www.googleapis.com/youtube/v3/videos`, {
        params: {
            part: 'contentDetails,snippet',
            id: videoIds,
            key: apiKey
        }
    });

    if (!videoRes.data || !videoRes.data.items || videoRes.data.items.length === 0) {
        return [];
    }

    // 3. Mapping hasil
    const results = videoRes.data.items.map(item => ({
        id: item.id,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        duration: parseYtDuration(item.contentDetails.duration),
        url: `https://youtu.be/${item.id}`
    }));

    return results;
}
