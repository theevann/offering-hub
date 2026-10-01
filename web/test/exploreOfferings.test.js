import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterOfferings, matchesDate, groupAgenda, addDays, dateKey, isValidDateKey, offeringCoordinates } from '../app/utils/exploreOfferings.js'

const settings = { mode: 'events', view: 'list', selectedDate: '2026-09-14', search: '', topic: '', category: '', timeZone: 'UTC' }
const event = (id, startTime, extra = {}) => ({ id, title: 'Aerial yoga', category: 'CLASS', startTime, ...extra })

test('agenda finds both occurrences of an infrequent activity after the chosen day', () => {
    const offerings = [event('old', '2026-09-13T10:00:00Z'), event('mon', '2026-09-14T10:00:00Z'), event('thu', '2026-09-17T10:00:00Z')]
    assert.deepEqual(filterOfferings(offerings, { ...settings, search: 'aerial yoga' }).map(o => o.id), ['mon', 'thu'])
    assert.deepEqual(filterOfferings(offerings, { ...settings, view: 'map' }).map(o => o.id), ['mon'])
})
test('multi-day events appear on days they span, but not their exclusive midnight end', () => {
    const retreat = event('retreat', '2026-09-12T10:00:00Z', { endTime: '2026-09-15T00:00:00Z' })
    assert.equal(matchesDate(retreat, '2026-09-14', 'map', 'UTC'), true)
    assert.equal(matchesDate(retreat, '2026-09-15', 'map', 'UTC'), false)
    assert.equal(groupAgenda([retreat], '2026-09-14', 'UTC')[0].date, '2026-09-14')
})
test('map respects timezone boundaries', () => {
    const offering = event('morning', '2026-09-13T20:00:00Z')
    assert.equal(matchesDate(offering, '2026-09-14', 'map', 'Asia/Colombo'), true)
    assert.equal(matchesDate(offering, '2026-09-14', 'map', 'UTC'), false)
})
test('services and marketplace stay separate and both ignore dates', () => {
    const offerings = [event('service', '2020-01-01T00:00:00Z', { category: 'SERVICE' }), event('rental', null, { category: 'RENTAL' }), event('sale', null, { category: 'SALE' }), event('class', null)]
    for (const view of ['map', 'list']) {
        assert.deepEqual(filterOfferings(offerings, { ...settings, mode: 'marketplace', view }).map(o => o.id), ['rental', 'sale'])
        assert.deepEqual(filterOfferings(offerings, { ...settings, mode: 'services', view }).map(o => o.id), ['service'])
        assert.deepEqual(filterOfferings(offerings, { ...settings, mode: 'marketplace', view, category: 'RENTAL' }).map(o => o.id), ['rental'])
    }
    assert.deepEqual(filterOfferings(offerings, settings).map(o => o.id), ['class'])
})
test('undated events remain in agenda but cannot be assigned to a map day', () => {
    assert.equal(matchesDate(event('unknown', null), '2026-09-14', 'list', 'UTC'), true)
    assert.equal(matchesDate(event('unknown', null), '2026-09-14', 'map', 'UTC'), false)
    assert.equal(groupAgenda([event('unknown', null)], '2026-09-14', 'UTC')[0].date, 'undated')
})
test('text search and topics combine across title, description, and venue', () => {
    const offerings = [event('yes', null, { topics: ['yoga'], description: 'Beginner friendly', venue: { displayName: 'Beach studio' } }), event('no', null)]
    assert.deepEqual(filterOfferings(offerings, { ...settings, search: 'beginner beach', topic: 'yoga' }).map(o => o.id), ['yes'])
})
test('calendar arithmetic handles month, leap-year and daylight-saving boundaries', () => {
    assert.equal(addDays('2026-09-30', 1), '2026-10-01')
    assert.equal(addDays('2028-02-28', 1), '2028-02-29')
    assert.equal(isValidDateKey('2026-02-30'), false)
    assert.equal(dateKey('2026-03-29T22:30:00Z', 'Europe/Paris'), '2026-03-30')
})
test('map accepts zero coordinates and rejects missing or invalid coordinates', () => {
    assert.deepEqual(offeringCoordinates({ latitude: 0, longitude: 0 }), [0, 0])
    assert.deepEqual(offeringCoordinates({ location: { coordinates: [80, 7] } }), [7, 80])
    assert.equal(offeringCoordinates({ latitude: 100, longitude: 0 }), null)
    assert.equal(offeringCoordinates({}), null)
})
