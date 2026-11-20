// news-image-20261120 — "The World in One Day", Friday 20 November 2026.
// Draws a newspaper front page of the day's world news as one 1024x1024 PNG.
// Node 22 stdlib only: no network, no dependencies, fully deterministic.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- PNG ----
// Minimal PNG encoder: 8-bit RGB, one IDAT chunk, fixed compression level
// (zlib output is deterministic for identical input, so two runs agree).

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // One filter byte (0 = none) per scanline, then the raw RGB rows.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (1 + width * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ canvas ----
const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

const PAPER: RGB = [247, 240, 224];
const INK: RGB = [27, 42, 74];
const RED: RGB = [179, 38, 30];
const GOLD: RGB = [201, 162, 39];
const GREY: RGB = [110, 105, 92];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [20, 20, 24];
const SKY: RGB = [168, 205, 232];
const SEA: RGB = [46, 110, 138];
const GREEN: RGB = [46, 125, 72];
const NAVY_BG: RGB = [22, 34, 66];
const CREAM: RGB = [253, 248, 235];

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      i += 3;
    }
  }
}

function outlineRect(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

// Bresenham line, t pixels thick (square brush).
function drawLine(x0: number, y0: number, x1: number, y1: number, c: RGB, t: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (;;) {
    fillRect(x - half, y - half, t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    fillRect(cx - half, cy + y, half * 2 + 1, 1, c);
  }
}

function ringCircle(cx: number, cy: number, r: number, c: RGB, t: number): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      setPixel(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
    }
  }
}

// Filled triangle (scanline).
function fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: [number, number, number, number][] = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.floor(Math.min(...xs));
      const hi = Math.ceil(Math.max(...xs));
      fillRect(lo, y, hi - lo + 1, 1, c);
    }
  }
}

// -------------------------------------------------------------- font ----
// Hand-drawn 5x7 bitmap font. Each glyph is 7 rows of 5 cells; "1" is ink.
// Only the characters this page needs: A-Z, 0-9 and common punctuation.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function drawGlyph(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = GLYPHS[ch] ?? GLYPHS["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "1") fillRect(x + col * s, y + r * s, s, s, c);
    }
  }
}

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): number {
  for (let i = 0; i < s.length; i++) drawGlyph(s[i], x + i * 6 * scale, y, scale, c);
  return textWidth(s, scale);
}

function drawTextCentred(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Greedy word wrap; returns lines that fit maxW at the given scale.
function wrapText(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped lines; returns the y just below the last line.
function drawPara(s: string, x: number, y: number, scale: number, c: RGB, maxW: number, gap: number): number {
  const lines = wrapText(s, scale, maxW);
  let yy = y;
  for (const ln of lines) {
    drawText(ln, x, yy, scale, c);
    yy += 7 * scale + gap;
  }
  return yy;
}

// ------------------------------------------------------ illustrations ----
// Each picture is drawn with plain shapes inside its own box (x, y, w, h).

// Lead picture: a calendar page turned to 2027, with the 20th circled.
function drawCalendar(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CREAM);
  outlineRect(x, y, w, h, INK, 3);
  // Red header band with the year.
  fillRect(x + 3, y + 3, w - 6, 34, RED);
  drawTextCentred("2027", x + Math.floor(w / 2), y + 9, 3, WHITE);
  // Month label.
  drawTextCentred("JANUARY", x + Math.floor(w / 2), y + 46, 2, INK);
  // Day grid: 7 columns x 3 rows of small squares; the 1st circled in red.
  const cell = 26;
  const gx = x + Math.floor((w - 7 * cell) / 2);
  const gy = y + 68;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 7; c++) {
      const cx = gx + c * cell;
      const cy = gy + r * cell;
      outlineRect(cx + 3, cy + 3, cell - 6, cell - 6, GREY, 1);
    }
  }
  ringCircle(gx + 3 + Math.floor(cell / 2), gy + 3 + Math.floor(cell / 2), 12, RED, 3);
  // Arrow sweeping from "20 NOV 2026" up to the new year.
  drawText("20 NOV 2026", x + 16, y + h - 26, 2, INK);
  drawLine(x + 150, y + h - 18, x + w - 40, y + 52, GOLD, 5);
  fillTriangle(x + w - 40, y + 52, x + w - 62, y + 48, x + w - 44, y + 70, GOLD);
}

