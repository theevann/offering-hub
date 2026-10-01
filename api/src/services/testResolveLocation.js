const { createLogger } = require("../utils/logger");
const log = createLogger("testResolveLocation");

// testResolveLocation.js
const { resolveLocation, normalizeLocation, searchAliases, buildVenueScope } = require("./locationService");

async function run() {
  const parsedLocation = {
    // venueName: "Unsung",
    // venueName: "Unsung café",
    // venueName: "Sênses yoga",
    venueName: "# yoga shack",
    // address: "Weligama"
    // address: "Weligama"
  };

  const group = {
    // city: "Weligama",
    adminArea: "Southern Province",
    country: "Sri Lanka",
    type: "CITY",
  };

  const normalizedLocationName = normalizeLocation(parsedLocation.venueName);
  log.info("Normalized Location Name:", normalizedLocationName);

  const scope = buildVenueScope(group);
  log.info("Venue Scope:", scope);

  const aliases = await searchAliases(normalizedLocationName, group);
  if (aliases) {
    log.info("Found alias match:", aliases);
  }

  // const result = await resolveLocation(parsedLocation, group);
  // log.info("Result:", result);

}

run().catch((error) => {
  log.error("Error:", error);
  process.exit(1);
});

