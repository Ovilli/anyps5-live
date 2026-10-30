"use strict";

// Same layout as the progress map in AnyPS5's README (tools/progress.py): a squarified treemap of
// the libraries by size, each filled with one cell per function, implemented ones first.
function worstRatio(row, side) {
  const area = row.reduce((sum, value) => sum + value, 0);
  return Math.max(...row.map((value) => Math.max((side * side * value) / (area * area), (area * area) / (side * side * value))));
}

function placeRow(row, x, y, w, h, rects) {
  const thickness = row.reduce((sum, value) => sum + value, 0) / Math.min(w, h);
  let offset = 0;
  for (const area of row) {
    const length = area / thickness;
    rects.push(w >= h ? [x, y + offset, thickness, length] : [x + offset, y, length, thickness]);
    offset += length;
  }
  return w >= h ? [x + thickness, y, w - thickness, h] : [x, y + thickness, w, h - thickness];
}

function squarify(values, x, y, w, h) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const areas = values.map((value) => (value * w * h) / total);
  const rects = [];
  let row = [];
  while (areas.length) {
    const side = Math.min(w, h);
    if (!row.length || worstRatio([...row, areas[0]], side) <= worstRatio(row, side)) {
      row.push(areas.shift());
      continue;
    }
    [x, y, w, h] = placeRow(row, x, y, w, h, rects);
    row = [];
  }
  if (row.length) placeRow(row, x, y, w, h, rects);
  return rects;
}

function cells(count, x, y, w, h) {
  if (!count || w <= 0 || h <= 0) return [];
  const rows = Math.max(1, Math.min(count, Math.round(Math.sqrt((count * h) / w))));
  const result = [];
  for (let r = 0; r < rows; r += 1) {
    const inRow = Math.floor(count / rows) + (r < count % rows ? 1 : 0);
    const cw = w / inRow;
    for (let c = 0; c < inRow; c += 1) result.push([x + c * cw, y + (r * h) / rows, cw, h / rows]);
  }
  return result;
}

// Draws the map at the canvas's CSS size. options.labels (default true) prints the short library names.
function drawLibraryMap(canvas, groups, options = {}) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height || !groups.length) return;
  canvas.width = width;
  canvas.height = height;
  const style = getComputedStyle(document.documentElement);
  const colors = {
    surface: options.background ?? style.getPropertyValue("--surface").trim(),
    done: style.getPropertyValue("--series-1").trim(),
    todo: style.getPropertyValue("--todo").trim(),
    ink: style.getPropertyValue("--ink").trim(),
  };
  const context = canvas.getContext("2d");
  context.fillStyle = colors.surface;
  context.fillRect(0, 0, width, height);
  const rects = squarify(groups.map((group) => group.total), 0, 0, width, height);
  groups.forEach((group, index) => {
    const [x, y, w, h] = rects[index];
    cells(group.total, x + 1, y + 1, w - 2, h - 2).forEach(([cx, cy, cw, ch], cell) => {
      const inset = Math.min(0.5, cw / 4, ch / 4);
      context.fillStyle = cell < group.done ? colors.done : colors.todo;
      context.fillRect(cx + inset, cy + inset, cw - 2 * inset, ch - 2 * inset);
    });
    context.strokeStyle = colors.surface;
    context.lineWidth = 2;
    context.strokeRect(x, y, w, h);
    if (options.labels === false) return;
    context.font = "600 14px Inter, system-ui, sans-serif";
    let label = group.label;
    while (label && context.measureText(label).width > w - 12) label = label.slice(0, -1);
    if ((label === group.label || label.length >= 3) && h > 26) {
      context.lineJoin = "round";
      context.lineWidth = 4;
      context.strokeStyle = colors.surface;
      context.strokeText(label, x + 6, y + 19);
      context.fillStyle = colors.ink;
      context.fillText(label, x + 6, y + 19);
    }
  });
}