// Cyclone over India's east coast: spiral cloud, rain, green land.
function drawCyclone(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  outlineRect(x, y, w, h, INK, 2);
  // Spiral: concentric arcs around the eye, sized to the box.
  const cx = x + Math.floor(w * 0.55);
  const cy = y + Math.floor(h * 0.48);
  const eyeR = Math.max(6, Math.round(h * 0.09));
  for (const f of [0.13, 0.24, 0.35, 0.46]) ringCircle(cx, cy, Math.round(f * h), WHITE, 5);
  fillCircle(cx, cy, eyeR, INK);
  fillCircle(cx, cy, Math.max(3, Math.floor(eyeR / 2)), WHITE);
  // Rain slashes across the sky.
  const nRain = Math.floor(w / 44);
  for (let i = 0; i < nRain; i++) {
    const rx = 14 + i * 44;
    const ry = 10 + (i % 3) * 12;
    drawLine(x + rx, y + ry, x + rx - 6, y + ry + 15, SEA, 3);
  }
  // Green coastline at the bottom with the label.
  const landH = Math.max(20, Math.round(h * 0.24));
  fillRect(x, y + h - landH, w, landH, GREEN);
  drawText("INDIA", x + 12, y + h - landH + 5, 2, WHITE);
  const od = "ODISHA";
  drawText(od, x + w - 12 - textWidth(od, 2), y + h - landH + 5, 2, WHITE);
}

// Two flags facing each other over a table: Europe and Russia talk.
function drawTalkFlags(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, CREAM);
  outlineRect(x, y, w, h, INK, 2);
  const fw = Math.floor(w * 0.34);
  const fh = Math.floor(h * 0.52);
  const fy = y + 8;
  // EU flag: blue field, ring of gold stars.
  const ex = x + 14;
  fillRect(ex, fy, fw, fh, [0, 51, 153]);
  outlineRect(ex, fy, fw, fh, INK, 2);
  const starR = Math.max(8, Math.floor(fh * 0.32));
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 - Math.PI / 2;
    fillCircle(Math.round(ex + fw / 2 + starR * Math.cos(a)), Math.round(fy + fh / 2 + starR * Math.sin(a)), 3, GOLD);
  }
  // Russian tricolour.
  const rx = x + w - 14 - fw;
  const band = Math.floor(fh / 3);
  fillRect(rx, fy, fw, band, WHITE);
  fillRect(rx, fy + band, fw, band, [0, 57, 166]);
  fillRect(rx, fy + 2 * band, fw, fh - 2 * band, [213, 0, 50]);
  outlineRect(rx, fy, fw, fh, INK, 2);
  // Olive branch between the flags: stem with four leaves.
  const bx = x + Math.floor(w / 2);
  const by = fy + fh + 5;
  const stemH = Math.max(10, h - (by - y) - 6);
  drawLine(bx, by, bx, by + stemH, GREEN, 4);
  fillTriangle(bx, by + 4, bx - 18, by - 2, bx - 18, by + 10, GREEN);
  fillTriangle(bx, by + 4, bx + 18, by - 2, bx + 18, by + 10, GREEN);
  fillTriangle(bx, by + stemH - 4, bx - 18, by + stemH - 10, bx - 18, by + stemH + 2, GREEN);
  fillTriangle(bx, by + stemH - 4, bx + 18, by + stemH - 10, bx + 18, by + stemH + 2, GREEN);
}

