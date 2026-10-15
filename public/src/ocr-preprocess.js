/** Pure image helpers; no image data is stored or sent anywhere. */
const luma = (data, offset) => Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);

export function darkTextProfile(data) {
  const pixels = Math.floor(data.length / 4);
  const step = Math.max(1, Math.floor(pixels / 60000));
  let sampled = 0, dark = 0, bright = 0;
  for (let pixel = 0; pixel < pixels; pixel += step) {
    const value = luma(data, pixel * 4);
    sampled++;
    if (value < 100) dark++;
    if (value > 180) bright++;
  }
  if (!sampled) return { dark: false };
  return {
    dark: dark / sampled > 0.72 && bright / sampled > 0.005 && bright / sampled < 0.22,
  };
}

/** Converts light text on dark/colored bubbles into black text on white. */
export function normalizeDarkText(data, width, { dates = false, bodyFloor = 80 } = {}) {
  const rows = new Uint32Array(Math.floor(data.length / (width * 4)));
  for (let offset = 0; offset < data.length; offset += 4) {
    const gray = luma(data, offset);
    // Soft contrast preserves thin Korean strokes that a hard threshold erases.
    // Plain inversion retains muted date separators; the two passes serve
    // different contrast levels in the same SMS screenshot.
    const value = dates ? 255 - gray : 255 - Math.max(0, Math.min(255, (gray - bodyFloor) * 255 / (255 - bodyFloor)));
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
    if (value < 180) rows[Math.floor(offset / (width * 4))]++;
  }
  return rows;
}

/** Consecutive, non-overlapping strips split at nearby whitespace where possible. */
export function textStrips(width, height, rows, { maxHeight = 1800, maxStrips = 6 } = {}) {
  const count = Math.min(maxStrips, Math.max(1, Math.ceil(height / maxHeight)));
  const strips = [];
  let top = 0;
  for (let index = 1; index <= count; index++) {
    let bottom = index === count ? height : Math.round(height * index / count);
    if (index < count && rows) {
      const radius = Math.min(120, Math.floor(height / count / 5));
      const ideal = bottom;
      const end = Math.min(height - 80, ideal + radius);
      let bestScore = Infinity;
      for (let candidate = Math.max(top + 80, ideal - radius); candidate <= end; candidate++) {
        const ink = (rows[candidate - 1] || 0) + (rows[candidate] || 0) + (rows[candidate + 1] || 0);
        const score = ink * 1000 + Math.abs(candidate - ideal);
        if (score < bestScore) { bestScore = score; bottom = candidate; }
      }
    }
    strips.push({ left: 0, top, width, height: bottom - top });
    top = bottom;
  }
  return strips;
}

export function ocrLines(data) {
  return (data?.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => paragraph.lines || []))
    .filter(line => line?.text?.trim() && line.bbox && ['x0', 'y0', 'x1', 'y1'].every(key => Number.isFinite(line.bbox[key])));
}

export function isDateSeparator(text) {
  const compact = String(text || '').replace(/[\s()（）·]/g, '');
  return /^(?:\d{4}년)?(?:1[0-2]|0?[1-9])월(?:3[01]|[12]\d|0?[1-9])일(?:[월화수목금토일](?:요일|요)?)?$/.test(compact);
}

/** Adds the subtle date headers, without importing duplicate/noisy body text. */
export function mergeDarkOcr(body, dates) {
  const lines = ocrLines(body);
  const dateLines = ocrLines(dates).filter(line => isDateSeparator(line.text) && Number(line.confidence) >= 45);
  if (!lines.length) return String(body?.text || '').trim();
  const merged = lines.filter(line => !dateLines.some(date => {
    const a = line.bbox, b = date.bbox;
    const vertical = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    const horizontal = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return vertical > Math.min(a.y1 - a.y0, b.y1 - b.y0) * 0.35 && horizontal > 0;
  }));
  merged.push(...dateLines);
  merged.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  return merged.map(line => line.text.trim()).join('\n');
}

/** Sparse OCR reads table cells separately. Rebuild visual rows before parsing
 * a roster so names and IDs remain beside their original classmates. */
export function rosterOcrText(data) {
  const items = ocrLines(data)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  if (!items.length) return String(data?.text || '').trim();
  const rows = [];
  for (const item of items) {
    const box = item.bbox;
    const center = (box.y0 + box.y1) / 2;
    const height = Math.max(1, box.y1 - box.y0);
    let best, distance = Infinity;
    for (const row of rows) {
      const delta = Math.abs(row.center - center);
      if (delta <= Math.min(row.height, height) * 0.6 && delta < distance) { best = row; distance = delta; }
    }
    if (best) {
      best.items.push(item);
      best.center = best.items.reduce((sum, value) => sum + (value.bbox.y0 + value.bbox.y1) / 2, 0) / best.items.length;
      best.height = Math.max(best.height, height);
    } else rows.push({ center, height, items: [item] });
  }
  return rows.sort((a, b) => a.center - b.center).map(row => row.items.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(item => item.text.trim()).join(' ')).join('\n');
}

