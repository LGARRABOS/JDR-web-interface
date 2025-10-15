/**
 * Parse a dice notation such as "/roll 2d6+3" and return a human readable
 * result. The function supports multiple modifiers and dice sizes, making it
 * flexible for future rule extensions.
 */
export const rollDice = (input) => {
  const trimmed = input.trim().replace(/^\/roll\s*/i, '');
  const dicePattern = /(?<count>\d*)d(?<sides>\d+)(?<modifier>([+-]\d+)*)/i;
  const match = trimmed.match(dicePattern);

  if (!match) {
    return {
      total: null,
      detail: 'Format invalide. Utilise /roll 1d20+3',
    };
  }

  const count = Number(match.groups.count) || 1;
  const sides = Number(match.groups.sides);
  const modifiers = match.groups.modifier || '';

  if (count > 50 || sides > 1000) {
    return {
      total: null,
      detail: 'Trop de dés lancés. Reste raisonnable pour la table !',
    };
  }

  const rolls = Array.from({ length: count }, () =>
    Math.floor(Math.random() * sides) + 1,
  );

  const modifierValues = modifiers
    .match(/[+-]\d+/g)
    ?.map((value) => Number(value)) ?? [];

  const modifierTotal = modifierValues.reduce((acc, value) => acc + value, 0);
  const total = rolls.reduce((acc, value) => acc + value, 0) + modifierTotal;

  const formattedModifiers = modifierValues
    .map((value) => (value >= 0 ? `+${value}` : `${value}`))
    .join(' ');

  const detail = `${rolls.join(' + ')}${
    modifierValues.length ? ' ' + formattedModifiers : ''
  } = ${total}`;

  return { total, detail };
};
