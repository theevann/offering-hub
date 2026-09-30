import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webUrl, offeringResources, offeringPhotoUrl } from '../app/utils/offeringLinks.js'

test('saved photos use the media endpoint without accepting arbitrary paths', () => {
    assert.equal(offeringPhotoUrl('media/ABC123.jpg'), '/api/media/ABC123.jpg')
    assert.equal(offeringPhotoUrl('media/../secret.jpg'), '')
    assert.equal(offeringPhotoUrl('media/%2e%2e%2fsecret.jpg'), '')
    assert.equal(offeringPhotoUrl('https://example.com/photo.jpg'), 'https://example.com/photo.jpg')
})

test('parsed web links cannot execute scripts or load local files', () => {
    assert.equal(webUrl('javascript:alert(1)'), '')
    assert.equal(webUrl('data:text/html,hello'), '')
    assert.equal(webUrl('file:///tmp/photo.jpg'), '')
    assert.equal(webUrl('https://example.com/book'), 'https://example.com/book')
})

test('resources use explicit purposes for every booking method', () => {
    const actions = offeringResources([
        { channel: 'whatsapp', value: '+94771234567', purposes: ['booking'] },
        { channel: 'email', value: 'hello@example.com', purposes: ['booking', 'inquiry'] },
        { channel: 'phone', value: '+33612345678', purposes: [] },
        { channel: 'url', value: 'https://example.com/pay', purposes: ['payment'] },
        { channel: 'whatsapp', value: '0771234567', purposes: [] },
    ])
    assert.equal(actions[0].href, 'https://wa.me/94771234567')
    assert.equal(actions[0].label, 'Book via WhatsApp')
    assert.equal(actions[1].label, 'Book by email')
    assert.equal(actions[1].href, 'mailto:hello%40example.com')
    assert.equal(actions[2].label, 'Call')
    assert.equal(actions[3].label, 'Payment details')
    assert.equal(actions[4].href, '') // Local number cannot safely form a wa.me destination.
    assert.deepEqual(offeringResources(null), [])
})

test('resources reject unsafe links and retain community destinations', () => {
    const actions = offeringResources([
        { channel: 'url', value: 'javascript:alert(1)' },
        { channel: 'whatsapp', value: 'https://example.com' },
        { channel: 'whatsapp', value: 'https://chat.whatsapp.com/Invite', purposes: ['community'] },
        { channel: 'telegram', value: 'https://t.me/studio', purposes: ['community'] },
    ])
    assert.equal(actions[0].href, '')
    assert.equal(actions[1].href, '')
    assert.equal(actions[2].label, 'Join WhatsApp group')
    assert.equal(actions[3].href, 'https://t.me/studio')
})
