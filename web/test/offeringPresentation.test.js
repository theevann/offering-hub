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

test('missing prices are explicit and zero amounts remain visible', () => {
    assert.equal(offeringPriceLabel({}), 'Price not specified')
    assert.equal(offeringPriceLabel({ pricingType: 'free' }), 'Free')
    assert.equal(offeringPriceLabel({ price: { amount: 0, currency: 'LKR' } }), '0 LKR')
})
