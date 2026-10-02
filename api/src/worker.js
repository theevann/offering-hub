if (process.env.NODE_ENV !== 'production') {
    require("dotenv").config({
        path: require("node:path").join(__dirname, "../.env"),
        quiet: true
    });
}

const prisma = require("./db/prismaClient");
const { createLogger } = require("./utils/logger");
const { processMessageBatch } = require("./services/processingService");

const log = createLogger("worker");

const POLL_SECONDS = Number(process.env.WORKER_POLL_SECONDS || 5);
const MAX_ATTEMPTS = Number(process.env.MESSAGE_BATCH_MAX_ATTEMPTS || 3);
const RETRY_BACKOFF_SECONDS = Number(process.env.MESSAGE_BATCH_RETRY_BACKOFF_SECONDS || 30);

let stopping = false;

process.on("SIGTERM", requestStop);
process.on("SIGINT", requestStop);

function requestStop() {
    log.warn("Stopping after the current batch...");
    stopping = true;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function recoverInterruptedRuns() {
    try {
        const recoveredRuns = await prisma.processingJob.updateMany({
            where: { status: "PROCESSING" },
            data: { status: "FAILED", lastError: "Worker interrupted before completion" }
        })

        if (recoveredRuns.count > 0) {
            log.warn(`Recovered ${recoveredRuns.count} interrupted processing run(s) for retry`);
        }
    } catch (err) {
        log.warn("Error recovering interrupted processing runs:", err.message);
    }
}

async function loadJobBatch(tx, jobId) {
    const batch = await tx.rawMessage.findMany({
        where: { processingJobId: jobId },
        include: {
            group: true,
            media: true
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    if (batch.length > 0) {
        return batch;
    }

    await tx.processingJob.update({
        where: { id: jobId },
        data: {
            parsingStatus: null,
            status: "FAILED",
            lastError: "No raw messages attached to run"
        }
    });

    return null;
}

async function claimNextRetryableRun() {
    return await prisma.$transaction(async (tx) => {
        // Find failed run with attempts < MAX_ATTEMPTS and backoff elapsed
        const retryable = await tx.$queryRaw`
            SELECT id, attempts
            FROM "ProcessingJob"
            WHERE "status" = 'FAILED'
              AND attempts < ${MAX_ATTEMPTS}
              AND "updatedAt" <= NOW() - (attempts * (${RETRY_BACKOFF_SECONDS} * INTERVAL '1 second'))
            ORDER BY "updatedAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `;

        if (!retryable || retryable.length === 0) {
            return null;
        }

        const runId = retryable[0].id;
        const newAttempts = retryable[0].attempts + 1;

        const run = await tx.processingJob.update({
            where: { id: runId },
            data: {
                status: "PROCESSING",
                attempts: newAttempts,
                lastError: null
            },
            include: {
                group: true
            }
        });

        const batch = await loadJobBatch(tx, run.id);
        if (!batch) return null;

        return { batch, run };
    });
}

async function claimNextPendingJob() {
    return await prisma.$transaction(async (tx) => {
        const eligible = await tx.$queryRaw`
            SELECT id
            FROM "ProcessingJob"
            WHERE "status" = 'PENDING'
              AND "scheduledAt" <= NOW()
            ORDER BY "scheduledAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `;

        if (!eligible || eligible.length === 0) {
            return null;
        }

        const runId = eligible[0].id;

        const run = await tx.processingJob.update({
            where: { id: runId },
            data: {
                status: "PROCESSING",
                attempts: { increment: 1 },
                lastError: null
            },
            include: {
                group: true
            }
        });

        const batch = await loadJobBatch(tx, run.id);
        if (!batch) return null;

        return { batch, run };
    });
}

async function main() {
    log.info(`Worker started (poll: ${POLL_SECONDS}s, maxAttempts: ${MAX_ATTEMPTS}, retryBackoff: ${RETRY_BACKOFF_SECONDS}s)`);

    await recoverInterruptedRuns();

    while (!stopping) {
        const claimed = await claimNextRetryableRun() || await claimNextPendingJob();

        if (!claimed) {
            await sleep(POLL_SECONDS * 1000);
            continue;
        }

        if (stopping) break;

        const { batch, run } = claimed;
        const senderId = batch[0].senderId;
        const groupName = batch[0].group?.name || "unknown";

        try {
            log.info(`Processing claimed batch of ${batch.length} message(s) for run ${run.id} (attempt ${run.attempts}) from sender ${senderId} in group "${groupName}"...`);

            const { parsingStatus } = await processMessageBatch(batch, run);

            log.info(`Finished processing batch of ${batch.length} message(s) with status: ${parsingStatus}`);
        } catch (error) {
            log.error(`Error processing batch for run ${run.id}:`, error);

            await prisma.processingJob.update({
                where: { id: run.id },
                data: {
                    status: "FAILED",
                    lastError: error.message || "Unknown error"
                }
            });
        }
    }
}

main().catch((err) => {
    console.error("Worker encountered an error:", err);
    process.exit(1);
}).finally(() => prisma.$disconnect());
