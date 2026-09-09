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

const SYSTEM_PROMPT = `You are a message parser. Extract structured data from the given message.
Return ONLY a valid JSON object with these fields:
- category: one of ${VALID_CATEGORIES.map(c => `"${c}"`).join(', ')} (use CLASS for structured recurring sessions like yoga, RETREAT for multi-day immersive experiences, WORKSHOP for one-off educational events, GATHERING for social events, SERVICE for ongoing offerings, SALE for items for sale, OTHER if unclear)
- title: a short title for the message (max 100 chars)
- description: Summarize the main content/description. Remove WhatsApp specific artifacts.
- dateStart: YYYY-MM-DD if a starting date is mentioned, null otherwise. If the message mentions a recurrent event (e.g. "every Monday"), return the next upcoming date. If only a day is mentioned (e.g. "this Saturday"), infer the date based on the message timestamp.
- dateEnd: YYYY-MM-DD if an end date is mentioned (e.g. for retreats or sales), null otherwise
- startTime: HH:MM 24H format if a start time is mentioned, null otherwise
- endTime: HH:MM 24H format if an end time or duration is mentioned, null otherwise
- startTimePrecision: one of "unknown", "wholeDay", "fixedTime" (use "unknown" if no time is mentioned, "wholeDay" if the message implies an all-day event, and "fixedTime" if a specific time is mentioned)
- pricingType: one of "free", "fixed", "donation", "range" if price info is mentioned, null otherwise. Note: if a message mention a seemingly mandatory donation amount, treat it as "fixed" pricing type.
- price: object with price details if mentioned, null otherwise. For example:
  - if fixed price: { "amount": 10, "currency": "USD" }
  - if price range: { "minAmount": 5000, "maxAmount": 15000, "currency": "LKR" }
  - if different pricing for different attendees: { "options": [ { "description": "locals", "amount": 5, "currency": "EUR" }, { "description": "tourists", "amount": 15, "currency": "EUR" } ] }
- location: an object with:
  - locationName: the name of the place where the offering takes place
  - addressFragment: street address, neighborhood, or directions, EXCLUDING city, administrative area, and country
  - city: explicitly mentioned city or town
  - adminArea: explicitly mentioned administrative area, such as a
    state, province, or region
  - country: explicitly mentioned country
  - url: a location URL provided in the message (e.g. Google Maps link)
  - rawLocationText: the original text describing the offering's location
Use null for missing fields. Extract the location of the offering, not an unrelated location mentioned in the message. Do not fill location fields from the WhatsApp group context. DO NOT INFER MISSING GEOGRAPHICAL FIELDS FROM YOUR GENERAL KNOWLEDGE. Preserve explicit location information even when it differs from the group.
- links: array of objects with { "url": "", "type": ""} for any relevant links mentioned in the message. Type should be one of "maps", "booking", "social", "website", "other" based on the content of the link.
- parsingStatus: "PARSED_OK" if all key info is extracted, "PARSED_PARTIAL" if some info is missing, "PARSED_NOOP" if message is not an offering, "FAILED" if parsing failed
- parsingNotes: optional field for any notes about the parsing status

Only return the JSON object, do not include any explanatory text. If the message does not contain an offering or relevant info, return a JSON object with all fields null except category which should be "OTHER" and parsingStatus which should be "PARSED_NOOP".
Do not include any text outside the JSON object, do not include any formatting, only return the raw JSON.`;


/**
 * Create a default parsed object with raw text
 * @param {string} rawText - The raw message text
 * @returns {Object} - Default parsed object
 */
