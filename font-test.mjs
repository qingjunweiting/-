import sharp from 'sharp'
import { existsSync } from 'node:fs'

const TEXT = 'token剩余：¥9.24'
const fonts = [
  { name: 'msyhbd.ttc', file: 'C:\\Windows\\Fonts\\msyhbd.ttc', family: 'Microsoft YaHei' },
  { name: 'msyh.ttc', file: 'C:\\Windows\\Fonts\\msyh.ttc', family: 'Microsoft YaHei' },
  { name: 'simhei.ttf', file: 'C:\\Windows\\Fonts\\simhei.ttf', family: 'SimHei' },
  { name: 'Dengb.ttf', file: 'C:\\Windows\\Fonts\\Dengb.ttf', family: 'DengXian' },
]

// ink metrics: how many dark pixels, bbox, and a coarse bitmap so tofu boxes are detectable
async function metrics(buf, label) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels
  let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C
    if (data[i + 3] > 60) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  console.log(`[${label}] size=${W}x${H} ink=${n} bbox=${x0}..${x1} / ${y0}..${y1} (w=${x1 - x0 + 1} h=${y1 - y0 + 1})`)
  if (n === 0) return { ok: false }
  // coarse bitmap
  const cols = Math.min(110, x1 - x0 + 1)
  const rows = Math.min(26, y1 - y0 + 1)
  for (let ry = 0; ry < rows; ry++) {
    const y = y0 + Math.round(ry * (y1 - y0) / Math.max(1, rows - 1))
    let line = ''
    for (let rx = 0; rx < cols; rx++) {
      const x = x0 + Math.round(rx * (x1 - x0) / Math.max(1, cols - 1))
      const i = (y * W + x) * C
      line += data[i + 3] > 120 ? '#' : data[i + 3] > 40 ? '+' : '.'
    }
    console.log('    ' + line)
  }
  return { ok: true, w: x1 - x0 + 1, h: y1 - y0 + 1, ink: n }
}

for (const f of fonts) {
  if (!existsSync(f.file)) { console.log('missing', f.file); continue }
  try {
    const buf = await sharp({
      text: { text: TEXT, font: `${f.family} Bold 22`, fontfile: f.file, rgba: true, dpi: 72 },
    }).png().toBuffer()
    await metrics(buf, 'sharp-text ' + f.name)
  } catch (e) {
    console.log('[sharp-text ' + f.name + '] FAILED:', String(e.message).slice(0, 200))
  }
}

// SVG path (librsvg) with explicit family
try {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"><text x="120" y="40" font-family="Microsoft YaHei" font-size="24" font-weight="bold" fill="#1a1a1a" text-anchor="middle">${TEXT}</text></svg>`
  const buf = await sharp(Buffer.from(svg)).png().toBuffer()
  await metrics(buf, 'svg-text')
} catch (e) {
  console.log('[svg-text] FAILED:', String(e.message).slice(0, 200))
}