// Hayabusa2: gold probe, grey asteroid, dashed path bending away.
function drawProbe(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, NAVY_BG);
  outlineRect(x, y, w, h, INK, 2);
  // Stars.
  for (let i = 0; i < 9; i++) {
    const sx = Math.floor(w * (0.06 + 0.11 * i));
    const sy = Math.floor(h * (0.12 + 0.09 * ((i * 5) % 4)));
    fillRect(x + sx, y + sy, 3, 3, WHITE);
  }
  // Asteroid (bottom right).
  const ax = x + Math.floor(w * 0.76);
  const ay = y + Math.floor(h * 0.66);
  const ar = Math.max(12, Math.round(h * 0.26));
  fillCircle(ax, ay, ar, [140, 140, 148]);
  fillCircle(ax - Math.floor(ar * 0.35), ay - Math.floor(ar * 0.3), Math.max(3, Math.floor(ar * 0.22)), [110, 110, 118]);
  fillCircle(ax + Math.floor(ar * 0.4), ay + Math.floor(ar * 0.35), Math.max(2, Math.floor(ar * 0.16)), [110, 110, 118]);
  // Probe (centre left): gold body, blue panels.
  const px = x + Math.floor(w * 0.3);
  const py = y + Math.floor(h * 0.42);
  const ph = Math.max(10, Math.round(h * 0.3));
  const pw = Math.round(ph * 1.5);
  const panelW = Math.round(pw * 0.85);
  fillRect(px - panelW - 2, py - Math.floor(ph / 4), panelW, Math.floor(ph / 2), [0, 90, 160]);
  fillRect(px, py - Math.floor(ph / 2), pw, ph, GOLD);
  fillRect(px + pw + 2, py - Math.floor(ph / 4), panelW, Math.floor(ph / 2), [0, 90, 160]);
  fillCircle(px + Math.floor(pw / 2), py, Math.max(3, Math.floor(ph / 4)), WHITE);
  // Dashed path from the probe toward the asteroid, crossed out.
  const dashY = py + Math.floor(h * 0.2);
  const dashX0 = px + pw + panelW + 8;
  const dashX1 = ax - ar - 6;
  for (let dx = dashX0; dx < dashX1; dx += 16) fillRect(dx, dashY, 10, 3, RED);
  const cx0 = ax - ar - 2;
  const cy0 = ay - ar - 2;
  drawLine(cx0, cy0, cx0 + 16, cy0 + 16, RED, 3);
  drawLine(cx0 + 16, cy0, cx0, cy0 + 16, RED, 3);
  drawText("NO LANDING", x + 10, y + h - 18, 2, WHITE);
}

// GTA VI: night skyline, gold "VI", sales tag.
function drawCity(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, NAVY_BG);
  outlineRect(x, y, w, h, INK, 2);
  // Moon.
  fillCircle(x + Math.floor(w * 0.12), y + Math.floor(h * 0.16), Math.max(6, Math.round(h * 0.11)), GOLD);
  // Skyline silhouettes with lit windows.
  const nB = 7;
  const bw = Math.floor((w - 16 - (nB - 1) * 4) / nB);
  let bx = x + 8;
  for (let i = 0; i < nB; i++) {
    const top = Math.floor(h * (0.3 + 0.12 * ((i * 3) % 4)));
    const bh = h - top - Math.floor(h * 0.16);
    fillRect(bx, y + top, bw, bh, BLACK);
    for (let wy = y + top + 7; wy < y + h - Math.floor(h * 0.2); wy += 13) {
      for (let wx = bx + 5; wx < bx + bw - 5; wx += 11) {
        if ((wx * 7 + wy * 3) % 5 < 2) fillRect(wx, wy, 4, 5, GOLD);
      }
    }
    bx += bw + 4;
  }
  // Street glow at the bottom.
  fillRect(x, y + h - Math.floor(h * 0.16), w, Math.floor(h * 0.16), [30, 90, 140]);
  // Big "VI" in the sky and the sales tag.
  drawText("VI", x + w - 14 - textWidth("VI", 4), y + 6, 4, WHITE);
  drawText("$1.8BN", x + 10, y + h - Math.floor(h * 0.16) - 16, 2, GOLD);
}

