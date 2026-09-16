import { toNumber } from "./format.js";

export function calculateCrowns(totalSeconds, model) {
  if (!model) {
    return 0;
  }

  const fixedTime = toNumber(model.fixedTime);
  const fixedCrowns = toNumber(model.fixedCrowns);

  if (totalSeconds <= fixedTime) {
    return Math.ceil(fixedCrowns);
  }

  const timeRange = (model.timeRange || []).map(toNumber);
  const crownRange = (model.crownRange || []).map(toNumber);

  if (!timeRange.length || !crownRange.length || timeRange.length !== crownRange.length) {
    return Math.ceil(fixedCrowns);
  }

  if (timeRange.length === 1) {
    return Math.ceil(crownRange[0]);
  }

  if (totalSeconds <= timeRange[0]) {
    return Math.ceil(crownRange[0]);
  }

  for (let i = 1; i < timeRange.length; i += 1) {
    if (totalSeconds <= timeRange[i]) {
      return interpolateCrowns(
        totalSeconds,
        timeRange[i - 1],
        timeRange[i],
        crownRange[i - 1],
        crownRange[i]
      );
    }
  }

  const last = timeRange.length - 1;
  return interpolateCrowns(
    totalSeconds,
    timeRange[last - 1],
    timeRange[last],
    crownRange[last - 1],
    crownRange[last]
  );
}

function interpolateCrowns(remainingSeconds, startTime, endTime, startPrice, endPrice) {
  const timeDelta = endTime - startTime;
  if (timeDelta <= 0) {
    return Math.ceil(endPrice);
  }

  const crowns =
    Math.ceil(
      ((remainingSeconds + 1 - startTime) * (endPrice - startPrice)) /
        timeDelta
    ) +
    startPrice -
    1;

  return Math.max(0, crowns);
}
