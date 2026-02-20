# Bot Implementation Guide

## Overview

The bot is a separate Node.js process that uses `whatsapp-web.js` to connect to WhatsApp Web via Puppeteer. It listens for messages and forwards them to the API.

## Current Structure

```
bot/
├── src/
│   └── index.js        # Client setup, message handler
├── logs/               # Daily JSON log files (gitignored)
├── session/            # WhatsApp session data (gitignored)
├── Dockerfile
└── package.json
```

## Key Implementation Details

### 1. Client Configuration

```js
const { Client, LocalAuth } = require("whatsapp-web.js")

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./session"  // Persists session to avoid QR scan every time
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",  // Critical for Docker
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process"
    ]
  }
})
```

**Why these Puppeteer args?**
- Docker containers have limited resources and permissions
- `--no-sandbox` required for running as root in container
- `--disable-dev-shm-usage` prevents shared memory issues
- `--single-process` helps with stability in containers

### 2. QR Code Flow

```js
client.on("qr", qr => {
  qrcode.generate(qr, { small: true })
  console.log("Scan the QR code above with WhatsApp mobile app")
})
```

- First run: QR code appears in terminal logs
- Scan with WhatsApp mobile app (Settings → Linked Devices)
- Session saved to `./session/` directory
- Subsequent runs: auto-connects (no QR needed)

### 3. Message Handling

```js
client.on("message", async msg => {
  // Skip empty messages (media, etc.)
  if (msg.body === "") return
  
  // Extract metadata
  const chat = await msg.getChat()
  const contact = await msg.getContact()
  const isFromGroup = msg.from.endsWith("@g.us")
  
  const data = {
    source: "whatsapp",
    messageId: msg.id.id,
    senderId: isFromGroup ? msg.author : msg.from,
    senderName: contact.pushname || contact.name || "Unknown",
    senderPhone: contact.number || "Unknown",
    groupId: isFromGroup ? msg.from : null,
    groupName: isFromGroup ? chat.name : null,
    rawText: msg.body
  }
  
  // Send to API
  await axios.post(`${API_URL}/ingest`, data)
})
```

**Key points:**
- `msg.from` is the chat ID (group or individual)
- `msg.author` is the sender ID inside groups
- `contact.pushname` is the WhatsApp display name
- `contact.number` is the phone number

### 4. Session Management

**Clear stale session files on startup:**
```js
const { execSync } = require('child_process')
execSync(`rm -rf ./session/session/Singleton*`, { stdio: 'inherit' })
```

This prevents conflicts from previous runs. The session still persists for auth.

### 5. Local Logging

```js
const LOG_ROOT = path.resolve(__dirname, "..", "logs")

async function log_message(data) {
  const date = new Date().toISOString().split("T")[0]
  const logFile = path.join(LOG_ROOT, `${date}.log.json`)
  
  await fs.mkdir(LOG_ROOT, { recursive: true })
  
  const logEntry = {
    ...data,
    timestamp: new Date().toISOString()
  }
  
  await fs.appendFile(logFile, JSON.stringify(logEntry) + "\n")
}
```

**Why local logs?**
- Backup if API is down
- Debugging without database access
- Daily rotation built-in

### 6. Error Handling

```js
client.on("message", async msg => {
  try {
    await axios.post(`${API_URL}/ingest`, data)
    console.log("Message sent to API")
  } catch (err) {
    console.error("Error sending message to API:", err.message)
    // Still log locally
    await log_message(data)
  }
})
```

**Consider adding:**
- Retry logic with exponential backoff
- Queue for messages when API is unreachable
- Alerting when bot disconnects

### 7. Docker Considerations

**Dockerfile:**
```dockerfile
FROM node:20

# Puppeteer dependencies for whatsapp-web.js
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  freetype-dev \
  harfbuzz \
  ca-certificates \
  ttf-freefont

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["npm", "run", "dev"]
```

**docker-compose.yml needs:**
```yaml
bot:
  build: ./bot
  shm_size: "1gb"  # Required for Chromium!
  volumes:
    - bot_session:/app/session
    - bot_logs:/app/logs
```

## Environment Variables

```env
API_URL=http://api:3000  # Docker network
# API_URL=http://localhost:3000  # Local dev
```

## Development Workflow

```bash
# First time setup
cd bot
npm install
npm run dev

# Scan QR code with phone

# Subsequent runs - auto connects
npm run dev
```

## Future Enhancements

### 1. Reconnection Handling
```js
client.on("disconnected", reason => {
  console.log("Disconnected:", reason)
  // Auto-reconnect logic
})
```

### 2. Health Check Endpoint
Add a simple HTTP server for health checks:
```js
const http = require('http')
http.createServer((req, res) => {
  res.writeHead(200)
  res.end(JSON.stringify({ status: client.info ? 'connected' : 'disconnected' }))
}).listen(8080)
```

### 3. Group Whitelist/Blacklist
```js
const ALLOWED_GROUPS = process.env.ALLOWED_GROUPS?.split(',') || []

client.on("message", async msg => {
  const isFromGroup = msg.from.endsWith("@g.us")
  if (isFromGroup && ALLOWED_GROUPS.length && !ALLOWED_GROUPS.includes(msg.from)) {
    return  // Skip messages from non-whitelisted groups
  }
  // ...
})
```

### 4. Message Type Support
Currently only text messages are handled. Consider:
- Images with captions
- Documents (PDFs with event flyers)
- Location shares

```js
client.on("message", async msg => {
  if (msg.type === 'image') {
    const media = await msg.downloadMedia()
    // Handle image + caption
  }
})
```

## Debugging Tips

1. **View logs in real-time:**
   ```bash
   docker-compose logs -f bot
   ```

2. **Check session files:**
   ```bash
   docker exec -it offerings_bot ls -la /app/session
   ```

3. **Force new QR scan:**
   ```bash
   docker exec -it offerings_bot rm -rf /app/session
   docker-compose restart bot
   ```

4. **Local testing without Docker:**
   ```bash
   # Terminal 1: API
   cd api && npm run dev
   
   # Terminal 2: Bot
   cd bot && npm run dev
   ```

## Common Issues

| Issue                     | Solution                                   |
| ------------------------- | ------------------------------------------ |
| QR not appearing          | Check terminal logs, ensure TTY available  |
| Chromium crash in Docker  | Ensure `shm_size: "1gb"` in docker-compose |
| Session lost on restart   | Check volume mounts for `/app/session`     |
| Messages not reaching API | Check API_URL env var, API logs            |
| Puppeteer timeout         | Increase timeout, check memory limits      |