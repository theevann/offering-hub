const prisma = require("../db/prismaClient");
const parsingService = require("./parsingService");
const { resolveLocation } = require("./locationService");
const { isDuplicate, computeRawTextHash, findRecentExactDuplicate } = require("./deduplicationService");
const { DateTime } = require("luxon");

const DEDUPLICATE = false;

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
  city: 'Midigama',
  adminArea: 'Southern Province',
  latitude: 5.965235,
  longitude: 80.39111,
  timezone: 'Asia/Colombo'
};

async function getOrCreateGroup(whatsappId, groupName) {
  if (!whatsappId) return null;

  // Try to find existing group
  let group = await prisma.group.findUnique({
    where: { whatsappId }
  });

  if (!group) {
    // Create new group with default location
    group = await prisma.group.create({
      data: {
        whatsappId,
        name: groupName || whatsappId,
        type: DEFAULT_GROUP_LOCATION.type,
        country: DEFAULT_GROUP_LOCATION.country,
        adminArea: DEFAULT_GROUP_LOCATION.adminArea,
        city: DEFAULT_GROUP_LOCATION.city,
        latitude: DEFAULT_GROUP_LOCATION.latitude,
        longitude: DEFAULT_GROUP_LOCATION.longitude,
        timezone: DEFAULT_GROUP_LOCATION.timezone
      }
    });
    console.log(`Created new group: ${group.name} (${group.whatsappId}) centered at ${group.city}, ${group.country}`);
  }

  return group;
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
    msgTimestamp: timestamp
  } = data;

  if (!rawText) throw new Error("rawText is required");
  const rawTextHash = computeRawTextHash(rawText);

  // TODO: Comment next line out once we have group management in place, for now we want to ingest all messages to build up our group database
  const group = await getOrCreateGroup(whatsappGroupId, groupName);
  
  // let group = await prisma.group.findUnique({
  //   where: { whatsappId: whatsappGroupId }
  // });
  //
  // if (!group) {
  //   throw new Error(`Group not found: ${whatsappGroupId}`);
  // }

  if (rawText.length < 50) {
    console.log(`Raw text too short (${rawText.length} chars) for message ${messageId} - Ignoring`);
    return {
      rawMessage: null,
      offering: null
    };
  }
  
  const previousExactMatch = DEDUPLICATE ? await findRecentExactDuplicate(rawTextHash) : null;
  if (previousExactMatch) {
    console.log(
      `Exact rawText duplicate detected for message with ${source} ID ${messageId} (matches rawMessage ${previousExactMatch.id} on ${previousExactMatch.createdAt.toISOString()}) - Ignoring`
    );
    return {
      rawMessage: null,
      offering: null
    };
  }

  // Save raw message with group relation
  const rawMessage = await prisma.rawMessage.create({
    data: {
      source,
      messageId,
      senderId,
      senderName,
      senderPhone,
      groupId: group?.id || null,
      rawText,
      rawTextHash,
      timestamp: timestamp ? new Date(timestamp) : undefined,
      parsingStatus: "PROCESSING",
      parsingNotes: null
    },
    include: { group: true }
  });

  console.log('\nCreated rawMessage:', rawMessage.id, 'from group:', rawMessage.group?.name || 'unknown');

  let { parsed, parsingStatus, parsingNotes } = await parsingService.parse(rawMessage);

  let offering = null;
  if (['PARSED_OK', 'PARSED_PARTIAL'].includes(parsingStatus)) {
    const timezone = rawMessage.group?.timezone || 'UTC';
    const startTime = convertToDatetime(parsed.date, parsed.startTime, timezone, true);
    const endTime = convertToDatetime(parsed.date, parsed.endTime, timezone, false);
    const offeringGroupId = rawMessage.groupId || group?.id || null;

    if (!offeringGroupId) {
      throw new Error(`Cannot create offering without groupId for rawMessage ${rawMessage.id}`);
    }

    const locationInfo = await resolveLocation(parsed.location, group);

    const offeringExists = DEDUPLICATE ? await isDuplicate(parsed, startTime, endTime, group, locationInfo) : false;
    if (!offeringExists) {

      offering = await prisma.offering.create({
        data: {
          category: parsed.category,
          title: parsed.title,
          description: parsed.description,
          startTime,
          endTime,
          pricingType: parsed.pricingType,
          price: parsed.price,
          links: parsed.links,
          locationSource: locationInfo.source,
          locationText: parsed.location.rawLocationText,
          latitude: locationInfo.latitude,
          longitude: locationInfo.longitude,
          venueId: locationInfo.venueId ?? null,
          groupId: offeringGroupId,
          rawMessageId: rawMessage.id,
          expiresAt: endTime || DateTime.now().plus({ days: 7 }).toJSDate()
        }
      });

      console.log(`Parsed message ${rawMessage.id} with status: ${parsingStatus}`, offering ? `Created offering: ${offering.id} - ${offering.title}` : '');
    } else {
      console.log(`Duplicate offering detected for message ${rawMessage.id} - skipping creation`);
      parsingStatus = 'DUPLICATE';
      parsingNotes = 'Parsed offering matches an existing offering based on category, location, date and time. Marked as duplicate.';
    }
  }

  
  await prisma.rawMessage.update({
    where: { id: rawMessage.id },
    data: {
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

module.exports = { ingestRawMessage };
