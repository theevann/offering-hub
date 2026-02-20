const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const LOG_ROOT = path.resolve(__dirname, "..", "logs");
const DEDUP_DAYS = Number(process.env.DEDUP_DAYS) || 2;

// In-memory set of content hashes for deduplication
let seenHashes = new Set();

/**
 * Compute MD5 hash of text content
 * @param {string} text 
 * @returns {string} MD5 hash as hex string
 */
function computeHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Check if a message is a duplicate by looking up its hash
 * @param {object} msg - Message object with rawText property
 * @returns {boolean} True if duplicate
 */
function checkDuplicate(msg) {
    const hash = computeHash(msg.rawText);
    return seenHashes.has(hash);
}

/**
 * Add a message's hash to the seen set
 * @param {object} msg - Message object with rawText property
 */
function addToSeenHashes(msg) {
    seenHashes.add(computeHash(msg.rawText));
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
            hashes.push(obj.contentHash || computeHash(obj.rawText));
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
    checkDuplicate,
    addToSeenHashes,
    loadSeenHashes
};
