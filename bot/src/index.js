require('dotenv').config()
console.log("Starting WhatsApp Bot in environment:", process.env.NODE_ENV);

const qrcode = require("qrcode-terminal");
const axios = require("axios");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { computeHash, isDuplicate, loadSeenHashes } = require('./deduplication');

// DEV SETTINGS
const BYPASS_GROUP_CHECK = process.env.BYPASS_GROUP_CHECK === "true";
const BYPASS_DUPLICATE_CHECK = process.env.BYPASS_DUPLICATE_CHECK === "true";

const BOT_ROOT = path.resolve(__dirname, "..");
const APP_ROOT = path.resolve(BOT_ROOT, "..");
const LOG_ROOT = path.resolve(BOT_ROOT, "logs");
const STORAGE_ROOT = path.resolve(APP_ROOT, process.env.STORAGE_PATH);
const API_URL = process.env.API_BASE_URL;
console.log('Using API_BASE_URL:', API_URL);

// Active groups cache - refreshed periodically from API
let activeGroupIds = new Set();
const REFRESH_INTERVAL = 60 * 10_000; // 10 minutes

// Reconnection strategy for unexpected disconnects/auth failures
const MAX_RECONNECT_ATTEMPTS = Number(process.env.WWJS_MAX_RECONNECT_ATTEMPTS) || 10;
const RECONNECT_BASE_DELAY_MS = Number(process.env.WWJS_RECONNECT_BASE_DELAY_MS) || 1000; // 1s
const RECONNECT_MAX_DELAY_MS = Number(process.env.WWJS_RECONNECT_MAX_DELAY_MS) || 60_000; // 60s

let reconnectAttempts = 0;
let reconnectTimer = null;
let initializing = false;
let shuttingDown = false;
let messageKeyPatch = Promise.resolve();

// Recovery only: use after stopping all Chromium processes using this profile.
// Unconditional deletion can let two browsers write to the same profile.
if (process.env.WWJS_CLEAN_SINGLETON_LOCKS === "true") {
    cleanupSingletonLocks(path.join(BOT_ROOT, "session", "session"));
}

// ### WhatsApp client setup ###

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(BOT_ROOT, "session")
    }),
    puppeteer: {
        handleSIGINT: false, // Let our own shutdown handler manage cleanup
        handleSIGTERM: false,
        handleSIGHUP: false,
        headless: process.env.WWJS_HEADLESS !== "false",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run"
        ]
    }
});

client.on("qr", qr => {
    qrcode.generate(qr, { small: true });
    console.log("Scan the QR code above with WhatsApp mobile app");
});

client.on("ready", async () => {
    messageKeyPatch = applyMessageKeyCompatibilityPatch();
    await messageKeyPatch;
    await loadSeenHashes();
    await fetchActiveGroups();
    setInterval(fetchActiveGroups, REFRESH_INTERVAL);

    console.log("WhatsApp Bot is ready!");

    // Reset backoff on successful connection
    reconnectAttempts = 0;
    initializing = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
});

client.on("message", async msg => {
    await messageKeyPatch;
    if (!msg.id._serialized && typeof msg.id.$1 === "string") {
        msg.id._serialized = msg.id.$1;
    }
    handleMessage(msg).catch(err => {
        console.error(`[${msg.id?.id || "unknown"}] Message processing failed:`, err);
    });
});

client.on("disconnected", (reason) => {
    console.error("WhatsApp client disconnected:", reason);
    initializing = false;
    scheduleReconnect(reason || "disconnected");
});

client.on("authenticated", () => console.log("WhatsApp authenticated; waiting for ready."));
client.on("auth_failure", message => console.error("WhatsApp authentication failed:", message));
client.on("loading_screen", percent => console.log(`WhatsApp loading: ${percent}%`));
client.on("change_state", state => console.log("Client state:", state));


// ### Helper functions ###


async function startClient() {
    initializing = true;
    try {
        await client.initialize();
    } catch (err) {
        console.error("WhatsApp initialization failed:", err.message || err);
        console.error(">>> Run with WWJS_CLEAN_SINGLETON_LOCKS=true if error is locked profile.");
        console.error(">>> Run with WWJS_HEADLESS=false to inspect the WhatsApp loading screen.");
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        try {
            if (client.pupBrowser) await client.destroy();
        } catch (cleanupError) {
            console.error("Browser cleanup failed:", cleanupError.message);
        }
        process.exit(1);
    } finally {
        initializing = false;
    }
}

async function shutdownClient(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`${signal}: closing WhatsApp browser`);
    clearTimeout(reconnectTimer);

    try {
        await client.destroy();
        console.log("WhatsApp browser closed");
        process.exit(0);
    } catch (error) {
        console.error("Browser shutdown failed:", error);
        process.exit(1);
    }
}

function cleanupSingletonLocks(sessionDir) {
    // Only remove Chromium's known lock artifacts, never profile data.
    for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
        const filePath = path.join(sessionDir, name);
        try {
            fsSync.unlinkSync(filePath);
            console.log(`Removed Chromium lock artifact: ${name}`);
        } catch (err) {
            if (err.code !== "ENOENT") {
                console.warn(`Could not remove ${filePath}: ${err.message}`);
            }
        }
    }
}

