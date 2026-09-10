// TODO: Review this file
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const vm = require("node:vm");
const { test } = require("node:test");
const { Prisma } = require("@prisma/client");

const serviceCode = readFileSync(require.resolve("../src/services/locationService"), "utf8");
const group = {
    type: "REGION", country: "Sri Lanka", adminArea: "Southern Province",
    latitude: 5.96, longitude: 80.39, radiusKm: 50,
};
const location = { locationName: "Mountain Studio" };
const place = {
    id: "place-1", displayName: { text: "Mountain Studio" },
    formattedAddress: "Kandy, Sri Lanka",
    location: { latitude: 7.29, longitude: 80.63 },
    addressComponents: [
        { types: ["locality"], longText: "Kandy" },
        { types: ["administrative_area_level_1"], longText: "Central Province" },
        { types: ["country"], longText: "Sri Lanka" },
    ],
};

// Isolate the resolver from real credentials, Google and PostgreSQL. Reusing this store
// across service instances models persistence rather than a process-local cache.
function setup() {
    const aliases = [];
    const venues = [];
    const requests = [];
    const aliasQueries = [];
    const cacheReads = [];
    let nameMatches = [];
    let fetchImpl = async () => ({ ok: true, json: async () => ({ places: [place] }) });
    const prisma = {
        $queryRaw: async (strings, ...values) => {
            aliasQueries.push({ text: strings.join("?"), values });
            return nameMatches;
        },
        venue: {
            findUnique: async ({ where }) => venues.find(v => v.googlePlaceId === where.googlePlaceId) ?? null,
            upsert: async ({ where, create }) => {
                const existing = venues.find(v => v.googlePlaceId === where.googlePlaceId);
                if (existing) return existing;
                const venue = { id: `venue-${venues.length + 1}`, ...create };
                venues.push(venue);
                return venue;
            },
        },
        venueAlias: {
            findMany: async ({ where, take }) => {
                cacheReads.push(where);
                return aliases.filter(a => a.normalizedAlias === where.normalizedAlias &&
                    a.source === where.source && a.updatedAt > where.updatedAt.gt)
                    .slice(0, take)
                    .map(a => ({ ...a, venue: venues.find(v => v.id === a.venueId) }));
            },
            upsert: async ({ where, create, update }) => {
                const alias = aliases.find(a => a.venueId === where.venueId_normalizedAlias.venueId &&
                      a.normalizedAlias === where.venueId_normalizedAlias.normalizedAlias);
                if (alias) {
                    Object.assign(alias, update);
                    return alias;
                }
                const created = { id: `alias-${aliases.length + 1}`, updatedAt: new Date(), ...create };
                aliases.push(created);
                return created;
            },
        },
    };
    const load = (apiKey = "test-key") => {
        const sandbox = {
            module: { exports: {} },
            process: { env: { GOOGLE_MAPS_API_KEY: apiKey } },
            require: name => {
                if (name === "../db/prismaClient") return prisma;
                if (name === "@prisma/client") return { Prisma };
                if (name === "node:crypto") return require(name);
                if (name === "../utils/logger") return {
                    createLogger: () => ({ debug() {}, info() {}, warn() {} }),
                };
                throw new Error(`Unexpected require: ${name}`);
            },
            fetch: async (url, options) => {
                requests.push({ url, payload: JSON.parse(options.body), body: options.body });
                return fetchImpl();
            },
        };
        vm.runInNewContext(serviceCode, sandbox, { filename: "locationService.js" });
        return sandbox.module.exports;
    };
    return {
        load, aliases, venues, requests, aliasQueries, cacheReads,
        queries: () => aliases.filter(a => a.source === "GOOGLE_QUERY_CACHE"),
        setFetch: impl => { fetchImpl = impl; },
        setNameMatches: matches => { nameMatches = matches; },
    };
}

test("20 out-of-area resolutions share one persisted Google query, including after reload", async () => {
    const db = setup();
    const first = await db.load().resolveLocation(location, group);
    assert.equal(first.source, "GOOGLE_PLACE");
    for (let i = 1; i < 20; i++) {
        const result = await db.load().resolveLocation(location, group);
        assert.equal(result.venueId, first.venueId);
        assert.equal(result.source, "ALIAS_MATCH");
        assert.equal(result.latitude, place.location.latitude);
    }
    assert.equal(db.requests.length, 1);
    assert.equal(db.venues[0].adminArea, "Central Province");
    assert.equal(db.queries().length, 1);
    const cached = db.queries()[0];
    assert.equal(cached.alias, "Mountain Studio, Southern Province, Sri Lanka");
    assert.equal(cached.normalizedAlias,
        `gplaces:v1:${createHash("sha256").update(db.requests[0].body).digest("hex")}`);
    assert.ok(!("queryHash" in cached));
    assert.ok(db.cacheReads.every(where => where.source === "GOOGLE_QUERY_CACHE" && !("venueId" in where)));
});

test("query text, coordinates and radius distinguish requests; unrelated group metadata does not", async () => {
    const db = setup();
    const { resolveLocation } = db.load();
    await resolveLocation(location, group);
    await resolveLocation(location, { ...group, id: "another-group", name: "Other group" });
    assert.equal(db.requests.length, 1);
    await resolveLocation(location, { ...group, latitude: 6 });
    await resolveLocation(location, { ...group, longitude: 81 });
    await resolveLocation(location, { ...group, radiusKm: 10 });
    await resolveLocation({ ...location, addressFragment: "Main Street" }, group);
    await resolveLocation({ ...location, city: "Kandy" }, group);
    assert.equal(db.requests.length, 6);
    assert.equal(new Set(db.queries().map(q => q.normalizedAlias)).size, 6);
});

