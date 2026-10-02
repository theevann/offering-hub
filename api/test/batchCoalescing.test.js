const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    calculateNextScheduledAt,
    formatBatchText,
    collectBatchMedia,
    isTrivialBatch,
} = require('../src/utils/batchCoalescing');

test('calculateNextScheduledAt: debounces by debounceSeconds before maxWait', () => {
    const now = new Date('2026-10-02T10:00:00Z');
    const createdAt = new Date('2026-10-02T10:00:00Z');
    const scheduled = calculateNextScheduledAt({
        now,
        createdAt,
        debounceSeconds: 60,
        maxWaitSeconds: 300,
        isFull: false,
    });

    assert.equal(scheduled.toISOString(), '2026-10-02T10:01:00.000Z');
});

test('calculateNextScheduledAt: caps at maxWait when debounce would exceed it', () => {
    const now = new Date('2026-10-02T10:04:30Z');
    const createdAt = new Date('2026-10-02T10:00:00Z'); // 30s before maxWait
    const scheduled = calculateNextScheduledAt({
        now,
        createdAt,
        debounceSeconds: 60, // would be 10:05:30Z
        maxWaitSeconds: 300,
        isFull: false,
    });

    assert.equal(scheduled.toISOString(), '2026-10-02T10:05:00.000Z');
});

test('calculateNextScheduledAt: returns now immediately when batch is full', () => {
    const now = new Date('2026-10-02T10:00:30Z');
    const createdAt = new Date('2026-10-02T10:00:00Z');
    const scheduled = calculateNextScheduledAt({
        now,
        createdAt,
        debounceSeconds: 60,
        maxWaitSeconds: 300,
        isFull: true,
    });

    assert.equal(scheduled.toISOString(), '2026-10-02T10:00:30.000Z');
});

test('formatBatchText: formats single and multi-message batches', () => {
    assert.equal(formatBatchText([]), '');
    assert.equal(formatBatchText(null), '');

    // Single message returns rawText directly without wrapper
    assert.equal(
        formatBatchText([{ rawText: 'Kundalini Yoga tomorrow at 9am' }]),
        'Kundalini Yoga tomorrow at 9am'
    );

    // Multi-message wraps with headers
    const batch = [
        {
            rawText: '',
            timestamp: new Date('2026-10-02T10:00:00Z'),
        },
        {
            rawText: 'Workshop details: 2 hours of breathwork',
            timestamp: new Date('2026-10-02T10:00:20Z'),
        },
        {
            rawText: 'Fee: 5000 LKR. Register with +94771234567',
            timestamp: new Date('2026-10-02T10:00:40Z'),
        },
    ];

    const formatted = formatBatchText(batch, true);
    assert.ok(formatted.includes('--- Message 1 [2026-10-02T10:00:00.000Z] ---'));
    assert.ok(formatted.includes('--- Message 2 [2026-10-02T10:00:20.000Z] ---'));
    assert.ok(formatted.includes('Workshop details: 2 hours of breathwork'));
    assert.ok(formatted.includes('--- Message 3 [2026-10-02T10:00:40.000Z] ---'));
    assert.ok(formatted.includes('Fee: 5000 LKR. Register with +94771234567'));
});

test('collectBatchMedia: flattens media items across all messages', () => {
    assert.deepEqual(collectBatchMedia([]), []);
    assert.deepEqual(collectBatchMedia(null), []);

    const batch = [
        { id: '1', media: [{ id: 'm1', url: 'photo1.jpg' }] },
        { id: '2', media: [] },
        { id: '3', media: [{ id: 'm2', url: 'photo2.jpg' }] },
    ];

    const media = collectBatchMedia(batch);
    assert.equal(media.length, 2);
    assert.equal(media[0].id, 'm1');
    assert.equal(media[1].id, 'm2');
});

test('isTrivialBatch: correctly classifies noise vs real content', () => {
    // If media is attached, never trivial
    assert.equal(isTrivialBatch('', [{ id: 'm1' }], 20), false);
    assert.equal(isTrivialBatch('Hi', [{ id: 'm1' }], 20), false);

    // No media and < 20 characters
    assert.equal(isTrivialBatch('Ok thanks!', [], 20), true);
    assert.equal(isTrivialBatch('   ', [], 20), true);
    assert.equal(isTrivialBatch('See you tomorrow', [], 20), true); // 16 chars

    // No media but >= 20 characters
    assert.equal(isTrivialBatch('Sound bath at 7pm tonight. 2000 LKR.', [], 20), false); // 36 chars
});
