const { createLogger } = require("../utils/logger");
const log = createLogger("parsing");

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ quiet: true })
}
const { readModelList, callLLM } = require('./llmService');

const TEXT_MODELS = readModelList("TEXT_MODELS");
const VISION_MODELS = readModelList("VISION_MODELS");
log.info(`Using ${TEXT_MODELS.join(", ")} for message parsing`)
log.info(`Using ${VISION_MODELS.join(", ")} for vision processing`)

const VALID_CATEGORIES = ['CLASS', 'RETREAT', 'WORKSHOP', 'GATHERING', 'SERVICE', 'SALE', 'RENTAL', 'OTHER'];

const SYSTEM_PROMPT = `Extract offerings from the message and any attached images. Return only valid JSON:
{
  "offerings": [],
  "parsingStatus": "PARSED_OK",
  "parsingNotes": null
}

Splitting and recurrence rules:

- Extract each distinct event or listing as a separate offering.
- Group occurrences into ONE offering when they differ only in dates or times. If title, activity, location, pricing, or other offering-level details differ, keep them separate.
- Every occurrence MUST have its own object in dates. NEVER represent a recurring schedule as one continuous date range.
- With explicit date bounds, expand every matching occurrence within those bounds, inclusive.
- Without explicit date bounds, expand recurrence over the 7 calendar dates from the message date through message date + 6 days, inclusive. Use this same window for "this week" unless explicit dates specify otherwise.
- Example: "Yoga daily: Vinyasa at 9am and Slow Flow at 5pm", timestamp 2026-09-20, produces 2 offerings, each with 7 dates entries covering September 20–26. Each entry has dateStart = dateEnd = its session date.
- Keep a single multi-day retreat or one event's internal agenda together, using one dates entry covering the event.
- Merge duplicate descriptions and occurrences across text and images.
- Copy shared details only when they clearly apply.

Each offering must contain:

- category: one of ${VALID_CATEGORIES.map(c => `"${c}"`).join(', ')}. CLASS for recurring structured sessions; RETREAT for multi-day immersive experiences; WORKSHOP for one-off educational events; GATHERING for social events; SERVICE for ongoing services; SALE for items for sale; RENTAL for rentals; OTHER if unclear.
- title: concise, max 100 characters.
- description: summarize this offering only; remove WhatsApp artifacts.
- dates: array of occurrence objects, ordered chronologically. Each object contains:
  - dateStart, dateEnd: YYYY-MM-DD or null. Infer relative dates and omitted years from the message timestamp. dateEnd is this occurrence's end date, normally dateStart for a single-day event.
  - startTime, endTime: HH:MM, 24-hour format, or null. Derive end time/date from explicit duration when possible.
  - startTimePrecision: "unknown", "wholeDay", or "fixedTime". Use "wholeDay" only when explicitly stated or clearly implied; missing time alone means "unknown".
- pricingType: "free", "fixed", "donation", "range", or null. Treat a mandatory donation amount as fixed.
- price: null or an object, e.g. {"amount":10,"currency":"USD"}, {"minAmount":5000,"maxAmount":15000,"currency":"LKR"}, or {"options":[{"description":"locals","amount":5,"currency":"EUR"}]}.
- location: object containing locationName, addressFragment, city, adminArea, country, url, rawLocationText. Fill only explicitly mentioned location details for this offering; never infer geography from group context or general knowledge. addressFragment excludes city, adminArea, and country. rawLocationText preserves the original location wording. Use null for missing fields.
- links: array of {"url":"...","type":"maps|booking|social|website|other"} relevant to this offering.
- contactInfo: array of {"type":"phone|email|whatsapp|telegram|other","value":"..."} relevant to this offering.

Use null for missing values and [] for missing links or contactInfo. Use dates: [] for listings without any stated event or schedule. For an event with an unknown date, include one dates object with the known details and null for missing values. Do not invent occurrences. If the message timestamp is missing, leave dates that depend on it null and explain in parsingNotes.

parsingStatus:
- PARSED_OK: all offerings and occurrences extracted with their key details.
- PARSED_PARTIAL: offerings extracted, but key details are missing or ambiguous, or extraction is incomplete.
- PARSED_NOOP: no relevant offerings; return offerings: [].

Use parsingNotes for concise explanations of missing details, ambiguity, or incomplete extraction; otherwise null.

Before returning, silently count the expected occurrences of every recurring schedule and verify that each has its own dates entry.
Return no Markdown or text outside the JSON object.`;