function applyMessageKeyCompatibilityPatch() {
    // Temporary compatibility shim: this code must run inside WhatsApp's page.
    return client.pupPage.evaluate(() => {
        const MsgKey = window.Store?.MsgKey || window.require('WAWebMsgKey');
        const p = MsgKey?.prototype;
        if (!p) throw new Error("WhatsApp MsgKey prototype is unavailable");
        if ('_serialized' in p) return "already present";
        Object.defineProperty(p, '_serialized', {
            get() { return this.$1; },
            configurable: true
        });
        return "applied";
    }).then(status => {
        console.log(`WhatsApp MsgKey compatibility patch: ${status}`);
    }).catch(err => {
        console.warn("WhatsApp MsgKey compatibility patch failed:", err.message || err);
    });
}

async function handleMessage(msg) {
    if (msg.body === "" && !(msg.hasMedia && msg.type === 'image')) {
        return;
    }

    const chat = await msg.getChat()
    const contact = await msg.getContact()
    const isFromGroup = msg.from.endsWith("@g.us");
    const messageId = msg.id.id;
    const senderId = isFromGroup ? msg.author : msg.from;
    const senderName = contact?.pushname || contact?.name || "Unknown";
    const senderPhone = contact?.number || "Unknown";
    const groupId = isFromGroup ? msg.from : null;
    const groupName = isFromGroup ? chat?.name || null : null;
    const media = msg.hasMedia && msg.type === 'image' ? await msg.downloadMedia() : null;

    console.log(`\n>>> [${messageId}] Received message from ${senderName} (${senderPhone}): ${msg.body.substring(0, 100)}...`);

    // Skip if group is not active
    if (groupId && !activeGroupIds.has(groupId)) {
        console.log(`[${messageId}] Skipping message from inactive group: ${groupName} [${groupId}]`);
        if (!BYPASS_GROUP_CHECK)
            return;
    }
    
    // Check for duplicates (currently not blocking ingestion)
    if (isDuplicate(msg.body, media, addToSeenHashes=true)) {
        console.log(`XXX [${messageId}] Message already received - ignoring`);
        if (!BYPASS_DUPLICATE_CHECK)
            return;
    }

    // TODO : Direct message are always ingested, but we might want to filter them in the future based on sender or content
    
    const data = {
        source: "whatsapp",
        messageId,
        groupId,
        groupName,
        senderId,
        senderName,
        senderPhone,
        rawText: msg.body,
        contentHash: computeHash(msg.body, media?.data || ''),
        mediaUrl: msg.hasMedia && msg.type === 'image' ? await saveMessageMedia(messageId, media) : null,
        msgTimestamp: msg.timestamp * 1000 // Convert to ms
    }

    log_message(data).catch(err => console.error("Log write failed:", err));

    try {
        console.log(`<<< [${messageId}] Sending message to API`);
        await axios.post(`${API_URL}/ingest/raw`, data);
    } catch (err) {
        console.error(`[${messageId}] Error sending message to API:`, err.message);
    }
}

async function log_message(data) {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const logFile = path.join(LOG_ROOT, `${date}.log.json`);
    
    await fs.mkdir(LOG_ROOT, { recursive: true });

    const logEntry = {
        ...data,
        timestamp: new Date().toISOString()
    };

    await fs.appendFile(logFile, JSON.stringify(logEntry) + "\n");
}

async function saveMessageMedia(messageId, media) {
    const messageDir = path.join(STORAGE_ROOT, "media");
    const outputPath = path.join(messageDir, `${messageId}.jpg`);

    await fs.mkdir(messageDir, { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(media.data, "base64"));
    console.log(`Saved media for message ${messageId} to ${outputPath}`);
    return path.relative(STORAGE_ROOT, outputPath).replace(/\\/g, "/");
}

// Fetch active groups from API
async function fetchActiveGroups() {
    try {
        const response = await axios.get(`${API_URL}/groups/active`);
        const groups = response.data;
        activeGroupIds = new Set(groups.map(g => g.sourceId));
        console.log(`Loaded ${activeGroupIds.size} active groups`);
    } catch (err) {
        console.error("Failed to fetch active groups:", err.message);
        // Keep existing cache on error
    }
}

// Schedule a reconnection attempt with exponential backoff
function scheduleReconnect(reason = "unknown") {
    if (reconnectTimer) return; // avoid parallel timers
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`Max reconnect attempts reached (${MAX_RECONNECT_ATTEMPTS}). Exiting for supervisor restart.`);
        process.exit(1);
    }

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS);
    reconnectAttempts += 1;
    console.warn(`Scheduling WhatsApp reconnection in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}). Reason: ${reason}`);

    reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        try {
            if (!initializing) {
                initializing = true;
                await client.initialize();
            }
        } catch (e) {
            initializing = false;
            console.error("Reinitialize failed:", e.message);
            scheduleReconnect("init-error");
        }
    }, delay);
}


// Graceful shutdown on signals
process.on("SIGTERM", () => shutdownClient("SIGTERM")); // Docker stop
process.on("SIGINT", () => shutdownClient("SIGINT"));   // Ctrl+C
process.on("SIGHUP", () => shutdownClient("SIGHUP"));   // Terminal closed

// Start the WhatsApp client
startClient();