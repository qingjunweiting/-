/**
 * Produce the plugin's character asset: the source screenshot with the speech
 * bubble's interior wiped back to clean white, so the browser half can paint
 * live balance text over it as real HTML instead of baked pixels.
 *
 * Geometry was measured from the source (255x340):
 *   bubble stroke  y 2..74
 *   white interior y 5..72, x 13..241 at the widest row
 *   old text bbox  x 74..175, y 25..49
 * The wipe rect below stays strictly inside the white interior on every row,
 * so the rounded corners and the dark outline survive untouched.
 */
import sharp from './sharp-loader.mjs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SRC = process.argv[2]
const OUT = process.argv[3]

const WIPE = { x0: 24, y0: 6, x1: 231, y1: 71 }
const WHITE = [255, 255, 255]

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height, C = info.channels
if (C !== 4) throw new Error(`expected RGBA, got ${C} channels`)

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

// Guard: every pixel we are about to overwrite must be bubble material —
// opaque and either near-white paper or dark glyph ink. A coloured pixel here
// would mean the measured rect leaked onto the character.
let suspicious = 0
for (let y = WIPE.y0; y <= WIPE.y1; y++) {
  for (let x = WIPE.x0; x <= WIPE.x1; x++) {
    const i = (y * W + x) * C
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    const grey = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) < 42
    if (a < 200 || !grey) suspicious++
    void lum
  }
}
const area = (WIPE.x1 - WIPE.x0 + 1) * (WIPE.y1 - WIPE.y0 + 1)
console.log(`wipe rect ${WIPE.x0},${WIPE.y0} -> ${WIPE.x1},${WIPE.y1} (${area}px), non-bubble pixels: ${suspicious}`)
if (suspicious > area * 0.01) throw new Error('wipe rect leaks outside the speech bubble — re-measure')

const out = Buffer.from(data)
for (let y = WIPE.y0; y <= WIPE.y1; y++) {
  for (let x = WIPE.x0; x <= WIPE.x1; x++) {
    const i = (y * W + x) * C
    out[i] = WHITE[0]; out[i + 1] = WHITE[1]; out[i + 2] = WHITE[2]; out[i + 3] = 255
  }
}

mkdirSync(dirname(OUT), { recursive: true })
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(OUT)

// Verify the result: no dark ink left inside the wipe rect, outline still dark.
const check = await sharp(OUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
let inkInside = 0
for (let y = WIPE.y0; y <= WIPE.y1; y++) for (let x = WIPE.x0; x <= WIPE.x1; x++) {
  const i = (y * W + x) * C
  if (lum(check.data[i], check.data[i + 1], check.data[i + 2]) < 200) inkInside++
}
let outlineDark = 0
for (let x = 40; x < 215; x++) { const i = (3 * W + x) * C; if (lum(check.data[i], check.data[i + 1], check.data[i + 2]) < 120) outlineDark++ }
console.log(`written ${OUT}  (${W}x${H})  ink left inside bubble: ${inkInside}  outline pixels intact on row 3: ${outlineDark}`)
if (inkInside !== 0) throw new Error('old bubble text was not fully erased')
if (outlineDark < 100) throw new Error('bubble outline was damaged')
