import { test } from 'node:test'
import assert from 'node:assert/strict'
import { webUrl, offeringContacts, offeringPhotoUrl } from '../app/utils/offeringLinks.js'

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

test('contact actions follow the extracted contact type', () => {
    const contacts = offeringContacts([
        { type: 'phone', value: '+33 6 12 34 56 78' },
        { type: 'whatsapp', value: '+94 77 123 4567' },
        { type: 'email', value: 'hello@example.com' },
        { type: 'other', value: 'Ask at the studio' },
    ])
    assert.equal(contacts[0].href, 'tel:+33612345678')
    assert.equal(contacts[1].href, 'https://wa.me/94771234567')
    assert.equal(contacts[2].href, 'mailto:hello%40example.com')
    assert.equal(contacts[3].href, '')
    assert.deepEqual(offeringContacts(null), [])
})
