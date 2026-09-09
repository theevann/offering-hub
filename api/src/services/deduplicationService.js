const fs = require("node:fs/promises");
const path = require('path');
const crypto = require("crypto");

const prisma = require("../db/prismaClient");
const { readModelList, callLLM } = require("./llmService");
const { createLogger } = require("../utils/logger");
const log = createLogger("deduplication");


const EXACT_DEDUP_DAYS = 2
const DEDUP_MODELS = readModelList("DEDUP_MODELS");
const STORAGE_PATH = process.env.STORAGE_PATH;

const TITLE_THRESHOLD = 0.6;
const TITLE_COMBINED_THRESHOLD = 0.3;
const DESC_COMBINED_THRESHOLD = 0.6;

log.info(`Using ${DEDUP_MODELS.join(", ")} for message deduplication.`)


function normalize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalize(text).split(' ').filter(Boolean);
}

function overlapCoefficient(a, b) {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));

    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token)) intersection++;
    }

    return intersection / Math.min(setA.size, setB.size);
}

function compareDates(date1, date2, toleranceMinutes = 0) {
    if (!date1 || !date2) return "unknown";

    const diff = Math.abs(date1 - date2);
    const toleranceMs = toleranceMinutes * 60 * 1000;

    if (diff <= toleranceMs) return "compatible";
    else return "conflicting";
}

function prepareCandidateData(offering) {
    return {
        id: offering.id,
        title: offering.title,
        description: offering.description,
        venueName: offering.venue?.displayName ?? null,
        startTime: offering.startTime,
        endTime: offering.endTime
    };
}

async function getNearbyOfferings(latitude, longitude, radiusMeters = 5000) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        return null;

    return await prisma.$queryRaw`
        SELECT id
        FROM "Offering"
        WHERE ST_DWithin(
            location,
            ST_SetSRID(
                ST_MakePoint(${longitude}, ${latitude}),
                4326
            )::geography,
            ${radiusMeters}
        )`;
}

