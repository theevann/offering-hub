const { createLogger } = require("../utils/logger");
const log = createLogger("ingestion");

const prisma = require("../db/prismaClient");
const { computeHash, findRecentExactDuplicate } = require("./deduplicationService");
const { calculateNextScheduledAt } = require("../utils/batchCoalescing");

const DEDUPLICATE = true;
const DEBOUNCE_SECONDS = Number(process.env.MESSAGE_BATCH_DEBOUNCE_SECONDS || 60);
const MAX_WAIT_SECONDS = Number(process.env.MESSAGE_BATCH_MAX_WAIT_SECONDS || 300);
const MAX_BATCH_SIZE = Number(process.env.MESSAGE_BATCH_MAX_SIZE || 10);

// Default location for new groups (Da Nang, Vietnam)
// const DEFAULT_GROUP_LOCATION = {
//   country: "Vietnam",
//   city: "Da Nang",
//   latitude: 16.0544,
//   longitude: 108.2022,
//   timezone: "Asia/Ho_Chi_Minh"
// };
const DEFAULT_GROUP_LOCATION = {
    type: 'REGION',
    country: 'Sri Lanka',
    adminArea: 'Southern Province',
    city: '',
    latitude: 5.965235,
    longitude: 80.39111,
    radiusKm: 50, // max is 50
    timezone: 'Asia/Colombo'
};


async function ingestRawMessage(data) {
    const rawText = data.rawText || "";
    const {
        source,
        messageId,
        senderId,
        senderName,
        senderPhone,
        groupId: whatsappGroupId,
        groupName,
        mediaUrl,
        msgTimestamp: timestamp
    } = data;

    log.info(`> Receiving raw message from source: ${source}, messageId: ${messageId}`);

    if (!rawText.trim() && !mediaUrl) throw new Error("rawText or mediaUrl is required");
    const contentHash = await computeHash(rawText, mediaUrl);

    // Comment next line out once we have group management in place, for now we want to ingest all messages to build up our group database
    const group = await getOrCreateGroup(whatsappGroupId, groupName);

    // let group = await prisma.group.findUnique({
    //   where: { sourceId: whatsappGroupId }
    // });

    if (!group) {
        throw new Error(`Group not found: ${whatsappGroupId}`);
    }

    const previousExactMatch = DEDUPLICATE ? await findRecentExactDuplicate(contentHash) : null;
    if (previousExactMatch) {
        log.info(
            `Exact rawText duplicate detected for message from ${source} with ID ${messageId} (matches rawMessage ${previousExactMatch.id} on ${previousExactMatch.createdAt.toISOString()}) - Ignoring`
        );

        return null;
    }

    const { rawMessage, job } = await prisma.$transaction(async (tx) => {
        // Advisory lock on (source, senderId, groupId) to serialize rapid concurrent messages
        const lockKey = `ingest:${source}:${senderId}:${group.id}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const now = new Date();

        // Check for an active pending job for this sender and group
        const pendingJob = await tx.processingJob.findFirst({
            where: {
                source,
                senderId,
                groupId: group.id,
                status: "PENDING",
            },
            include: {
                _count: {
                    select: { rawMessages: true }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        let targetJob;
        const isEligible = pendingJob &&
            pendingJob._count.rawMessages < MAX_BATCH_SIZE &&
            now - pendingJob.createdAt < MAX_WAIT_SECONDS * 1000;

        if (isEligible) {
            const isFull = (pendingJob._count.rawMessages + 1) >= MAX_BATCH_SIZE;
            const scheduledAt = calculateNextScheduledAt({
                now,
                createdAt: pendingJob.createdAt,
                maxWaitSeconds: MAX_WAIT_SECONDS,
                debounceSeconds: DEBOUNCE_SECONDS,
                isFull,
            });

            targetJob = await tx.processingJob.update({
                where: { id: pendingJob.id },
                data: {
                    lastMessageAt: now,
                    scheduledAt,
                }
            });
        } else {
            const scheduledAt = new Date(now.getTime() + (DEBOUNCE_SECONDS * 1000));

            targetJob = await tx.processingJob.create({
                data: {
                    source,
                    senderId,
                    groupId: group.id,
                    status: "PENDING",
                    scheduledAt,
                    firstMessageAt: now,
                    lastMessageAt: now,
                }
            });
        }

        const createdMessage = await createRawMessage(
            tx,
            source,
            messageId,
            senderId,
            senderName,
            senderPhone,
            group,
            rawText,
            contentHash,
            timestamp,
            mediaUrl,
            targetJob.id
        );

        return { rawMessage: createdMessage, job: targetJob };
    });

    log.info(`Created rawMessage ${rawMessage.id} assigned to processingJob ${job.id} (status: ${job.status}, scheduledAt: ${job.scheduledAt.toISOString()}) from group: ${rawMessage.group?.name || "unknown"}`);

    return { rawMessage, processingJob: job };
}

async function getOrCreateGroup(sourceId, groupName) {
    if (!sourceId) return null;

    // Try to find existing group
    let group = await prisma.group.findUnique({
        where: { sourceId }
    });

    if (!group) {
        // Create new group with default location
        group = await prisma.group.create({
            data: {
                sourceId,
                name: groupName || sourceId,
                type: DEFAULT_GROUP_LOCATION.type,
                country: DEFAULT_GROUP_LOCATION.country,
                adminArea: DEFAULT_GROUP_LOCATION.adminArea,
                city: DEFAULT_GROUP_LOCATION.city,
                latitude: DEFAULT_GROUP_LOCATION.latitude,
                longitude: DEFAULT_GROUP_LOCATION.longitude,
                timezone: DEFAULT_GROUP_LOCATION.timezone
            }
        });
        log.info(`Created new group: ${group.name} (${group.sourceId}) centered at ${group.city}, ${group.country}`);
    }

    return group;
}

function getMimeTypeFromUrl(url) {
    const extension = url.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'mp4': 'video/mp4',
        'pdf': 'application/pdf',
    };
    return mimeTypes[extension] || 'application/octet-stream';
}

async function createRawMessage(tx, source, messageId, senderId, senderName, senderPhone, group, rawText, contentHash, timestamp, mediaUrl, processingJobId) {
    return await tx.rawMessage.create({
        data: {
            source,
            messageId,
            senderId,
            senderName,
            senderPhone,
            groupId: group?.id || null,
            processingJobId: processingJobId || null,
            rawText,
            contentHash,
            timestamp: timestamp ? new Date(timestamp) : undefined,
            media: mediaUrl
                ? {
                    create: {
                        type: "IMAGE",
                        url: mediaUrl,
                        mimeType: getMimeTypeFromUrl(mediaUrl)
                    }
                }
                : undefined
        },
        include: {
            group: true,
            media: {
                select: {
                    url: true,
                    mimeType: true
                }
            }
        }
    });
}

module.exports = { ingestRawMessage };
