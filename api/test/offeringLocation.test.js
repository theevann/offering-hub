const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeOfferingLocation } = require('../src/utils/offeringLocation');

test('missing and malformed extraction yields unknown mode and nullable text', () => {
    for (const input of [null, undefined, [], 'online', { mode: 'made-up', venueName: {}, address: 12 }]) {
        const result = normalizeOfferingLocation(input);
        assert.deepEqual(result.modes, ['unknown']);
        assert.equal(result.venueName, null);
        assert.equal(result.address, null);
    }
});

test('normalization retains explicit fields and excludes duplicated URLs and retired fields', () => {
    const result = normalizeOfferingLocation({
        modes: ['at_provider'], venueName: ' Sri Yoga Shala ', address: ' 12 Temple Road ',
        city: ' Unawatuna ', country: ' ', rawLocationText: ' at Sri Yoga Shala ',
        locationName: 'obsolete', addressFragment: 'obsolete', url: 'https://example.com',
    });
    assert.deepEqual(result, {
        modes: ['at_provider'], venueName: 'Sri Yoga Shala', address: '12 Temple Road',
        city: 'Unawatuna', adminArea: null, country: null, rawLocationText: 'at Sri Yoga Shala',
    });
});
