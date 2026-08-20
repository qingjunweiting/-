import sharp from './sharp-loader.mjs'

const src = process.argv[2] ?? 'source.png'
const img = sharp(src).ensureAlpha()
const meta = await img.metadata()
console.log('meta:', meta.width, meta.height, meta.channels, 'hasAlpha=', meta.hasAlpha)

const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height, C = info.channels
const px = (x, y) => {
  const i = (y * W + x) * C
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: C > 3 ? data[i + 3] : 255 }
}

// 1) ASCII map: sample grid, classify pixel
const cols = 85
const rows = 56
const step = 'ascii'
let out = ''
const glyph = (p) => {
  if (p.a < 40) return '.'                       // transparent
  const lum = 0.299 * p.r + 0.587 * p.g + 0.114 * p.b
  if (lum > 225) return '#'                      // near-white
  if (lum > 170) return '+'
  if (lum > 110) return 'o'
  if (lum > 55) return '-'
  return ' '                                     // very dark
}
out += '    ' + Array.from({ length: cols }, (_, i) => (i % 10 === 0 ? String(Math.floor(i / 10)) : ' ')).join('') + '\n'
for (let ry = 0; ry < rows; ry++) {
  const y = Math.min(H - 1, Math.round((ry + 0.5) * H / rows))
  let line = String(y).padStart(3, ' ') + ' '
  for (let rx = 0; rx < cols; rx++) {
    const x = Math.min(W - 1, Math.round((rx + 0.5) * W / cols))
    line += glyph(px(x, y))
  }
  out += line + '\n'
}
console.log('--- ASCII (.=transparent  =dark -=dim o=mid +=light #=white) ---')
console.log(out)

// 2) alpha bounding box of visible content
let minX = W, minY = H, maxX = -1, maxY = -1
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (px(x, y).a > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
}
console.log('visible bbox:', { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 })

// 3) per-row stats for the top half: opaque count, mean color
console.log('--- per-row stats (y, opaqueCount, meanR,G,B of opaque, whiteish count) ---')
for (let y = 0; y < H; y += 4) {
  let n = 0, r = 0, g = 0, b = 0, white = 0, x0 = -1, x1 = -1
  for (let x = 0; x < W; x++) {
    const p = px(x, y)
    if (p.a > 24) {
      n++; r += p.r; g += p.g; b += p.b
      if (x0 < 0) x0 = x
      x1 = x
      if (0.299 * p.r + 0.587 * p.g + 0.114 * p.b > 215) white++
    }
  }
  if (n) console.log(String(y).padStart(3), 'n=' + String(n).padStart(3), 'x=' + String(x0).padStart(3) + '-' + String(x1).padStart(3), 'rgb=' + [r / n, g / n, b / n].map(v => Math.round(v)).join(','), 'white=' + white)
}

// 4) dominant colors (quantized)
const buckets = new Map()
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = px(x, y)
  if (p.a < 24) continue
  const k = `${p.r >> 4}:${p.g >> 4}:${p.b >> 4}`
  const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
  e.n++; e.r += p.r; e.g += p.g; e.b += p.b
  buckets.set(k, e)
}
const top = [...buckets.values()].sort((a, b2) => b2.n - a.n).slice(0, 14)
console.log('--- dominant colors ---')
for (const e of top) {
  const hex = '#' + [e.r / e.n, e.g / e.n, e.b / e.n].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
  console.log(hex, e.n, ((100 * e.n) / (W * H)).toFixed(1) + '%')
}
