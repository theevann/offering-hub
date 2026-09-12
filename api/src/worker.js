console.log("Worker started with PID:", process.pid);

const prisma = require("./db/prismaClient");
const { createLogger } = require("./utils/logger");
const { processRawMessage } = require("./services/processingService");

const log = createLogger("worker");


const POLL_MS = Number(process.env.WORKER_POLL_MS || 5000);
let stopping = false;

process.on("SIGTERM", requestStop);
process.on("SIGINT", requestStop);

function requestStop() {
    log.warn("Stopping after the current message...");
    stopping = true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    while (!stopping) {
        const message = await prisma.rawMessage.findFirst({
            where: { parsingStatus: "PENDING" },
            include: {
                group: true,
                media: true
            },
            orderBy: { createdAt: "asc" },
        });

        if (!message) {
            // log.debug("No pending messages. Waiting...");
            await sleep(POLL_MS);
            continue;
        }

        if (stopping) break;

        await prisma.rawMessage.update({
            where: { id: message.id },
            data: { parsingStatus: "PROCESSING" }
        });

        try {
            log.info(`Processing message ${message.id}...`);
            const { parsingStatus } = await processRawMessage(message);
            log.info(`Processing finished for message ${message.id} with status: ${parsingStatus}`);
        } catch (error) {
            log.error(`Error processing message ${message.id}:`, error);

            await prisma.rawMessage.update({
                where: { id: message.id },
                data: {
                    parsingStatus: "FAILED",
                    parsingNotes: error.message || "Unknown error"
                }
            });
        }
    }
}

main().catch((err) => {
    console.error("Worker encountered an error:", err);
    process.exit(1);
}).finally(() => prisma.$disconnect());
