const LOCATION_MODES = ['online', 'at_provider', 'at_customer', 'unknown'];

function normalizeOfferingLocation(value) {
    const location = value && typeof value === 'object' ? value : {};
    const modes = Array.isArray(location.modes)
        ? [...new Set(location.modes.filter(mode => LOCATION_MODES.includes(mode)))]
        : [];
    const result = {
        modes: modes.length > 0 ? modes : ['unknown'],
    };

    for (const field of ['venueName', 'address', 'city', 'adminArea', 'country', 'rawLocationText']) {
        result[field] = typeof location[field] === 'string' ? location[field].trim() || null : null;
    }

    return result;
}

module.exports = { normalizeOfferingLocation };
