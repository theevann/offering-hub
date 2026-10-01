const LOCATION_MODES = ['online', 'fixed_place', 'at_customer', 'hybrid', 'unknown'];

function normalizeOfferingLocation(value) {
    const location = value && typeof value === 'object' ? value : {};
    const result = {
        mode: LOCATION_MODES.includes(location.mode) ? location.mode : 'unknown',
    };

    for (const field of ['venueName', 'address', 'city', 'adminArea', 'country', 'rawLocationText']) {
        result[field] = typeof location[field] === 'string' ? location[field].trim() || null : null;
    }

    return result;
}

module.exports = { normalizeOfferingLocation };
