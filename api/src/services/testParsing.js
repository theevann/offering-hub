const { createLogger } = require("../utils/logger");
const log = createLogger("testParsing");

/**
 * Standalone test script for the parsing service
 * 
 * Usage:
 *   node api/src/services/testParsing.js
 * 
 * Make sure DEEPSEEK_API_KEY is set in api/.env
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: __dirname + '/../../.env', quiet: true });
}
const { parse } = require('./parsingService');

// Test cases
const testCases = [
    {
        name: 'Yoga class with time and location',
        rawMessage: {
            rawText: 'Tomorrow yoga class at 6pm at Arambol beach. 500 rupees donation.',
            timestamp: new Date(),
            group: { name: 'Arambol Yoga & Wellness', city: 'Arambol', country: 'India', timezone: 'Asia/Kolkata' }
        }
    },
    // {
    //     name: 'Workshop announcement',
    //     rawMessage: {
    //         rawText: 'Sound healing workshop this Saturday 4-6pm at the Yoga Center. 1000 LKR for locals, 2000 LKR for tourists.',
    //         timestamp: new Date(),
    //         group: { name: 'Sri Lanka Wellness', city: 'Unawatuna', country: 'Sri Lanka', timezone: 'Asia/Colombo' }
    //     }
    // },
    // {
    //     name: 'Simple gathering',
    //     rawMessage: {
    //         rawText: 'Beach volleyball tomorrow at 5pm!',
    //         timestamp: new Date(),
    //         group: { name: 'Arambol Sports', city: 'Arambol', country: 'India' }
    //     }
    // },
    // {
    //     name: 'Item for sale',
    //     rawMessage: {
    //         rawText: 'Selling my guitar. Good condition. $150. DM me if interested.',
    //         timestamp: new Date(),
    //         group: { name: 'Arambol Buy & Sell', city: 'Arambol', country: 'India' }
    //     }
    // },
    // {
    //     name: 'Non-offering message',
    //     rawMessage: {
    //         rawText: 'Has anyone seen my sunglasses? I think I left them at the cafe yesterday.',
    //         timestamp: new Date(),
    //         group: { name: 'Arambol Community', city: 'Arambol', country: 'India' }
    //     }
    // }
];

async function runTests() {
  log.info('🧪 Testing Parsing Service\n');
  log.info('========================================\n');

  for (const testCase of testCases) {
    log.info(`📋 Test: ${testCase.name}`);
    log.info(`   Message: "${testCase.rawMessage.rawText}"`);
    log.info(`   Group: ${testCase.rawMessage.group.name}, ${testCase.rawMessage.group.city}, ${testCase.rawMessage.group.country}`);
    log.info('');

    try {
      const result = await parse(testCase.rawMessage);
      
      log.info('   Result:');
      log.info(`   Category: ${result.parsed.category}`);
      log.info(`   Title: ${result.parsed.title}`);
      log.info(`   Description: ${result.parsed.description?.substring(0, 100)}...`);
      log.info(`   Date (raw): ${result.parsed.date}`);
      log.info(`   Start Time (raw): ${result.parsed.startTime}`);
      log.info(`   End Time (raw): ${result.parsed.endTime}`);
      log.info(`   Pricing Type: ${result.parsed.pricingType}`);
      log.info(`   Price: ${JSON.stringify(result.parsed.price)}`);
      log.info(`   Location: ${result.parsed.location}`);
      log.info(`   Status: ${result.status}`);
      log.info(`   Notes: ${result.parsingNotes || 'None'}`);
      
      if (result.error) {
        log.info(`   Error: ${result.error}`);
      }
    } catch (error) {
      log.info(`   ❌ Error: ${error.message}`);
    }

    log.info('\n----------------------------------------\n');
  }
}

// Run tests
runTests().catch(log.error);
