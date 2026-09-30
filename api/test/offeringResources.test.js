const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeResources } = require('../src/utils/offeringResources');

test('merges WhatsApp destinations and purposes, but keeps phone separate', () => {
    assert.deepEqual(normalizeResources([
        { channel: 'url', value: 'https://wa.me/94765691672', purposes: ['booking'] },
        { channel: 'whatsapp', value: '+94 76 569 1672', purposes: ['inquiry'] },
        { channel: 'phone', value: '+94 76 569 1672', purposes: [] },
    ]), [
        { channel: 'whatsapp', value: '+94765691672', purposes: ['booking', 'inquiry'] },
        { channel: 'phone', value: '+94765691672', purposes: [] },
    ]);
});

test('normalizes explicit destinations without inventing purposes or country codes', () => {
    assert.deepEqual(normalizeResources([
        { channel: 'email', value: 'info [at] example dot com' },
        { channel: 'telegram', value: '@studio', purposes: ['community'] },
        { channel: 'whatsapp', value: '077 123 4567', purposes: ['unknown'] },
        { channel: 'whatsapp', value: 'https://chat.whatsapp.com/Invite', purposes: ['community'] },
    ]), [
        { channel: 'email', value: 'info@example.com', purposes: [] },
        { channel: 'telegram', value: 'https://t.me/studio', purposes: ['community'] },
        { channel: 'whatsapp', value: '0771234567', purposes: [] },
        { channel: 'whatsapp', value: 'https://chat.whatsapp.com/Invite', purposes: ['community'] },
    ]);
});

test('rejects unsafe or mismatched destinations and malformed resources', () => {
    assert.deepEqual(normalizeResources([null, {},
        { channel: 'url', value: 'javascript:alert(1)' },
        { channel: 'telegram', value: 'https://example.com' },
        { channel: 'url', value: 'https://user:password@example.com' },
        { channel: 'email', value: 'DM me' },
    ]), []);
    assert.deepEqual(normalizeResources(null), []);
});
