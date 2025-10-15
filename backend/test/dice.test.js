import test from 'node:test';
import assert from 'node:assert/strict';

import { rollDice } from '../src/utils/dice.js';

test('rollDice parses count, sides, and modifiers correctly', () => {
  const originalRandom = Math.random;
  const sequence = [0.1, 0.9];
  let index = 0;
  Math.random = () => {
    const value = sequence[index % sequence.length];
    index += 1;
    return value;
  };

  const result = rollDice('/roll 2d10+3-1');

  Math.random = originalRandom;

  assert.equal(result.total, 14);
  assert.equal(result.detail, '2 + 10 +3 -1 = 14');
});

test('rollDice rejects malformed commands', () => {
  const result = rollDice('hello world');
  assert.equal(result.total, null);
  assert.match(result.detail, /Format invalide/);
});

test('rollDice enforces reasonable limits on dice count and size', () => {
  const excessiveDice = rollDice('/roll 200d6');
  assert.equal(excessiveDice.total, null);
  assert.match(excessiveDice.detail, /Trop de dés lancés/);
});
