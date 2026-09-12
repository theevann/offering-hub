const { createLogger } = require("../utils/logger");
const log = createLogger("processing");

const prisma = require("../db/prismaClient");
const parsingService = require("./parsingService");
const { resolveLocation } = require("./locationService");
const { checkDuplicate } = require("./deduplicationService");
const { DateTime } = require("luxon");
// const { get } = require("node:http");

const DEDUPLICATE = true;


async function processRawMessage(rawMessage) {
    // ### PARSING ###
    let { parsedOfferings, parsingStatus, parsingNotes, parsingModel } = await parsingService.parse(rawMessage);

    // If parsing failed, update rawMessage and return early
    if (!['PARSED_OK', 'PARSED_PARTIAL'].includes(parsingStatus)) {
        if (parsingStatus === 'PARSED_NOOP') {
            log.info(`No-op parsing for message ${rawMessage.id} with status: ${parsingStatus}`, parsingNotes ? `\n> Notes: ${parsingNotes}` : '');
        } else {
            log.warn(`Parsing failed for message ${rawMessage.id} with status: ${parsingStatus}`, parsingNotes ? `\n> Notes: ${parsingNotes}` : '');
        }

        await prisma.rawMessage.update({
            where: { id: rawMessage.id },
            data: {
                parsingModel,
                parsingStatus,
                parsingNotes
            }
        });

        return { offerings: [], parsingStatus };
    }

    log.info(`Parsed message ${rawMessage.id} with status: ${parsingStatus}`);


    // ### OFFERING CREATION ###
    // Parallel creation - Warn: no handling of "dates" field
    // const offerings = (
    //     await Promise.all(parsedOfferings.map(parsed => createOfferingFromParsed(parsed, rawMessage, group)))
    // ).flat()
    
    // offerings.forEach(offering => log.info(`Created offering: ${offering.title} on ${offering.startTime} at venue: ${offering.venue?.displayName || 'unknown'}`));

    // Sequential creation
    const offerings = [];
    const parsedLength = parsedOfferings.reduce((acc, parsed) => acc + (parsed.dates?.length || 0), 0);

    for (const parsed of parsedOfferings) {
        const createdOfferings = await createOfferingFromParsed(parsed, rawMessage);
        offerings.push(...createdOfferings);
    }

    offerings.forEach(offering => log.info(`> Created offering: ${offering.title} on ${offering.startTime?.toISOString() || 'unknown date'} at venue: ${offering.venue?.displayName || 'unknown'}`));

    log.info(`Parsed: ${parsedLength}, Created: ${offerings.length}, Duplicates: ${parsedLength - offerings.length}`);

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
        offerings,
        parsingStatus
    };
}

function convertToDatetime(date, time, timezone, allowEmptyTime = false) {
    if (!date) return null;
    if (!allowEmptyTime && !time) return null;

    const dateTimeStr = time ? `${date} ${time}` : `${date} 00:00`;
    const dt = DateTime.fromFormat(dateTimeStr, 'yyyy-MM-dd HH:mm', { zone: timezone });
    return dt.isValid ? dt.toJSDate() : null
}

async function createOfferingFromParsed(parsed, rawMessage) {
    const offerings = [];
    const dates = parsed.dates;
    parsed.dates = undefined;

    const locationInfo = await resolveLocation(parsed.location, rawMessage.group);
    log.debug(`Resolved location for message ${rawMessage.id}:`, locationInfo);
    
    for (const date of dates) {
        const offering = await createOffering({ ...parsed, ...date }, locationInfo, rawMessage, rawMessage.group);
        if (offering) {
            offerings.push(offering);
        }
    }
    return offerings;
}

async function createOffering(parsed, locationInfo, rawMessage, group) {
    // ### OFFERING DATA PREP ###
    const offeringData = buildOfferingData(parsed, rawMessage, locationInfo);

    // ### DEDUPLICATION CHECK ###
    const duplicateCheckResult = DEDUPLICATE ? await checkDuplicate(offeringData, group) : { isDuplicate: false };
    if (DEDUPLICATE ? duplicateCheckResult.isDuplicate : false) {
        log.info(`[${duplicateCheckResult.reason_code}] Duplicate offering ${duplicateCheckResult.matchingOfferingId} detected for message ${rawMessage.id} - Ignoring`);
        return null;
    }

    // ### OFFERING CREATION ###
    return await prisma.offering.create({
        data: offeringData,
        select: {
            id: true,
            title: true,
            startTime: true,
            venue: {
                select: {
                    displayName: true,
                },
            },
        },
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
        contactInfo: parsed.contactInfo,

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

module.exports = { processRawMessage };
