// testResolveLocation.js
const { resolveLocation } = require("./locationService");

async function run() {
  const parsedLocation = {
    // locationName: "Unsung",
    // locationName: "Unsung café",
    locationName: "Senses yoga",
    // addressFragment: "Weligama"
    // addressFragment: "Weligama"
  };

  const group = {
    // city: "Weligama",
    adminArea: "Southern Province",
    country: "Sri Lanka"
  };

  const result = await resolveLocation(parsedLocation, group);

  console.log("Result:", result);
}

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