// FIFA: green pitch, ball, ballot box.
function drawFootball(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [34, 139, 68]);
  outlineRect(x, y, w, h, INK, 2);
  // Pitch lines.
  outlineRect(x + 10, y + 8, w - 20, h - 16, WHITE, 2);
  drawLine(x + Math.floor(w / 2), y + 8, x + Math.floor(w / 2), y + h - 8, WHITE, 2);
  ringCircle(x + Math.floor(w / 2), y + Math.floor(h / 2), Math.max(8, Math.round(h * 0.16)), WHITE, 2);
  // Soccer ball (left).
  const bx = x + Math.floor(w * 0.24);
  const by = y + Math.floor(h / 2) + 4;
  const br = Math.max(12, Math.round(h * 0.24));
  fillCircle(bx, by, br, WHITE);
  fillCircle(bx, by, Math.max(4, Math.floor(br * 0.32)), BLACK);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    drawLine(
      bx + Math.round(br * 0.32 * Math.cos(a)),
      by + Math.round(br * 0.32 * Math.sin(a)),
      bx + Math.round((br - 2) * Math.cos(a)),
      by + Math.round((br - 2) * Math.sin(a)),
      BLACK,
      2,
    );
  }
  // Ballot box (right) with two slips.
  const kw = Math.floor(w * 0.24);
  const kh = Math.max(24, Math.round(h * 0.46));
  const kx = x + w - 12 - kw;
  const ky = y + Math.floor(h / 2) - Math.floor(kh / 2);
  fillRect(kx, ky, kw, kh, [210, 180, 120]);
  outlineRect(kx, ky, kw, kh, INK, 2);
  fillRect(kx + Math.floor(kw / 2) - 9, ky - 2, 18, 4, INK);
  drawLine(kx + 6, ky - 14, kx + 16, ky - 2, WHITE, 3);
  drawLine(kx + kw - 18, ky - 16, kx + kw - 6, ky - 2, WHITE, 3);
}

// ------------------------------------------------------------- layout ----
// Newspaper front page, 1024x1024. All stories are events reported on
// Friday 20 November 2026 (verified by web search this morning):
//  - Trump puts the Iran war decision off to 2027 (Reuters, 20 Nov)
//  - Cyclone Akvan makes landfall on India's east coast (IMD, 20 Nov)
//  - Europe ready for talks with Russia on ending the Ukraine war (BBC)
//  - Hayabusa2 drops its asteroid landing after engine trouble (Space)
//  - GTA VI sales pass $1.8bn, beyond The Odyssey's global run
//  - Infantino faces two challengers in the 2027 FIFA race

function drawKicker(s: string, x: number, y: number): void {
  drawText(s, x, y, 2, RED);
  drawLine(x, y + 17, x + textWidth(s, 2), y + 17, RED, 2);
}

function drawParaCentred(s: string, cx: number, y: number, scale: number, c: RGB, maxW: number, gap: number): number {
  const lines = wrapText(s, scale, maxW);
  let yy = y;
  for (const ln of lines) {
    drawTextCentred(ln, cx, yy, scale, c);
    yy += 7 * scale + gap;
  }
  return yy;
}

