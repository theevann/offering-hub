const { createLogger } = require("../utils/logger");
const log = createLogger("testResolveLocation");

// testResolveLocation.js
const { resolveLocation, normalizeLocation, searchAliases, buildVenueScope } = require("./locationService");

async function run() {
  const parsedLocation = {
    // locationName: "Unsung",
    // locationName: "Unsung café",
    // locationName: "Sênses yoga",
    locationName: "# yoga shack",
    // addressFragment: "Weligama"
    // addressFragment: "Weligama"
  };

  const group = {
    // city: "Weligama",
    adminArea: "Southern Province",
    country: "Sri Lanka",
    type: "CITY",
  };

  const normalizedLocationName = normalizeLocation(parsedLocation.locationName);
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

