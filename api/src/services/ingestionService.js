const { createLogger } = require("../utils/logger");
const log = createLogger("ingestion");

const prisma = require("../db/prismaClient");
const parsingService = require("./parsingService");
const { resolveLocation } = require("./locationService");
const { isDuplicate, computeHash, findRecentExactDuplicate } = require("./deduplicationService");
const { DateTime } = require("luxon");
const { get } = require("node:http");

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

function convertToDatetime(date, time, timezone, allowEmptyTime = false) {
    if (!date) return null;
    if (!allowEmptyTime && !time) return null;

    const dateTimeStr = time ? `${date} ${time}` : `${date} 00:00`;
    const dt = DateTime.fromFormat(dateTimeStr, 'yyyy-MM-dd HH:mm', { zone: timezone });
    return dt.isValid ? dt.toJSDate() : null
}

// Main function

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

    log.info(`> Ingesting raw message from source: ${source}, messageId: ${messageId}`);

    if (!rawText && !mediaUrl) throw new Error("rawText or mediaUrl is required");
    const contentHash = await computeHash(rawText, mediaUrl);

    // TODO: Comment next line out once we have group management in place, for now we want to ingest all messages to build up our group database
    const group = await getOrCreateGroup(whatsappGroupId, groupName);

    // let group = await prisma.group.findUnique({
    //   where: { sourceId: whatsappGroupId }
    // });

    if (!group) {
        throw new Error(`Group not found: ${whatsappGroupId}`);
    }

    if (rawText.length < 100 && !mediaUrl) {
        log.info(`Raw text too short (${rawText.length} chars) for message ${messageId} - Ignoring`);
        return {
            rawMessage: null,
            offering: null
        };
    }

    const previousExactMatch = DEDUPLICATE ? await findRecentExactDuplicate(contentHash) : null;
    if (previousExactMatch) {
        log.info(
            `Exact rawText duplicate detected for message from ${source} with ID ${messageId} (matches rawMessage ${previousExactMatch.id} on ${previousExactMatch.createdAt.toISOString()}) - Ignoring`
        );

        return {
            rawMessage: null,
            offering: null
        };
    }

    // ### RAW MESSAGE CREATION ###
    const rawMessage = await createRawMessage(source, messageId, senderId, senderName, senderPhone, group, rawText, contentHash, timestamp, mediaUrl);

    log.info("Created rawMessage:", rawMessage.id, "from group:", rawMessage.group?.name || "unknown");


    // ### PARSING ###
    let { parsed, parsingStatus, parsingNotes, parsingModel } = await parsingService.parse(rawMessage);

    // If parsing failed, update rawMessage and return early
    if (!['PARSED_OK', 'PARSED_PARTIAL'].includes(parsingStatus)) {

        await prisma.rawMessage.update({
            where: { id: rawMessage.id },
            data: {
                parsingModel,
                parsingStatus,
                parsingNotes
            }
        });

        log.info(`Parsing failed for message ${rawMessage.id} with status: ${parsingStatus}`, parsingNotes ? `\n> Notes: ${parsingNotes}` : '');

        return {
            rawMessage,
            offering: null
        };
    }


    // ### LOCATION RESOLUTION ###
    const locationInfo = await resolveLocation(parsed.location, group);
    log.debug(`Resolved location for message ${rawMessage.id}:`, locationInfo);

q
    // ### OFFERING CREATION ###
    const offeringData = buildOfferingData(parsed, rawMessage, locationInfo);

    if (DEDUPLICATE ? await isDuplicate(offeringData, group) : false) {
        log.info(`Duplicate offering detected for message ${rawMessage.id} - skipping creation`);

        await prisma.rawMessage.update({
            where: { id: rawMessage.id },
            data: {
                parsingModel,
                parsingStatus: 'DUPLICATE',
                parsingNotes: 'Parsed offering matches an existing offering. Marked as duplicate.'
            }
        })

        return {
            rawMessage,
            offering: null
        };
    }

    offering = await prisma.offering.create({
        data: offeringData
    });

    log.info(`Parsed message ${rawMessage.id} with status: ${parsingStatus}`, offering ? `\n> Created offering: ${offering.id} - ${offering.title}` : '');


    // ### RAW MESSAGE UPDATE ###
    await prisma.rawMessage.update({
        where: { id: rawMessage.id },
        data: {
            parsingModel,
            parsingStatus,
            parsingNotes
        }
    })

    // Return raw message with group info
    return {
        rawMessage,
        offering
    };
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
            parsingStatus: "PROCESSING",
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

function buildOfferingData(parsed, rawMessage, location, now = new Date()) {
    if (!rawMessage.groupId) {
        throw new Error("Cannot create an offering without a group");
    }

    const timezone = rawMessage.group?.timezone || "UTC";

    // A date with neither start nor end time is treated as an all-day event.
    const isAllDay =
        parsed.dateStart &&
        !parsed.startTime &&
        !parsed.endTime &&
        parsed.startTimePrecision === "wholeDay";

    const startTime = convertToDatetime(
        parsed.dateStart,
        isAllDay ? "00:00" : parsed.startTime,
        timezone,
        true
    );

    const endTime = convertToDatetime(
        parsed.dateEnd || parsed.dateStart,
        isAllDay ? "23:59" : parsed.endTime,
        timezone,
        false
    );

    return {
        category: parsed.category,
        title: parsed.title,
        description: parsed.description,
        startTime,
        endTime,
        startTimePrecision: parsed.startTimePrecision,

        pricingType: parsed.pricingType,
        price: parsed.price,
        links: parsed.links,

        locationSource: location.source,
        locationText: parsed.location?.rawLocationText ?? null,
        latitude: location.latitude,
        longitude: location.longitude,
        venueId: location.venueId ?? null,

        groupId: rawMessage.groupId,
        rawMessageId: rawMessage.id,

        expiresAt:
            endTime || DateTime.fromJSDate(now).plus({ days: 7 }).toJSDate()
    };
}

module.exports = { ingestRawMessage };