function drawPage(): void {
  fillRect(0, 0, W, H, PAPER);

  // ---- masthead ----
  fillRect(28, 18, 968, 6, INK);
  drawTextCentred("THE WORLD IN ONE DAY", 512, 32, 7, INK);
  drawTextCentred("FRIDAY 20 NOVEMBER 2026", 512, 92, 4, INK);
  fillRect(28, 128, 968, 3, INK);
  fillRect(28, 134, 968, 2, INK);

  // ---- lead story: Trump / Iran ----
  const lead = { x: 28, y: 148, w: 968, h: 212 };
  outlineRect(lead.x, lead.y, lead.w, lead.h, INK, 2);
  drawKicker("WASHINGTON - IRAN", 48, 164);
  drawText("TRUMP PUTS IRAN", 48, 192, 4, INK);
  drawText("DECISION OFF TO 2027", 48, 228, 4, INK);
  drawPara(
    "THE PRESIDENT SAYS THERE IS NO RUSH ON A WAR DECISION AND HE WILL 'SEE WHAT HAPPENS' AFTER 1 JANUARY.",
    48, 268, 2, INK, 600, 4,
  );
  drawCalendar(672, 164, 304, 180);

  // ---- middle row: cyclone + Europe talks ----
  const midY = 376;
  const midH = 260;
  const midBoxes = [
    { x: 28, kicker: "INDIA - WEATHER", head: "AKVAN HITS INDIA'S EAST COAST", body: "AKVAN MAKES LANDFALL NEAR GOPALPUR; 300,000 EVACUATED." },
    { x: 528, kicker: "EUROPE - UKRAINE", head: "EUROPE READY TO TALK TO RUSSIA", body: "LEADERS SAY EUROPE IS READY FOR TALKS WITH MOSCOW ON ENDING THE WAR." },
  ];
  for (let i = 0; i < midBoxes.length; i++) {
    const b = midBoxes[i];
    outlineRect(b.x, midY, 468, midH, INK, 2);
    drawKicker(b.kicker, b.x + 16, 390);
    drawPara(b.head, b.x + 16, 412, 4, INK, 436, 8);
    if (i === 0) drawCyclone(b.x + 16, 492, 436, 88);
    else drawTalkFlags(b.x + 16, 492, 436, 88);
    drawPara(b.body, b.x + 16, 588, 2, INK, 436, 4);
  }

  // ---- bottom row: space, games, football ----
  const botY = 652;
  const botH = 244;
  const botBoxes = [
    { x: 28, kicker: "SPACE - JAPAN", head: "ENGINE TROUBLE ENDS ASTEROID LANDING", body: "HAYABUSA2 DROPS ITS ASTEROID LANDING AND CHANGES COURSE." },
    { x: 358, kicker: "CULTURE - GAMES", head: "GTA VI PASSES $1.8BN IN SALES", body: "GTA VI HAS ALREADY OUTSOLD THE ODYSSEY'S GLOBAL RUN." },
    { x: 688, kicker: "SPORT - FOOTBALL", head: "TWO TO CHALLENGE INFANTINO", body: "INFANTINO FACES TWO CHALLENGERS IN THE 2027 FIFA RACE." },
  ];
  for (let i = 0; i < botBoxes.length; i++) {
    const b = botBoxes[i];
    outlineRect(b.x, botY, 312, botH, INK, 2);
    drawKicker(b.kicker, b.x + 16, 666);
    drawPara(b.head, b.x + 16, 686, 3, INK, 280, 6);
    if (i === 0) drawProbe(b.x + 16, 773, 280, 54);
    else if (i === 1) drawCity(b.x + 16, 773, 280, 54);
    else drawFootball(b.x + 16, 773, 280, 54);
    drawPara(b.body, b.x + 16, 833, 2, INK, 280, 4);
  }

  // ---- the day in numbers ----
  const numY = 910;
  outlineRect(28, numY, 968, 86, INK, 2);
  drawTextCentred("THE DAY IN NUMBERS", 512, numY + 4, 2, RED);
  const nums: [string, string][] = [
    ["2027", "IRAN DECISION DELAYED TO"],
    ["300,000", "EVACUATED AS AKVAN LANDED"],
    ["$1.8BN", "GTA VI SALES IN ONE DAY"],
    ["110", "KM/H GUSTS AT AKVAN LANDFALL"],
    ["2", "CHALLENGERS TO INFANTINO"],
  ];
  for (let i = 0; i < nums.length; i++) {
    const cx = 28 + Math.floor((i + 0.5) * (968 / 5));
    drawTextCentred(nums[i][0], cx, numY + 20, 4, INK);
    drawParaCentred(nums[i][1], cx, numY + 50, 2, INK, 180, 2);
  }

  // ---- footer ----
  drawTextCentred("DRAWN FROM REPORTS OF FRIDAY 20 NOVEMBER 2026", 512, 1006, 2, GREY);
}

// ---------------------------------------------------------------- main ----
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
mkdirSync(outDir, { recursive: true });
drawPage();
writeFileSync(join(outDir, "entry.png"), encodePNG(W, H, buf));
