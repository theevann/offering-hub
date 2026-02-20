require('dotenv').config();
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { execSync } = require('child_process');
const { computeHash, checkDuplicate, addToSeenHashes, loadSeenHashes } = require('./deduplication');


const LOG_ROOT = path.resolve(__dirname, "..", "logs");
const apiUrl = `${process.env.API_URL}`;
console.log('Using API_URL:', apiUrl);

// Active groups cache - refreshed periodically from API
let activeGroupIds = new Set();
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Reconnection strategy for unexpected disconnects/auth failures
const MAX_RECONNECT_ATTEMPTS = Number(process.env.WWJS_MAX_RECONNECT_ATTEMPTS) || 10;
const RECONNECT_BASE_DELAY_MS = Number(process.env.WWJS_RECONNECT_BASE_DELAY_MS) || 1000; // 1s
const RECONNECT_MAX_DELAY_MS = Number(process.env.WWJS_RECONNECT_MAX_DELAY_MS) || 60_000; // 60s

let reconnectAttempts = 0;
let reconnectTimer = null;
let initializing = false;

// Save session locally to avoid scanning QR every time
execSync(`rm -rf ./session/session/Singleton*`, {stdio: 'inherit'})
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: "./session"
    }),
    puppeteer: {
        headless: true,
        // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process"
        ]
    }
});

client.on("qr", qr => {
    qrcode.generate(qr, { small: true });
    console.log("Scan the QR code above with WhatsApp mobile app");
});

client.on("ready", async () => {
    console.log("WhatsApp Bot is ready!");
    await loadSeenHashes();
    await fetchActiveGroups();
    setInterval(fetchActiveGroups, REFRESH_INTERVAL);
    // Reset backoff on successful connection
    reconnectAttempts = 0;
    initializing = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
});

client.on("message", async msg => {
    if (msg.body === "") {
        console.log("Received non-text message, ignoring.");
        return; // For now ignore non-text messages
    }
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    
    const isFromGroup = msg.from.endsWith("@g.us");
    const messageId = msg.id.id;
    const senderId = isFromGroup ? msg.author : msg.from;
    const senderName = contact.pushname || contact.name || "Unknown";
    const senderPhone = contact.number || "Unknown";
    const groupId = isFromGroup ? msg.from : null;
    const groupName = isFromGroup ? chat.name : null;
    
    // Skip if group is not active
    // if (isFromGroup && groupId && !activeGroupIds.has(groupId)) {
    //     console.log(`Skipping message from inactive group: ${groupName}`);
    //     return;
    // } 

    // TODO: Direct message are always ingested, but we might want to filter them in the future based on sender or content
    
    const data = {
        source: "whatsapp",
        messageId,
        groupId,
        groupName,
        senderId,
        senderName,
        senderPhone,
        rawText: msg.body,
        contentHash: computeHash(msg.body),
        msgTimestamp: msg.timestamp * 1000 // Convert to ms
    }
    
    console.log(`\n>>> Received message from ${senderName} (${senderPhone}): ${msg.body.substring(0, 100)}...`);
    if (checkDuplicate(data)) {
        console.log("XXX Message already received - ignoring");
        // return;
    }
    addToSeenHashes(data);
    log_message(data).catch(err => console.error("Log write failed:", err));

    try {
        await axios.post(`${apiUrl}/ingest/raw`, data);
        console.log("<<< Message sent to API");
    } catch (err) {
        console.error("Error sending message to API:", err.message);
    }
});

client.on("disconnected", (reason) => {
    console.error("WhatsApp client disconnected:", reason);
    initializing = false;
    scheduleReconnect(reason || "disconnected");
});

client.on("change_state", (state) => {
    console.log("Client state:", state);
});


client.initialize();


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

// Fetch active groups from API
async function fetchActiveGroups() {
    try {
        const response = await axios.get(`${apiUrl}/groups/active`);
        const groups = response.data;
        activeGroupIds = new Set(groups.map(g => g.whatsappId));
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
