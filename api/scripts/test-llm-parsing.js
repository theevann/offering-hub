const { createLogger } = require("../src/utils/logger");
const log = createLogger("test-llm-parsing");

// Run from any directory: node /path/to/coie/api/scripts/test-llm-parsing.js
// Makes 8 real LLM requests using api/.env. No database or Google Places calls.
const fs = require('node:fs/promises');
const path = require('node:path');

// This manual test deliberately prefers api/.env over inherited shell values.
const envPath = path.join(__dirname, '../.env');
const env = require('dotenv').config({
  path: envPath,
  override: true,
  quiet: true
});
if (env.error) {
  throw new Error(`Could not load environment file: ${envPath}`, { cause: env.error });
}
log.info(`Using environment file: ${envPath}`);

const group = {
  name: 'South Coast Community',
  city: 'Midigama',
  adminArea: 'Southern Province',
  country: 'Sri Lanka',
  timezone: 'Asia/Colombo'
};

// Fixed timestamp so "tomorrow" and weekdays stay comparable between runs.
const timestamp = '2026-09-08T06:30:00.000Z';
const cases = [
  {
    name: 'local-class',
    inspect: 'Extract the explicit city; do not invent a region or country.',
    text: 'Tomorrow at 6pm: Vinyasa yoga at Ocean Studio, Midigama. 90 minutes, 3000 LKR. All levels welcome.'
  },
  {
    name: 'different-city',
    inspect: 'Keep Arugam Bay; do not replace it with the group city.',
    text: 'Join our breathwork workshop at The Yoga Shack, Arugam Bay, this Saturday from 11:00 to 13:00. Price: 4000 LKR.'
  },
  {
    name: 'different-region-country-not-stated',
    inspect: 'Extract Arambol and Goa, but leave country unset.',
    text: 'Yoga Fire in Arambol, Goa is hosting a sound healing gathering on September 20, 2026 at 7pm. Entry by voluntary donation.'
  },
  {
    name: 'explicit-foreign-country',
    inspect: 'Preserve Portugal despite the Sri Lankan group context.',
    text: 'September 18–21, 2026: a meditation retreat at Pine House, Sintra, Portugal. Arrival at 15:00, departure at 12:00. Full retreat: 350 EUR.'
  },
  {
    name: 'venue-only',
    inspect: 'Extract the venue and directions; leave city, region and country unset.',
    text: 'Community potluck tomorrow at 19:00 at Mango House, behind the railway station. Free entry, bring a dish to share!'
  },
  {
    name: 'recurring-online-class',
    inspect: 'Resolve the next Monday from the fixed timestamp; avoid a physical venue.',
    text: 'Every Monday, 11:00–12:00 Sri Lanka time: online mindfulness class on Zoom. 7000 LKR per session. Book at https://example.com/mindfulness'
  },
  {
    name: 'organizer-hometown-vs-event-location',
    inspect: 'Use Ahangama as the event city, not the organizer hometown Paris.',
    text: 'Marie, a teacher from Paris, will lead a massage workshop at Palm Studio, 12 Beach Road, Ahangama on September 12, 2026, 14:00–17:00. Locals: 3000 LKR; visitors: 5000 LKR.'
  },
  {
    name: 'not-an-offering',
    inspect: 'Return PARSED_NOOP.',
    text: 'Has anyone seen my blue sunglasses? I think I left them near the beach yesterday. Please let me know if you find them!'
  }
];

// Observe the LLM boundary in this script's process only. Production code is unchanged.
// llmOutput is decoded model JSON, not the provider's full HTTP response.
const llmService = require('../src/services/llmService');
const originalCallLLM = llmService.callLLM;
let llmOutput = null;
llmService.callLLM = async (...args) => {
  llmOutput = await originalCallLLM(...args);
  return llmOutput;
};
const { parse } = require('../src/services/parsingService');

async function main() {
  const outputRoot = path.join(__dirname, '../../data/parsing-runs');
  await fs.mkdir(outputRoot, { recursive: true });
  const runDirectory = await fs.mkdtemp(path.join(outputRoot, 'run-'));
  log.info(`Saving results to ${runDirectory}`);

  let failures = 0;
  for (const example of cases) {
    const input = { rawText: example.text, timestamp, group, media: [] };
    llmOutput = null;
    const startedAt = new Date();
    // The parsing service already catches errors and returns status FAILED.
    const result = await parse(input);
    if (result.parsingStatus === 'FAILED') failures++;

    const report = {
      name: example.name,
      inspect: example.inspect,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      parserModel: process.env.TEXT_MODELS ?? null,
      input,
      llmOutput,
      result
    };
    await fs.writeFile(
      path.join(runDirectory, `${example.name}.json`),
      JSON.stringify(report, null, 2) + '\n'
    );
    log.info(`${example.name}: ${result.parsingStatus}`);
  }

  log.info(`Saved ${cases.length} results; ${failures} failed. Review: ${runDirectory}`);
  // These are inspection examples, not semantic pass/fail assertions.
  if (failures) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    log.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
