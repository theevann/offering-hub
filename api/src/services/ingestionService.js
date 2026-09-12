const { createLogger } = require("../utils/logger");
const log = createLogger("ingestion");

const prisma = require("../db/prismaClient");
// const { processRawMessage } = require("./processingService");
const { computeHash, findRecentExactDuplicate } = require("./deduplicationService");
// const { get } = require("node:http");

const DEDUPLICATE = true;

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
    // Destructure incoming fields
    const {
        source,
        messageId,
        senderId,
        senderName,
        senderPhone,
        groupId: whatsappGroupId,
        groupName,
        rawText,
        mediaUrl,
        msgTimestamp: timestamp
    } = data;

    log.info(`> Receiving raw message from source: ${source}, messageId: ${messageId}`);

    if (!rawText && !mediaUrl) throw new Error("rawText or mediaUrl is required");
    const contentHash = await computeHash(rawText, mediaUrl);

    // Comment next line out once we have group management in place, for now we want to ingest all messages to build up our group database
    const group = await getOrCreateGroup(whatsappGroupId, groupName);

    // let group = await prisma.group.findUnique({
    //   where: { sourceId: whatsappGroupId }
    // });

    if (!group) {
        throw new Error(`Group not found: ${whatsappGroupId}`);
    }

    if (rawText.length < 100 && !mediaUrl) {
        log.info(`Raw text too short (${rawText.length} chars) for message ${messageId} - Ignoring`);
        return null;
    }

    const previousExactMatch = DEDUPLICATE ? await findRecentExactDuplicate(contentHash) : null;
    if (previousExactMatch) {
        log.info(
            `Exact rawText duplicate detected for message from ${source} with ID ${messageId} (matches rawMessage ${previousExactMatch.id} on ${previousExactMatch.createdAt.toISOString()}) - Ignoring`
        );

        return null;
    }

    const rawMessage = await createRawMessage(source, messageId, senderId, senderName, senderPhone, group, rawText, contentHash, timestamp, mediaUrl);

    log.info("Created rawMessage:", rawMessage.id, "from group:", rawMessage.group?.name || "unknown");

    // return await processRawMessage(rawMessage);
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

async function createRawMessage(source, messageId, senderId, senderName, senderPhone, group, rawText, contentHash, timestamp, mediaUrl) {
    return await prisma.rawMessage.create({
        data: {
            source,
            messageId,
            senderId,
            senderName,
            senderPhone,
            groupId: group?.id || null,
            rawText,
            contentHash,
            timestamp: timestamp ? new Date(timestamp) : undefined,
            parsingStatus: "PENDING",
            parsingNotes: null,
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
