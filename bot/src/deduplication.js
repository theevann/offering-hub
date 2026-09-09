const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const LOG_ROOT = path.resolve(__dirname, "..", "logs");
const DEDUP_DAYS = Number(process.env.DEDUP_DAYS) || 2;

// In-memory set of content hashes for deduplication
let seenHashes = new Set();

/**
 * Compute sha256 hash of text content
 * @param {string} text 
 * @param {string} media_data - Media data
 * @returns {string} sha256 hash as hex string
 */
function computeHash(body_str, media_str="") {
    return crypto.createHash('sha256').update(body_str).update(media_str).digest('hex');
}

/**
 * Check if a message is a duplicate by looking up its hash
 * @param {string} body - Message body
 * @param {object} media - Media object
 * @param {boolean} addToSeenHashes - Whether to add the hash to the seen set
 * @returns {boolean} True if duplicate
 */
function isDuplicate(body, media, addToSeenHashes = false) {
    const hash = computeHash(body, media?.data || '');
    const seen = seenHashes.has(hash);

    if (!seen && addToSeenHashes) {
        seenHashes.add(hash);
    }

    return seen;
}

/**
 * Load content hashes from log files for the last N days (UTC-based to match log file naming)
 */
async function loadSeenHashes() {
    const now = new Date();
    
    for (let i = 0; i < DEDUP_DAYS; i++) {
        // Use UTC date to match log file naming (toISOString().split("T")[0])
        const date = new Date(now);
        date.setUTCDate(date.getUTCDate() - i);
        const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD in UTC
        
        const hashes = await loadHashesFromFile(dateStr);
        hashes.forEach(h => seenHashes.add(h));
    }
    
    console.log(`Loaded ${seenHashes.size} content hashes from last ${DEDUP_DAYS} day(s) of logs`);
}

/**
 * Load hashes from a single log file
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<string[]>} Array of content hashes
 */
async function loadHashesFromFile(dateStr) {
    const logFile = path.join(LOG_ROOT, `${dateStr}.log.json`);
    try {
        const data = await fs.readFile(logFile, 'utf-8');
        const lines = data.split('\n').filter(Boolean);
        const hashes = [];
        
        for (const line of lines) {
            const obj = JSON.parse(line);
            hashes.push(obj.contentHash);
        }
        
        // console.log(`Loaded ${hashes.length} hashes from ${dateStr}`);
        return hashes;
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`Failed to load hashes for ${dateStr}:`, err.message);
        }
        return [];
    }
}

module.exports = {
    computeHash,
    isDuplicate,
    loadSeenHashes
};
