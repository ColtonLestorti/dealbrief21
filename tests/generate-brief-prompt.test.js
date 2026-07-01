import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/generate-brief.js', import.meta.url), 'utf8');

test('prompt requires roughly doubled story/opportunity volume', () => {
  assert.match(source, /10 to 14 stories/);
  assert.match(source, /6 to 10 opportunities/);
});

test('prompt defines the Speculative confidence tier with a real-source requirement', () => {
  assert.match(source, /"Speculative"/);
  assert.match(source, /real article that itself reports the (rumor|speculation)/);
});

test('prompt requires opportunities to carry source fields', () => {
  assert.match(source, /"source_url"/);
  assert.match(source, /"published"/);
});

test('generate-brief.js wires in the bank-rotation and speculative-drop helpers', () => {
  assert.match(source, /from '\.\/brief-helpers\.js'/);
  assert.match(source, /dropUnsourcedSpeculative/);
  assert.match(source, /pickRotationPriority/);
});
