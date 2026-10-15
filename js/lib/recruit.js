import { toNumber } from "./format.js";

export function maxBarracksSpeedDivisor(recruitModifiers) {
  const techPercent = (recruitModifiers.barracksSpeedTechs || [])
    .reduce((sum, tech) => sum + toNumber(tech.percent), 0);
  const tribeTech = recruitModifiers.tribeRecruitTech || {};
  const playerPercent = toNumber(tribeTech.maxLevel) * toNumber(tribeTech.percentPerLevel)
    + toNumber(recruitModifiers.domination?.percent);
  return (1 + techPercent / 100) * (1 + playerPercent / 100);
}

// Base prices; barracks time at maxed bonuses, hall of orders time at base (no speed bonuses apply).
export function recruitSummary(unitCounts, units, recruitModifiers) {
  const barracksDivisor = maxBarracksSpeedDivisor(recruitModifiers);
  const summary = { wood: 0, clay: 0, iron: 0, provisions: 0, barracksTime: 0, hallOfOrdersTime: 0 };

  for (const [unit, count] of Object.entries(unitCounts)) {
    const stats = units[unit];
    if (!count || !stats?.recruitBuilding) continue;

    summary.wood += stats.wood * count;
    summary.clay += stats.clay * count;
    summary.iron += stats.iron * count;
    summary.provisions += stats.provisions * count;

    if (stats.recruitBuilding === "barracks") {
      summary.barracksTime += Math.round(stats.recruitTime * count / barracksDivisor);
    } else if (stats.recruitBuilding === "hallOfOrders") {
      summary.hallOfOrdersTime += stats.recruitTime * count;
    }
  }

  return summary;
}
