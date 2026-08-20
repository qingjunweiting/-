/**
 * Render a preview of what the browser half paints: the blank-bubble asset
 * with the balance sentence composited at the same geometry and font size the
 * client uses, so the result can be eyeballed before refreshing the GUI.
 *
 * Usage: node preview.mjs <asset.png> <out.png> [text]
 */
import sharp from './sharp-loader.mjs'

const ASSET = process.argv[2]
const OUT = process.argv[3]

// Mirrors lib/client.js: BUBBLE box + TEXT_RATIO against the 255x340 art.
const ART = { w: 255, h: 340 }
const BUBBLE = { x: 24, y: 6, w: 208, h: 66 }
const TEXT_RATIO = 0.082

const state = await fetch('http://127.0.0.1:60765/api/token-balance/state').then(r => r.json())
const symbol = state.currency === 'CNY' ? '¥' : state.currency === 'USD' ? '$' : ''
const TEXT = process.argv[4] ?? `token剩余：${symbol}${Number(state.total).toFixed(2)}`
console.log('state:', JSON.stringify(state))
console.log('text :', TEXT)

const fontSize = Math.round(ART.w * TEXT_RATIO * 100) / 100
const cx = BUBBLE.x + BUBBLE.w / 2
const cy = BUBBLE.y + BUBBLE.h / 2

/** Ink width of one rendering of the sentence, used to mirror the client's shrink-to-fit. */
async function inkWidth(size) {
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${ART.w * 3}" height="${Math.ceil(size * 3)}">
    <text x="4" y="${size * 1.2}" font-family="Microsoft YaHei" font-size="${size}" font-weight="bold" fill="#000">${TEXT}</text></svg>`
  const { data, info } = await sharp(Buffer.from(probe)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let lo = 1e9, hi = -1
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels + 3] > 60) { if (x < lo) lo = x; if (x > hi) hi = x }
  }
  return hi < 0 ? 0 : hi - lo + 1
}

// Same rule as BubbleLine in lib/client.js: shrink in place rather than spill.
// The client's bubble box carries 3% side padding, so the fit target is the
// box minus that padding.
const ROOM = BUBBLE.w * 0.94
const natural = await inkWidth(fontSize)
const scale = natural > ROOM ? Math.max(0.55, ROOM / natural) : 1
const drawSize = Math.round(fontSize * scale * 100) / 100
console.log(`font ${fontSize}px, natural ink ${natural}px, room ${ROOM.toFixed(1)}px of ${BUBBLE.w}px box -> draw at ${drawSize}px (scale ${scale.toFixed(3)})`)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ART.w}" height="${ART.h}">
  <text x="${cx}" y="${cy}" font-family="Microsoft YaHei" font-size="${drawSize}" font-weight="bold"
        fill="#1a1a1a" text-anchor="middle" dominant-baseline="central">${TEXT}</text>
</svg>`

await sharp(ASSET)
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile(OUT)

// Verify the painted sentence stays inside the bubble interior. Measured as a
// diff against the blank asset, so the bubble's own dark outline is not
// mistaken for text ink.
const { data, info } = await sharp(OUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const before = (await sharp(ASSET).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data
const C = info.channels
let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, painted = 0
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * C
    const delta = Math.abs(data[i] - before[i]) + Math.abs(data[i + 1] - before[i + 1]) + Math.abs(data[i + 2] - before[i + 2])
    if (delta > 24) {
      painted++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
}
console.log(`painted pixels: ${painted}`)
console.log(`painted text bbox: x ${x0}..${x1} (bubble ${BUBBLE.x}..${BUBBLE.x + BUBBLE.w - 1}), y ${y0}..${y1} (bubble ${BUBBLE.y}..${BUBBLE.y + BUBBLE.h - 1})`)
const fits = x0 >= BUBBLE.x && x1 <= BUBBLE.x + BUBBLE.w - 1 && y0 >= BUBBLE.y && y1 <= BUBBLE.y + BUBBLE.h - 1
console.log(fits ? `OK: sentence fits the bubble (${x1 - x0 + 1}x${y1 - y0 + 1}px in ${BUBBLE.w}x${BUBBLE.h}px)` : 'WARNING: sentence overflows the bubble')
if (!fits) process.exitCode = 1
