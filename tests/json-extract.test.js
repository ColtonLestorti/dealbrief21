import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonFromModelText } from '../scripts/json-extract.js';

test('extractJsonFromModelText parses already-clean JSON', () => {
  const result = extractJsonFromModelText('{"a": 1}');
  assert.deepEqual(result, { a: 1 });
});

test('extractJsonFromModelText parses a fenced block at the start', () => {
  const text = '```json\n{"a": 1}\n```';
  assert.deepEqual(extractJsonFromModelText(text), { a: 1 });
});

test('extractJsonFromModelText parses a fenced block preceded by narrative text', () => {
  const text = "I'll run multiple parallel searches to gather today's news.\n\n" +
    'Now I have enough data. Let me synthesize the JSON output.\n\n' +
    '```json\n{"a": 1, "b": [1, 2, 3]}\n```';
  assert.deepEqual(extractJsonFromModelText(text), { a: 1, b: [1, 2, 3] });
});

test('extractJsonFromModelText recovers a bare JSON object with no fence, surrounded by prose', () => {
  const text = 'Here is the result: {"a": 1} — done.';
  assert.deepEqual(extractJsonFromModelText(text), { a: 1 });
});

test('extractJsonFromModelText throws when no JSON is present at all', () => {
  assert.throws(() => extractJsonFromModelText('just plain narrative text, no JSON here'));
});
