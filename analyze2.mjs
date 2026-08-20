import sharp from './sharp-loader.mjs'

const src = process.argv[2]
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height, C = info.channels
const at = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2], data[i + 3]] }
const lum = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]

// --- find the white bubble body: rows where >60% of opaque pixels are near-white
const rowInfo = []
for (let y = 0; y < H; y++) {
  let n = 0, white = 0, x0 = -1, x1 = -1
  for (let x = 0; x < W; x++) {
    const p = at(x, y)
    if (p[3] < 24) continue
    n++
    if (lum(p) > 200 && Math.abs(p[0] - p[2]) < 18) { white++; if (x0 < 0) x0 = x; x1 = x }
  }
  rowInfo.push({ y, n, white, x0, x1 })
}
const bubbleRows = rowInfo.filter(r => r.n > 100 && r.white / r.n > 0.5 && r.y < H * 0.3)
const top = bubbleRows[0]?.y, bot = bubbleRows[bubbleRows.length - 1]?.y
console.log('bubble white-body rows:', top, '->', bot)

// widest white span inside the bubble
let bx0 = 999, bx1 = -1
for (const r of bubbleRows) { if (r.x0 >= 0 && r.x0 < bx0) bx0 = r.x0; if (r.x1 > bx1) bx1 = r.x1 }
console.log('bubble white x-span:', bx0, '->', bx1)

// --- exact outer bubble incl. dark stroke: scan for dark ring above/below white body
console.log('\nrows near bubble edges (y, n, white, x0..x1, meanLum):')
for (let y = 0; y <= (bot ?? 0) + 8 && y < H; y++) {
  const r = rowInfo[y]
  let n = 0, s = 0, dx0 = -1, dx1 = -1
  for (let x = 0; x < W; x++) { const p = at(x, y); if (p[3] < 24) continue; n++; s += lum(p); if (lum(p) < 110) { if (dx0 < 0) dx0 = x; dx1 = x } }
  if (y < 10 || y > (bot ?? 0) - 6) console.log(String(y).padStart(3), 'n=' + String(n).padStart(3), 'white=' + String(r.white).padStart(3), 'meanLum=' + (n ? Math.round(s / n) : 0), 'darkspan=' + dx0 + '..' + dx1)
}

// --- text bbox: dark pixels strictly inside the white body
const inTop = top + 6, inBot = bot - 6, inL = bx0 + 6, inR = bx1 - 6
let tx0 = 9999, tx1 = -1, ty0 = 9999, ty1 = -1, count = 0
for (let y = inTop; y <= inBot; y++) for (let x = inL; x <= inR; x++) {
  const p = at(x, y)
  if (p[3] < 24) continue
  if (lum(p) < 150) { count++; if (x < tx0) tx0 = x; if (x > tx1) tx1 = x; if (y < ty0) ty0 = y; if (y > ty1) ty1 = y }
}
console.log('\ntext dark-pixel bbox:', { tx0, tx1, ty0, ty1, w: tx1 - tx0 + 1, h: ty1 - ty0 + 1, count })

// column profile of text to count glyph clusters
let prof = ''
for (let x = inL; x <= inR; x++) {
  let c = 0
  for (let y = inTop; y <= inBot; y++) { const p = at(x, y); if (p[3] > 24 && lum(p) < 150) c++ }
  prof += c === 0 ? '.' : c < 4 ? '1' : c < 8 ? '2' : c < 14 ? '3' : '4'
}
console.log('\ntext column profile (x from ' + inL + ' to ' + inR + '):')
console.log(prof)

let rprof = ''
for (let y = inTop; y <= inBot; y++) {
  let c = 0
  for (let x = inL; x <= inR; x++) { const p = at(x, y); if (p[3] > 24 && lum(p) < 150) c++ }
  rprof += `${String(y).padStart(3)} ${'#'.repeat(Math.min(60, c))} (${c})\n`
}
console.log('\ntext row profile:')
console.log(rprof)

// sample the pure bubble background colour (average of a clean patch)
let sr = 0, sg = 0, sb = 0, sn = 0
for (let y = top + 2; y < top + 6; y++) for (let x = bx0 + 20; x < bx1 - 20; x++) { const p = at(x, y); if (p[3] > 200 && lum(p) > 220) { sr += p[0]; sg += p[1]; sb += p[2]; sn++ } }
console.log('bubble bg colour:', '#' + [sr / sn, sg / sn, sb / sn].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), 'samples=' + sn)

// darkest text colour
let best = [255, 255, 255], bl = 999
for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) { const p = at(x, y); if (p[3] > 200 && lum(p) < bl) { bl = lum(p); best = p } }
console.log('darkest text colour:', '#' + best.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''))

// --- pixel map of the bubble interior at 1:1 rows, 1:2 cols so I can read the glyph shapes
console.log('\nbubble interior bitmap (x ' + inL + '..' + inR + ', y ' + inTop + '..' + inBot + '), col step 1:')
for (let y = ty0 - 2; y <= ty1 + 2; y++) {
  let line = String(y).padStart(3) + ' '
  for (let x = tx0 - 2; x <= tx1 + 2; x++) { const p = at(x, y); line += (p[3] > 24 && lum(p) < 150) ? '#' : (p[3] > 24 && lum(p) < 205 ? '+' : '.') }
  console.log(line)
}
