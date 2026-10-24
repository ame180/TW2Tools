// Berserker bonus status for the battle calc: is it on, and how far each side is from flipping it.
// tone: "on" | "off" | "muted"; boosted: the bonus actually applies to berserkers in this hit.

import { formatNumber } from "./format.js";

export function zerkBonusStatus({ attackerFood, defenderFood, berserkers, attackerEmpty, maxAttackProvisions, unitStats }) {
  const zerkFood = unitStats.berserker.provisions;
  const swordFood = unitStats.sword.provisions;
  const threshold = 2 * attackerFood;
  const maxAttackerFood = Math.ceil(defenderFood / 2) - 1;
  const active = defenderFood > threshold;
  const boosted = active && berserkers > 0;

  if (attackerEmpty && defenderFood === 0) {
    const caption = { tone: "muted", title: "Zerk bonus", detail: "Add troops to see it" };
    return { boosted, attacker: caption, defender: caption };
  }
  if (defenderFood > 2 * maxAttackProvisions && attackerFood <= maxAttackProvisions) {
    const tone = berserkers > 0 || attackerEmpty ? "on" : "muted";
    const caption = { tone, title: "Zerk bonus always on", detail: `Defender over 2 × ${formatNumber(maxAttackProvisions)} max attack` };
    return { boosted, attacker: caption, defender: caption };
  }
  if (attackerEmpty) {
    return {
      boosted,
      attacker: {
        tone: "on", title: "Zerk bonus on", detail: `Up to ${formatNumber(maxAttackerFood)} prov`,
        hint: zerkHint(Math.floor(maxAttackerFood / zerkFood)),
      },
      defender: { tone: "on", title: "Zerk bonus on", detail: `vs attacks up to ${formatNumber(maxAttackerFood)} prov` },
    };
  }
  if (berserkers === 0) {
    const caption = { tone: "muted", title: "Zerk bonus", detail: "No zerks in attack" };
    return { boosted, attacker: caption, defender: caption };
  }

  if (active) {
    const attackerRoom = maxAttackerFood - attackerFood;
    const defenderCut = defenderFood - threshold;
    return {
      boosted,
      attacker: {
        tone: "on", title: "Zerk bonus on", detail: `+${formatNumber(attackerRoom)} prov room`,
        hint: attackerRoom === 0 ? "1 more loses it" : zerkHint(Math.floor(attackerRoom / zerkFood)),
      },
      defender: {
        tone: "on", title: "Zerk bonus on", detail: `−${formatNumber(defenderCut)} prov to cancel`,
        hint: `≈ ${formatNumber(Math.ceil(defenderCut / swordFood))} Sw`,
      },
    };
  }

  const attackerCut = attackerFood - maxAttackerFood;
  const defenderRoom = threshold - defenderFood;
  return {
    boosted,
    attacker: {
      tone: "off", title: "Zerk bonus off", detail: `−${formatNumber(attackerCut)} prov to trigger`,
      hint: zerkHint(Math.ceil(attackerCut / zerkFood)),
    },
    defender: {
      tone: "off", title: "Zerk bonus off", detail: `+${formatNumber(defenderRoom)} prov room`,
      hint: defenderRoom === 0 ? "1 more triggers it" : `≈ ${formatNumber(Math.floor(defenderRoom / swordFood))} Sw`,
    },
  };
}

function zerkHint(count) {
  return count === 0 ? "" : `≈ ${formatNumber(count)} Zerk`;
}
