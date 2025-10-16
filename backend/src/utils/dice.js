const DICE_REGEX = /^(\d*)d(\d+)([+-]\d+)?$/i;

export const parseDiceExpression = (expression) => {
  const trimmed = expression.trim().replace(/^\/roll\s+/i, '');
  const match = trimmed.match(DICE_REGEX);
  if (!match) {
    throw new Error('Expression de dé invalide');
  }
  const rolls = Number(match[1] || 1);
  const faces = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;
  if (rolls <= 0 || faces <= 0) {
    throw new Error('Valeurs de dé invalides');
  }
  return { rolls, faces, modifier };
};

export const rollDice = (expression, rng = Math.random) => {
  const { rolls, faces, modifier } = parseDiceExpression(expression);
  const results = Array.from({ length: rolls }, () => Math.floor(rng() * faces) + 1);
  const total = results.reduce((acc, value) => acc + value, modifier);
  return { results, modifier, total, faces };
};