function createDefaultParsed() {
    return {
        category: 'OTHER',
        title: null,
        description: null,
        date: null,
        startTime: null,
        endTime: null,
        pricingType: null,
        price: null,
        location: null,
        latitude: null,
        longitude: null
    };
}

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
        const parsedContent = await callLLM(system_prompt, user_prompt, { models: models, images: media, asJson: true });

        // const parsedContent = {
        //   "category": "GATHERING",
        //   "title": "Acro Jam Session & Aerials",
        //   "description": "Mini Acro Jam with possible aerial activities. At the usual spot ! we're waiting you",
        //   "date": "2026-02-20",
        //   "startTime": "09:00",
        //   "endTime": null,
        //   "pricingType": null,
        //   "price": null,
        //   "location": "coconut beach",
        //   "parsingStatus": "PARSED_PARTIAL",
        //   "parsingNotes": "Date inferred from 'tomorrow' relative to message timestamp (2026-02-19). No pricing or end time mentioned."
        // };

        // const parsedContent = {
        //   "category": "CLASS",
        //   "title": "Kundalini Activation Shaktipat Session",
        //   "description": "A Kundalini Activation Shaktipat session guided by David Tur at Zenky House in Ahangama on March 10, 2026 from 17:00 to 19:00. Participants lie down and receive energy transmission to release blockages. No prior experience required; arrive 15 minutes early. Energy exchange fee 5,000 LKR.",
        //   "date": "2026-03-10",
        //   "startTime": "17:00",
        //   "endTime": "19:00",
        //   "pricingType": "fixed",
        //   "price": {
        //     "amount": 5000,
        //     "currency": "LKR"
        //   },
        //   "location": {
        //     "locationName": "Zenky House",
        //     "addressFragment": "",
        //     "city": "",
        //     "adminArea": "",
        //     "country": "",
        //     "url": "https://maps.app.goo.gl/pw8ysuQnobCcgMsMA",
        //     "isVenueLikelihood": 0.9,
        //     "rawLocationText": "Zenky House – Ahangama"
        //   },
        //   "links": [
        //     {
        //       "url": "https://www.instagram.com/kundaliniserpent/",
        //       "type": "social"
        //     }
        //   ],
        //   "parsingStatus": "PARSED_OK",
        //   "parsingModel": "gemini_3_5_flash_lite",
        //   "parsingNotes": ""
        // };

        //   const parsedContent = {
        //     "category": "CLASS",
        //     "title": "Weekly Yoga Schedule at The Yoga Shack 07/09-13/09",
        //     "description": "Weekly schedule at The Yoga Shack 07/09-13/09: Daily Vinyasa Flow at 9:30 and Slow Flow at 5:30. Specials: Conscious Connected Breathwork Wednesday 11am, Psychedelic Breathwork Saturday 11am, Massage Workshop Saturday 4pm, Poetic Yin Yoga Sunday 11am. Community Sound Healing & Potluck Monday 7pm (dinner 8pm) free, bring something to share. Kirtan Singing Circle Thursday 7:30pm. Prices: Yoga 3000 LKR, Breathwork 4000 LKR, Kirtan donation-based, Community workshop free. All levels welcome.",
        //     "dateStart": "2026-09-07",
        //     "dateEnd": "2026-09-13",
        //     "startTime": "09:30",
        //     "endTime": null,
        //     "pricingType": "fixed",
        //     "price": {
        //         "options": [
        //             {
        //                 "description": "Yoga",
        //                 "amount": 3000,
        //                 "currency": "LKR"
        //             },
        //             {
        //                 "description": "Breathwork",
        //                 "amount": 4000,
        //                 "currency": "LKR"
        //             }
        //         ]
        //     },
        //     "location": {
        //         "locationName": "The Yoga Shack",
        //         "addressFragment": "",
        //         "url": "",
        //         "isVenueLikelihood": 0.9,
        //         "rawLocationText": "This week’s schedule at the Yoga Shack"
        //     },
        //     "links": [],
        //     "parsingStatus": "PARSED_OK",
        //     "parsingNotes": "Weekly schedule with multiple events and mixed pricing: Yoga fixed 3000 LKR, Breathwork fixed 4000 LKR, Kirtan donation-based, Community Potluck free. StartTime reflects daily morning class; multiple other times in description."
        // }

        const parsed = {
            category: normalizeCategory(parsedContent.category),
            title: parsedContent.title || null,
            description: parsedContent.description || null,
            dateStart: parsedContent.dateStart || null,
            dateEnd: parsedContent.dateEnd || null,
            startTime: parsedContent.startTime || null,
            endTime: parsedContent.endTime || null,
            startTimePrecision: parsedContent.startTimePrecision || null,
            pricingType: parsedContent.pricingType || null,
            price: parsedContent.price || null,
            location: parsedContent.location || null,
            links: parsedContent.links || null,
            latitude: null,
            longitude: null
        };

        return {
            parsed,
            parsingModel: parsedContent.parsingModel,
            parsingStatus: parsedContent.parsingStatus,
            parsingNotes: parsedContent.parsingNotes || null
        };

    } catch (error) {
        log.error('Parsing error:', error.message);

        // Fallback to raw message on error
        return {
            parsed: createDefaultParsed(),
            parsingModel: null,
            parsingStatus: "FAILED",
            parsingNotes: error.message
        };
    }
}

module.exports = { parse };