/**
 * Validate and normalize category
 * @param {string} category - The category to validate
 * @returns {string} - Valid category or 'OTHER'
 */
function normalizeCategory(category) {
    if (!category) return 'OTHER';
    const upper = category.toUpperCase();
    return VALID_CATEGORIES.includes(upper) ? upper : 'OTHER';
}

/**
 * Format timestamp to a readable string in the given timezone
 * @param {string|number|Date} timestamp - The timestamp to format
 * @param {string} timezone - The IANA timezone string (e.g. 'Asia/Kolkata')
 * @returns {string} - Formatted date and time string
 */
function formatTimestamp(timestamp, timezone) {
    const date = new Date(timestamp);

    const options = {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };

    return new Intl.DateTimeFormat('en-US', options).format(date);
}

/**
 * Prepare system and user prompts for the AI provider
 * @param {Object} messageInfo - Information about the message (rawText, msgDatetime)
 * @param {Object} groupInfo - Information about the group (groupName, groupCity, groupCountry)
 * @returns {Object} - Object containing system_prompt and user_prompt
 */
function prepare_prompts(messageInfo, groupInfo) {
    const { rawText, medias, msgDatetime } = messageInfo;
    const { groupName, groupCity, groupArea, groupCountry } = groupInfo;

    const contextParts = [];
    if (groupName) contextParts.push(`Group: "${groupName}"`);
    if (msgDatetime) contextParts.push(`Message Timestamp: ${msgDatetime}`);
    if (groupCountry) contextParts.push(`Group Country: ${groupCountry}`);
    if (groupArea) contextParts.push(`Group Area: ${groupArea}`);
    if (groupCity) contextParts.push(`Group City: ${groupCity}`);

    const contextPrefix = contextParts.length > 0
        ? `Context (this message is from a WhatsApp group:\n${contextParts.join('\n')}):\n\n`
        : '';

    const imagePrefix = medias && medias.length > 0 ? `This message also contains ${medias.length} image(s) that may contain relevant information.\n\n` : '';

    const userPrompt = `${contextPrefix}${imagePrefix}Parse this message:\n\n${rawText}`;

    return { system_prompt: SYSTEM_PROMPT, user_prompt: userPrompt };
}

/**
 * Parse a raw message using AI provider
 * @param {Object} rawMessage - The raw message object containing rawText
 * @param {Object} groupInfo - Group information including country and city
 * @returns {Promise<Object>} - Parsed result with status
 */
async function parse({ rawText, media, timestamp, group }) {
    try {
        const messageInfo = {
            rawText: rawText,
            medias: media,
            msgDatetime: formatTimestamp(timestamp, group?.timezone || 'UTC'),
        };

        const groupInfo = {
            groupName: group?.name || null,
            groupCity: group?.city || null,
            groupArea: group?.adminArea || null,
            groupCountry: group?.country || null
        };

        // Call AI provider (can be swapped for other providers)
        const { system_prompt, user_prompt } = prepare_prompts(messageInfo, groupInfo);
        const models = media?.length > 0 ? VISION_MODELS : TEXT_MODELS;
        const llmOutput = await callLLM(system_prompt, user_prompt, { models: models, images: media, asJson: true });

        const parsedOfferings = llmOutput.offerings.map(event => ({
            category: normalizeCategory(event.category),
            title: event.title || null,
            description: event.description || null,
            dates: event.dates.map(date => ({
                dateStart: date.dateStart || null,
                dateEnd: date.dateEnd || null,
                startTime: date.startTime || null,
                endTime: date.endTime || null,
                startTimePrecision: date.startTimePrecision || null
            })),
            pricingType: event.pricingType || null,
            price: event.price || null,
            location: event.location || null,
            links: event.links || null,
            contactInfo: event.contactInfo || null,
            latitude: null,
            longitude: null
        }));

        return {
            parsedOfferings: parsedOfferings,
            parsingModel: llmOutput.parsingModel,
            parsingStatus: llmOutput.parsingStatus,
            parsingNotes: llmOutput.parsingNotes || null
        };

    } catch (error) {
        log.error('Parsing error:', error.message);

        // Fallback to raw message on error
        return {
            parsedOfferings: [],
            parsingModel: null,
            parsingStatus: "FAILED",
            parsingNotes: error.message
        };
    }
}

module.exports = { parse };