test("zero coordinates remain part of the Google request and its fingerprint", async () => {
    const db = setup();
    await db.load().resolveLocation(location, { ...group, latitude: 0, longitude: 0 });
    assert.deepEqual(db.requests[0].payload.locationBias.circle.center, { latitude: 0, longitude: 0 });
});

test("an expired query can resolve to a different venue without reusing the stale mapping", async () => {
    const db = setup();
    const { resolveLocation } = db.load();
    await resolveLocation(location, group);
    const cached = db.queries()[0];
    cached.updatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    db.setFetch(async () => ({ ok: true, json: async () => ({ places: [{ ...place, id: "place-2" }] }) }));
    const refreshed = await resolveLocation(location, group);
    assert.equal(db.requests.length, 2);
    assert.equal(db.queries().length, 2);
    assert.notEqual(cached.venueId, refreshed.venueId);
    assert.equal(db.venues.find(v => v.id === refreshed.venueId).googlePlaceId, "place-2");
    const fresh = db.queries().find(q => q.venueId === refreshed.venueId);
    assert.ok(fresh.updatedAt.getTime() > Date.now() - 1000);
    await resolveLocation(location, group);
    assert.equal(db.requests.length, 2);
});

test("cache hits do not extend expiry and work without an API key", async () => {
    const db = setup();
    await db.load().resolveLocation(location, group);
    const cached = db.queries()[0];
    cached.updatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const checkedAt = cached.updatedAt.getTime();
    const result = await db.load("").resolveLocation(location, group);
    assert.equal(result.venueId, cached.venueId);
    assert.equal(cached.updatedAt.getTime(), checkedAt);
    assert.equal(db.requests.length, 1);
});

test("an expired mapping to the same venue is refreshed without creating a duplicate", async () => {
    const db = setup();
    const service = db.load();
    await service.resolveLocation(location, group);
    const cached = db.queries()[0];
    cached.updatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await service.resolveLocation(location, group);
    assert.equal(db.requests.length, 2);
    assert.equal(db.queries().length, 1);
    assert.ok(cached.updatedAt.getTime() > Date.now() - 1000);
});

test("conflicting fresh mappings fall through to Google instead of choosing a venue arbitrarily", async () => {
    const db = setup();
    const service = db.load();
    const first = await service.resolveLocation(location, group);
    db.venues.push({ ...db.venues[0], id: "other-venue", googlePlaceId: "other-place" });
    db.aliases.push({ ...db.queries()[0], id: "conflicting-query", venueId: "other-venue" });
    const result = await service.resolveLocation(location, group);
    assert.equal(result.source, "GOOGLE_PLACE");
    assert.equal(result.venueId, first.venueId);
    assert.equal(db.requests.length, 2);
});

test("a cache hit still records a different extracted name that produces the same Google query", async () => {
    const db = setup();
    const service = db.load();
    await service.resolveLocation({ locationName: "Back Room, Main Street" }, group);
    assert.ok(!db.aliases.some(a => a.alias === "Back Room"));
    await service.resolveLocation({ locationName: "Back Room", addressFragment: "Main Street" }, group);
    assert.equal(db.requests.length, 1);
    assert.ok(db.aliases.some(a => a.alias === "Back Room" && a.source === "GOOGLE_PLACE"));
});

test("name alias matches take priority, and both geographic lookups exclude query entries", async () => {
    const db = setup();
    const service = db.load();
    await service.resolveLocation({ ...location, country: "Sri Lanka" }, group);
    assert.equal(db.aliasQueries.length, 2);
    assert.ok(db.aliasQueries.every(q => q.text.includes("a.source <> 'GOOGLE_QUERY_CACHE'")));
    db.setNameMatches([{ venueId: "manual-venue", venue: { latitude: 1, longitude: 2 } }]);
    const result = await service.resolveLocation(location, group);
    assert.equal(result.venueId, "manual-venue");
    assert.equal(db.requests.length, 1);
    assert.equal(db.cacheReads.length, 1);
});

for (const [label, response] of [
    ["empty results", async () => ({ ok: true, json: async () => ({ places: [] }) })],
    ["HTTP errors", async () => ({ ok: false, status: 429, text: async () => "rate limited" })],
    ["network errors", async () => { throw new Error("timeout"); }],
    ["results without coordinates", async () => ({ ok: true, json: async () => ({ places: [{ id: "missing-location" }] }) })],
    ["results with incomplete coordinates", async () => ({ ok: true, json: async () => ({ places: [{ ...place, location: { latitude: 7 } }] }) })],
]) {
    test(`${label} do not become persistent query entries and can be retried`, async () => {
        const db = setup();
        db.setFetch(response);
        const service = db.load();
        const result = await service.resolveLocation(location, group);
        assert.equal(result.source, "GROUP_FALLBACK");
        assert.equal(db.queries().length, 0);
        db.setFetch(async () => ({ ok: true, json: async () => ({ places: [place] }) }));
        assert.equal((await service.resolveLocation(location, group)).source, "GOOGLE_PLACE");
        assert.equal(db.queries().length, 1);
        assert.equal(db.requests.length, 2);
    });
}

test("missing location inputs do not generate a query cache entry", async () => {
    const db = setup();
    await db.load().resolveLocation(null, group);
    assert.equal(db.cacheReads.length, 0);
    assert.equal(db.requests.length, 0);
    assert.equal(db.aliases.length, 0);
});
