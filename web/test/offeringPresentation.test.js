import { test } from 'node:test'
import assert from 'node:assert/strict'
import { offeringTimeLabel, offeringPriceLabel } from '../app/utils/offeringPresentation.js'
import { countOfferingsByDay } from '../app/utils/exploreOfferings.js'

test('card and map times follow the selected timezone', () => {
    const offering = { startTime: '2026-09-14T03:30:00Z' }
    assert.equal(offeringTimeLabel(offering, 'Asia/Colombo'), '09:00')
    assert.equal(offeringTimeLabel(offering, 'Europe/Paris'), '05:30')
    assert.equal(offeringTimeLabel(offering, 'Asia/Colombo', '2026-09-15'), 'Continues')
    assert.equal(offeringTimeLabel({ ...offering, startTimePrecision: 'wholeDay' }, 'UTC'), 'All day')
})

test('date dots respect local midnight and exclusive event endings', () => {
    const offerings = [
        { startTime: '2026-09-13T20:00:00Z', endTime: '2026-09-15T18:30:00Z' },
        { startTime: null },
    ]
    const days = ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16']
    assert.deepEqual(countOfferingsByDay(offerings, days, 'Asia/Colombo'), {
        '2026-09-13': 0, '2026-09-14': 1, '2026-09-15': 1, '2026-09-16': 0,
    })
})

test('missing prices stay explicit by default but can be hidden in explore cards', () => {
    assert.equal(offeringPriceLabel({}), 'Price not specified')
    assert.equal(offeringPriceLabel({}, { showUnknown: false }), '')
    assert.equal(offeringPriceLabel({ pricingType: 'free' }), 'Free')
    assert.equal(offeringPriceLabel({ price: { amount: 0, currency: 'LKR' } }), '0 LKR')
})

import { offeringVenueLabel, offeringLocationNote, offeringDirectionsUrl } from '../app/utils/offeringPresentation.js'
import { offeringCoordinates, filterOfferings } from '../app/utils/exploreOfferings.js'

test('online discovery coordinates do not become a venue label, directions or map pin', () => {
    const offering = {
        id: 'online', category: 'SERVICE', title: 'Online class', locationModes: ['online'],
        locationSource: 'GROUP_FALLBACK', latitude: 6, longitude: 80, distanceKm: 2,
        group: { name: 'Local community' },
        venue: { displayName: 'Stale venue', mapsUrl: 'https://maps.google.com/' },
        resources: [{ channel: 'url', value: 'https://maps.google.com/', purposes: ['location'] }],
    }
    assert.equal(offeringVenueLabel(offering), 'Online');
    assert.equal(offeringLocationNote(offering), 'Shared in Local community');
    assert.equal(offeringDirectionsUrl(offering), '');
    assert.equal(offeringCoordinates(offering), null);
    const results = filterOfferings([offering], { mode: 'services', view: 'list', search: '', timeZone: 'UTC' });
    assert.equal(results.length, 1);
});

test('customer visits have no fixed destination; provider and mixed offerings retain physical option', () => {
    const visit = { locationModes: ['at_customer'], locationText: 'At your home in Weligama', latitude: 6, longitude: 80 };
    assert.equal(offeringVenueLabel(visit), 'At your place');
    assert.equal(offeringLocationNote(visit), 'At your home in Weligama');
    assert.equal(offeringDirectionsUrl(visit), '');

    const hybrid = { locationModes: ['at_provider', 'online'], venue: { displayName: 'Studio' }, latitude: 6, longitude: 80 };
    assert.equal(offeringVenueLabel(hybrid), 'At Studio or online');
    assert.equal(offeringLocationNote(hybrid), '');
    assert.deepEqual(offeringCoordinates(hybrid), [6, 80]);
    assert.ok(offeringDirectionsUrl(hybrid));

    const mixed = { locationModes: ['at_provider', 'at_customer'], locationText: 'Midigama (our space) or at your hotel', venue: { displayName: 'Midigama' }, latitude: 6, longitude: 80 };
    assert.equal(offeringVenueLabel(mixed), 'At Midigama or your place');
    assert.equal(offeringLocationNote(mixed), '');
    assert.deepEqual(offeringCoordinates(mixed), [6, 80]);
    assert.ok(offeringDirectionsUrl(mixed));

    const mixedWithoutVenue = { locationModes: ['at_provider', 'at_customer'], locationText: 'Midigama (our space) or at your hotel', latitude: 6, longitude: 80 };
    assert.equal(offeringVenueLabel(mixedWithoutVenue), "At the host's location or your place");
    assert.equal(offeringLocationNote(mixedWithoutVenue), 'Midigama (our space) or at your hotel');
});

test('resolved areas are approximate and do not generate destination links', () => {
    const area = { locationModes: ['at_provider'], locationSource: 'GOOGLE_AREA', locationText: 'South Sri Lanka', latitude: 6, longitude: 80 };
    assert.equal(offeringVenueLabel(area), "At the host's location");
    assert.match(offeringLocationNote(area), /Approximate area/);
    assert.equal(offeringDirectionsUrl(area), '');
    assert.ok(offeringDirectionsUrl({ ...area, locationSource: 'GOOGLE_ADDRESS' }));
});