// Probably should end up being category specific, especially with SALES/RENTAL ...
// Maybe let LLM flag some offerings for manual review if it is unsure
// A slight change may also mean it is an updated offering (changes in time or location)
async function isDuplicate(offeringData, group) {
    const startDateFilter = offeringData.startTime
        ? { OR: [{ startTime: null }, { startTime: offeringData.startTime }] } : {};

    const endDateFilter = offeringData.endTime
        ? { OR: [{ endTime: null }, { endTime: offeringData.endTime }] } : {};

    // TODO: Here 14 days - make this configurable, category specific, app wise coherent
    const historyCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const historyFilter = offeringData.startTime
        ? { OR: [{ startTime: { not: null } }, { createdAt: { gte: historyCutoff } }] }
        : { createdAt: { gte: historyCutoff } };

    const { latitude, longitude } = offeringData;
    const nearbyOfferings = await getNearbyOfferings(latitude, longitude, 5000);
    const locationFilter = nearbyOfferings === null ? {} : {
        id: { in: nearbyOfferings.map(offering => offering.id) }
    };

    let compatibleOfferings = await prisma.offering.findMany({
        where: {
            AND: [
                startDateFilter,
                endDateFilter,
                historyFilter,
                locationFilter,
            ],
        },
        include: {
            venue: {
                select: { displayName: true }
            }
        }
    });
    if (compatibleOfferings.length === 0) return false;

    log.debug(compatibleOfferings.map(o => prepareCandidateData(o)));

    // Filter with date if startTime and endTime are provided
    // compatibleOfferings = compatibleOfferings.filter(o => {
    //     return compareDates(o.startTime, offeringData.startTime) !== "conflicting" && compareDates(o.endTime, offeringData.endTime) !== "conflicting";
    // });
    // if (compatibleOfferings.length === 0) return false;

    // Check for exact matches with title, category, venueId, startTime, endTime all matching exactly
    const exactMatch = compatibleOfferings.find(o =>
        overlapCoefficient(o.title, offeringData.title) === 1 &&
        (o.venueId ?? false) && (o.startTime ?? false) &&
        o.venueId === offeringData.venueId &&
        o.category === offeringData.category &&
        o.startTime?.getTime() === offeringData.startTime?.getTime() &&
        o.endTime?.getTime() === offeringData.endTime?.getTime()
    );

    if (exactMatch) {
        log.info(`Exact match found with existing offering ${exactMatch.id} (${exactMatch.title})`);
        return true;
    }

    // Score each existing offering against the new offering using overlap coefficient for title and description
    const scoredOfferings = compatibleOfferings.map((offering) => {
        const hasBothTitles = Boolean(offeringData.title && offering.title);
        const titleScore = hasBothTitles
            ? overlapCoefficient(offeringData.title, offering.title)
            : 0;
        const descScore = overlapCoefficient(offeringData.description || '', offering.description || '');

        log.debug(
            `Dedup scores with existing offering ${offering.id} (${offering.title}): titleScore=${titleScore.toFixed(2)} descScore=${descScore.toFixed(2)}`
        );

        return { offering, titleScore, descScore };
    });

    const candidates = scoredOfferings.filter(
        (o) =>
            o.titleScore >= TITLE_THRESHOLD ||
            (o.titleScore >= TITLE_COMBINED_THRESHOLD &&
                o.descScore >= DESC_COMBINED_THRESHOLD)
    );
    if (candidates.length === 0) return false;

    // Limit to top 5 candidates by combined score
    const topCandidates = candidates
        .sort((a, b) => (b.titleScore + b.descScore) - (a.titleScore + a.descScore))
        .slice(0, 5);

    const candidateData = topCandidates.map(({ offering }) => prepareCandidateData(offering));
    let offeringDataForLLM = prepareCandidateData(offeringData);

    log.debug("Potential duplicates sent to LLM for deduplication:", {
        newOffering: offeringDataForLLM,
        candidates: candidateData
    });

    // Query DB with venueId to get name of the venue for the new offering
    offeringDataForLLM.venueName = offeringData.venueId
        ? (await prisma.venue.findUnique({
            where: { id: offeringData.venueId },
            select: { displayName: true }
        }))?.displayName || "Unknown"
        : "Unknown";

    const systemPrompt = `You are an assistant that helps determine whether the new offering describes the same event occurrence or listing as one of the candidates`;

    const userPrompt = `Here is a new offering parsed from a message:
${JSON.stringify(offeringDataForLLM, null, 2)}
---
Existing candidates:
${JSON.stringify(candidateData, null, 2)}

Based on the details, is the new offering a duplicate of any of the existing candidates? Answer in json format ONLY with:
- isDuplicate: boolean
- matchingOfferingId: the exact ID of the matching candidate or null
- reason: a short explanation
`;

    log.debug(`Deduplication LLM prompt:\nSystem: ${systemPrompt}\n\nUser: ${userPrompt}`);

    const response = await callLLM(systemPrompt, userPrompt, { models: DEDUP_MODELS, asJson: true });

    log.info(`LLM deduplication response: ${JSON.stringify(response, null, 2)}`);

    // LLM response validation

    if (!response || typeof response.isDuplicate !== "boolean") {
        throw new Error("Invalid deduplication response");
    }

    if (response.isDuplicate && !candidateData.some(
        c => c.id === response.matchingOfferingId)
    ) {
        throw new Error("Deduplication returned an unknown candidate ID");
    }

    if (!response.isDuplicate && response.matchingOfferingId !== null) {
        throw new Error("Non-duplicate response must have a null matching ID");
    }

    // TODO: Change return type to include the matchingOfferingId and reason for better logging and debugging
    return response.isDuplicate;
}


async function computeHash(text, mediaUrl) {
    const hash = crypto.createHash("md5").update(normalize(text));

    if (mediaUrl) {
        const mediaPath = path.join(STORAGE_PATH, mediaUrl);
        hash.update(await fs.readFile(mediaPath));
    }

    return hash.digest("hex");
}

async function findRecentExactDuplicate(contentHash) {
    if (!contentHash) return null;

    const cutoffDate = new Date(
        Date.now() - EXACT_DEDUP_DAYS * 24 * 60 * 60 * 1000
    );

    log.info(`Checking for recent duplicates with hash ${contentHash} since ${cutoffDate.toISOString()}`);

    return prisma.rawMessage.findFirst({
        where: {
            contentHash: contentHash,
            createdAt: { gte: cutoffDate },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true }
    });
}

module.exports = {
    isDuplicate,
    computeHash,
    findRecentExactDuplicate
};