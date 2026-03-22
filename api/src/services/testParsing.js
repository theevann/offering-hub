/**
 * Standalone test script for the parsing service
 * 
 * Usage:
 *   node api/src/services/testParsing.js
 * 
 * Make sure DEEPSEEK_API_KEY is set in api/.env
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: __dirname + '/../../.env' });
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
  console.log('🧪 Testing Parsing Service\n');
  console.log('========================================\n');

  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    console.log(`   Message: "${testCase.rawMessage.rawText}"`);
    console.log(`   Group: ${testCase.rawMessage.group.name}, ${testCase.rawMessage.group.city}, ${testCase.rawMessage.group.country}`);
    console.log('');

    try {
      const result = await parse(testCase.rawMessage);
      
      console.log('   Result:');
      console.log(`   Category: ${result.parsed.category}`);
      console.log(`   Title: ${result.parsed.title}`);
      console.log(`   Description: ${result.parsed.description?.substring(0, 100)}...`);
      console.log(`   Date (raw): ${result.parsed.date}`);
      console.log(`   Start Time (raw): ${result.parsed.startTime}`);
      console.log(`   End Time (raw): ${result.parsed.endTime}`);
      console.log(`   Pricing Type: ${result.parsed.pricingType}`);
      console.log(`   Price: ${JSON.stringify(result.parsed.price)}`);
      console.log(`   Location: ${result.parsed.location}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Notes: ${result.parsingNotes || 'None'}`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('\n----------------------------------------\n');
  }
}

// Run tests
runTests().catch(console.error);
