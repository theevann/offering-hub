const crypto = require("crypto");
const prisma = require("../db/prismaClient");
const { callLLM } = require("./llmService");


const EXACT_DEDUP_DAYS = 2

const TITLE_AUTO_DUPLICATE_THRESHOLD = 0.9;
const TITLE_THRESHOLD = 0.6;
const TITLE_COMBINED_THRESHOLD = 0.3;
const DESC_COMBINED_THRESHOLD = 0.6;
const DEDUP_LLM_PROVIDER = 'gpt_oss_120b';


function normalize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text = '') {
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

async function isDuplicate(parsed, startTime, endTime, group) {
  if (!parsed.category || !startTime) return false;

  const existingOfferings = await prisma.offering.findMany({
    where: {
      category: parsed.category,
      startTime,
      endTime: endTime || null,
      rawMessage: {
        group: {
          country: group?.country || null,
        }
      }
    }
  });

  if (existingOfferings.length === 0) return false;

  const scoredOfferings = existingOfferings.map((offering) => {
    const hasBothTitles = Boolean(parsed.title && offering.title);
    const titleScore = hasBothTitles
      ? overlapCoefficient(parsed.title, offering.title)
      : 0;
    const descScore = overlapCoefficient(parsed.description || '', offering.description || '');

    console.log(
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

  if (candidates.some((o) => o.titleScore >= TITLE_AUTO_DUPLICATE_THRESHOLD))
    return true;

  const systemPrompt = `You are an assistant that helps determine if two event offerings are duplicates based on their details.`;

  const userPrompt = `Here is a new offering parsed from a message:\nTitle: ${parsed.title}\nDescription: ${parsed.description}\nStart Time: ${startTime}\nEnd Time: ${endTime}\n\nHere are existing similar offerings:\n${candidates.map(o => o.offering).map(o => `Title: ${o.title}\nDescription: ${o.description}\nStart Time: ${o.startTime}\nEnd Time: ${o.endTime}\n---`).join('\n')}\n\nBased on the details, is the new offering a duplicate of any of the existing offerings? Answer in json format ONLY with a boolean field "isDuplicate" and a "reason" field explaining the decision.`;

  const llmResponse = await callLLM(systemPrompt, userPrompt, provider = DEDUP_LLM_PROVIDER, asJson = true);

  return llmResponse.isDuplicate;
}

function computeRawTextHash(text = "") {
  const normalizedText = normalize(text);
  return crypto.createHash("md5").update(normalizedText).digest("hex");
}

async function findRecentExactDuplicate(rawTextHash) {
  if (!rawTextHash) return null;

  const cutoffDate = new Date(
    Date.now() - EXACT_DEDUP_DAYS * 24 * 60 * 60 * 1000
  );

  return prisma.rawMessage.findFirst({
    where: {
      rawTextHash,
      createdAt: { gte: cutoffDate }
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true }
  });
}

module.exports = {
  isDuplicate,
  computeRawTextHash,
  findRecentExactDuplicate
};