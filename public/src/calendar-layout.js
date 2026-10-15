import {monthCells} from './model.js';

const compareText = (a,b) => a < b ? -1 : a > b ? 1 : 0;

/**
 * Lay out uncertain date windows as one horizontal segment per calendar week.
 * Columns use CSS grid line numbers (start inclusive, end exclusive); lanes
 * are zero-based. Outside-month cells never contain a segment.
 */
export function calendarWeeks(events, month) {
  const cells = monthCells(month);
  const ranges = events.filter(event => event.dateMode !== 'single');
  let previousLanes = new Map();
  const weeks = [];

  for (let offset = 0; offset < cells.length; offset += 7) {
    const dates = cells.slice(offset, offset + 7);
    const monthDates = dates.filter(date => date.startsWith(month + '-'));
    const firstDate = monthDates[0];
    const lastDate = monthDates.at(-1);
    const segments = ranges
      .filter(event => event.startDate <= lastDate && event.endDate >= firstDate)
      .map(event => {
        const firstVisible = event.startDate > firstDate ? event.startDate : firstDate;
        const lastVisible = event.endDate < lastDate ? event.endDate : lastDate;
        return {
          event,
          startColumn: dates.indexOf(firstVisible) + 1,
          endColumn: dates.indexOf(lastVisible) + 2,
          lane: 0,
          continuesBefore: event.startDate < firstVisible,
          continuesAfter: event.endDate > lastVisible,
        };
      });

    // The peak is the minimum necessary lane count. A preferred old lane is
    // reused only within this bound, so sparse later weeks do not keep gaps.
    const peak = Math.max(0, ...dates.map((_, index) => segments.filter(segment =>
      segment.startColumn <= index + 1 && segment.endColumn > index + 1
    ).length));
    segments.sort((a,b) =>
      a.startColumn - b.startColumn ||
      Number(b.continuesBefore) - Number(a.continuesBefore) ||
      (previousLanes.get(a.event.id) ?? Infinity) - (previousLanes.get(b.event.id) ?? Infinity) ||
      b.endColumn - a.endColumn ||
      compareText(a.event.startDate,b.event.startDate) ||
      compareText(a.event.endDate,b.event.endDate) ||
      compareText(a.event.studentId,b.event.studentId) ||
      compareText(a.event.id,b.event.id)
    );

    const laneEnds = Array(peak).fill(0);
    for (const segment of segments) {
      const preferred = previousLanes.get(segment.event.id);
      const lane = preferred !== undefined && preferred < peak && laneEnds[preferred] <= segment.startColumn
        ? preferred
        : laneEnds.findIndex(end => end <= segment.startColumn);
      segment.lane = lane;
      laneEnds[lane] = segment.endColumn;
    }
    previousLanes = new Map(segments.map(segment => [segment.event.id, segment.lane]));
    weeks.push({dates, segments, laneCount: peak});
  }
  return weeks;
}
