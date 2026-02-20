require('dotenv').config();
const { callLLM } = require('./llmService');

// Choose between 'deepseek', 'minimax', 'gpt_oss_120b', 'qwen3'
const PARSER_LLM_PROVIDER = 'gpt_oss_120b';

const VALID_CATEGORIES = ['CLASS', 'WORKSHOP', 'GATHERING', 'SERVICE', 'SALE', 'OTHER'];

const SYSTEM_PROMPT = `You are a message parser. Extract structured data from the given message.
Return ONLY a valid JSON object with these fields:
- category: one of ${VALID_CATEGORIES.map(c => `"${c}"`).join(', ')} (use CLASS for structured recurring sessions like yoga, WORKSHOP for one-off educational events, GATHERING for social events, SERVICE for ongoing offerings, SALE for items for sale, OTHER if unclear)
- title: a short title for the message (max 100 chars)
- description: Summarize the main content/description. Remove WhatsApp specific artifacts.
- date: YYYY-MM-DD if a date is mentioned, null otherwise
- startTime: HH:MM 24H format if a start time is mentioned, null otherwise
- endTime: HH:MM 24H format if an end time or duration is mentioned, null otherwise
- pricingType: one of "free", "fixed", "donation", "range" if price info is mentioned, null otherwise. Note: if a message mention a seemingly mandatory donation amount, treat it as "fixed" pricing type.
- price: object with price details if mentioned, null otherwise. For example:
  - if fixed price: { "amount": 10, "currency": "USD" }
  - if price range: { "minAmount": 5000, "maxAmount": 15000, "currency": "LKR" }
  - if different pricing for different attendees: { "options": [ { "description": "locals", "amount": 5, "currency": "EUR" }, { "description": "tourists", "amount": 15, "currency": "EUR" } ] }
- location: freeform location text if mentioned, null otherwise
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
  const { rawText, msgDatetime } = messageInfo;
  const { groupName, groupCity, groupCountry } = groupInfo;

  const contextParts = [];
  if (groupName) contextParts.push(`Group: "${groupName}"`);
  if (msgDatetime) contextParts.push(`Message Timestamp: ${msgDatetime}`);
  if (groupCity) contextParts.push(`City: ${groupCity}`);
  if (groupCountry) contextParts.push(`Country: ${groupCountry}`);
  
  const contextPrefix = contextParts.length > 0 
    ? `Context (this message is from a WhatsApp group:\n${contextParts.join('\n')}):\n\n` 
    : '';
  
  const userPrompt = `${contextPrefix}Parse this message:\n\n${rawText}`;

  return { system_prompt: SYSTEM_PROMPT, user_prompt: userPrompt };
}

/**
 * Parse a raw message using AI provider
 * @param {Object} rawMessage - The raw message object containing rawText
 * @param {Object} groupInfo - Group information including country and city
 * @returns {Promise<Object>} - Parsed result with status
 */
async function parse({ rawText, timestamp, group }) {
  try {

    const messageInfo = {
      rawText: rawText,
      msgDatetime: formatTimestamp(timestamp, group?.timezone || 'UTC'),
    };
    
    const groupInfo = {
      groupName: group?.name || null,
      groupCity: group?.city || null,
      groupCountry: group?.country || null
    };
    
    // Call AI provider (can be swapped for other providers)
    const { system_prompt, user_prompt } = prepare_prompts(messageInfo, groupInfo);
    const parsedContent = await callLLM(system_prompt, user_prompt, PARSER_LLM_PROVIDER);
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

    const parsed = {
      category: normalizeCategory(parsedContent.category),
      title: parsedContent.title || null,
      description: parsedContent.description || rawText,
      date: parsedContent.date || null,
      startTime: parsedContent.startTime || null,
      endTime: parsedContent.endTime || null,
      pricingType: parsedContent.pricingType || null,
      price: parsedContent.price || null,
      location: parsedContent.location || null,
      latitude: null,
      longitude: null
    };

    return {
      parsed,
      parsingStatus: parsedContent.parsingStatus,
      parsingNotes: parsedContent.parsingNotes || null
    };

  } catch (error) {
    console.error('Parsing error:', error.message);
    
    // Fallback to raw message on error
    return {
      parsed: createDefaultParsed(),
      parsingStatus: "FAILED",
      parsingNotes: error.message
    };
  }
}

module.exports = { parse };
