const { createLogger } = require("../utils/logger");
const log = createLogger("processing");

const prisma = require("../db/prismaClient");
const parsingService = require("./parsingService");
const { resolveLocation } = require("./locationService");
const { checkDuplicate } = require("./deduplicationService");
const { formatBatchText, collectBatchMedia, isTrivialBatch } = require("../utils/batchCoalescing");
const { DateTime } = require("luxon");

const DEDUPLICATE = true;
const TRIVIAL_BATCH_MIN_CHARS = 100;


async function processMessageBatch(rawMessages, job) {
    if (!job || job.status !== "PROCESSING") {
        log.warn(`processingJob ${job?.id} is not in PROCESSING state (status: ${job?.status}). Skipping.`);
        return { offerings: [], parsingStatus: job?.parsingStatus, processingJob: job };
    }

    if (!rawMessages || rawMessages.length === 0) {
        throw new Error("Cannot process an empty message batch");
    }

    const primaryMessage = rawMessages[0];
    const group = job.group;
    const batchIds = rawMessages.map(m => m.id);

    log.info(`Processing batch of ${rawMessages.length} message(s) [${batchIds.join(", ")}] from sender ${job.senderId}...`);

    // Collect all media across all messages in the batch
    const allMedia = collectBatchMedia(rawMessages);

    // Construct combined text
    const combinedText = formatBatchText(rawMessages, false);

    // Fast NOOP heuristic: if no media and combined text is trivial, skip LLM
    if (isTrivialBatch(combinedText, allMedia, TRIVIAL_BATCH_MIN_CHARS)) {
        log.info(`Batch from sender ${job.senderId} has no media and < ${TRIVIAL_BATCH_MIN_CHARS} chars ("${combinedText.trim()}") - marking PARSED_NOOP`);

        const updatedJob = await prisma.processingJob.update({
            where: { id: job.id },
            data: {
                combinedText: combinedText || "(empty)",
                parsingModel: "heuristics:short-text",
                parsingStatus: "PARSED_NOOP",
                parsingNotes: "Standalone message too short to contain an offering",
                rawParsedJson: { offerings: [], parsingStatus: "PARSED_NOOP", parsingNotes: "Standalone message too short" },
                status: "COMPLETED",
            }
        });

        return { offerings: [], parsingStatus: "PARSED_NOOP", processingJob: updatedJob };
    }

    // ### PARSING ###
    const { parsedOfferings, parsingStatus, parsingNotes, parsingModel, rawParsedJson } = await parsingService.parse({
        rawText: combinedText,
        media: allMedia,
        timestamp: primaryMessage.timestamp || primaryMessage.createdAt,
        group
    });

    // If parsing failed or was no-op, update job
    if (!["PARSED_OK", "PARSED_PARTIAL"].includes(parsingStatus)) {
        if (parsingStatus === "PARSED_NOOP") {
            log.info(`No-op parsing for batch [${batchIds.join(", ")}] with status: ${parsingStatus}`, parsingNotes ? `\n> Notes: ${parsingNotes}` : "");
        } else {
            log.warn(`Parsing failed for batch [${batchIds.join(", ")}] with status: ${parsingStatus}`, parsingNotes ? `\n> Notes: ${parsingNotes}` : "");
        }

        const updatedJob = await prisma.processingJob.update({
            where: { id: job.id },
            data: {
                combinedText,
                parsingModel,
                parsingStatus,
                parsingNotes,
                lastError: parsingStatus === "FAILED" ? (parsingNotes || "Parsing failed") : null,
                rawParsedJson: rawParsedJson || undefined,
                status: parsingStatus === "FAILED" ? "FAILED" : "COMPLETED",
            }
        });

        return { offerings: [], parsingStatus, processingJob: updatedJob };
    }

    log.info(`Parsed batch [${batchIds.join(", ")}] with status: ${parsingStatus}`);

    // Pre-resolve locations and check duplicates outside transaction to avoid long DB locks
    const preparedOfferings = [];
    for (const parsed of parsedOfferings) {
        const { dates, ...parsedWithoutDates } = parsed;
        const locationInfo = await resolveLocation(parsed.location, group);
        log.debug(`Resolved location for batch [${batchIds.join(", ")}]:`, locationInfo);

        const occurrences = Array.isArray(dates) && dates.length > 0 ? dates : [null];
        for (const date of occurrences) {
            const payload = date ? { ...parsedWithoutDates, ...date } : parsedWithoutDates;
            const offeringData = buildOfferingData(payload, primaryMessage, locationInfo);

            const duplicateCheckResult = DEDUPLICATE ? await checkDuplicate(offeringData, group) : { isDuplicate: false };
            if (DEDUPLICATE && duplicateCheckResult.isDuplicate) {
                log.info(`[${duplicateCheckResult.reason_code}] Duplicate offering ${duplicateCheckResult.matchingOfferingId} detected - Ignoring`);
            } else {
                preparedOfferings.push({ offeringData });
            }
        }
    }

    // Atomic transaction: update processingJob and create Offerings
    const { processingJob, offerings } = await prisma.$transaction(async (tx) => {
        const updatedJob = await tx.processingJob.update({
            where: { id: job.id },
            data: {
                combinedText,
                parsingModel,
                parsingStatus,
                parsingNotes,
                rawParsedJson: rawParsedJson || undefined,
                status: "COMPLETED",
            }
        });

        const createdOfferings = [];
        for (const { offeringData } of preparedOfferings) {
            const created = await tx.offering.create({
                data: {
                    ...offeringData,
                    processingJobId: job.id,
                    media: {
                        connect: allMedia.map(media => ({ id: media.id })),
                    }
                },
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
            createdOfferings.push(created);
        }

        return { processingJob: updatedJob, offerings: createdOfferings };
    });

    offerings.forEach(offering => log.info(`> Created offering: ${offering.title} on ${offering.startTime?.toISOString() || "unknown date"} at venue: ${offering.venue?.displayName || "unknown"}`));

    const parsedLength = parsedOfferings.reduce((acc, parsed) => acc + (parsed.dates?.length || 1), 0);
    log.info(`Parsed: ${parsedLength}, Created: ${offerings.length}, Duplicates: ${parsedLength - offerings.length}`);

    return {
        offerings,
        parsingStatus,
        processingJob
    };
}

function convertToDatetime(date, time, timezone, allowEmptyTime = false) {
    if (!date) return null;
    if (!allowEmptyTime && !time) return null;

    const dateTimeStr = time ? `${date} ${time}` : `${date} 00:00`;
    const dt = DateTime.fromFormat(dateTimeStr, 'yyyy-MM-dd HH:mm', { zone: timezone });
    return dt.isValid ? dt.toJSDate() : null
}

function buildOfferingData(parsed, rawMessage, location, processingJobId = null, now = new Date()) {
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
        topics: parsed.topics,
        title: parsed.title,
        summary: parsed.summary ?? null,
        description: parsed.description,
        startTime,
        endTime,
        startTimePrecision: parsed.startTimePrecision,

        pricingType: parsed.pricingType,
        price: parsed.price,
        resources: parsed.resources,

        locationSource: location.source,
        locationModes: parsed.location?.modes ?? ['unknown'],
        locationText: parsed.location?.rawLocationText ?? null,
        latitude: location.latitude,
        longitude: location.longitude,
        venueId: location.venueId ?? null,

        groupId: rawMessage.groupId,
        processingJobId: processingJobId,

        expiresAt:
            endTime || DateTime.fromJSDate(now).plus({ days: 7 }).toJSDate()
    };
}

module.exports = { processMessageBatch };
