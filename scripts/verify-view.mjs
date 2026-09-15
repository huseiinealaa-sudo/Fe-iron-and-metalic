/**
 * Drives the built application in a real browser.
 *
 * It checks the things a type-checker cannot: that the patched shaders compile,
 * that nothing throws at runtime, and that every mode renders at both iPad Pro
 * orientations.
 *
 *   npm run build && node scripts/verify-view.mjs
 *
 * Screenshots land in .shots/ (git-ignored).
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname
const PORT = 4183
const BASE = `http://127.0.0.1:${PORT}/Fe-iron-and-metalic/`
const MODES = ['tension', 'compression', 'bending', 'torsion', 'shear', 'fatigue',
  'creep', 'impact', 'pitting', 'scc', 'igc', 'hydrogen']
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace('/Fe-iron-and-metalic', '')
  if (p === '/' || p === '') p = '/index.html'
  const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''))
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((r) => server.listen(PORT, r))

if (!existsSync('.shots')) mkdirSync('.shots')

// The sandbox ships its own Chromium; use it rather than downloading one.
const PREINSTALLED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({
  executablePath: existsSync(PREINSTALLED) ? PREINSTALLED : undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
})

let problems = 0
const seen = new Set()

for (const [name, width, height] of [['portrait', 1024, 1366], ['landscape', 1366, 1024]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = m.text()
      if (/WebGL|shader|THREE|Error|error/i.test(t) && !seen.has(t)) { seen.add(t); console.log(`  [${m.type()}] ${t.slice(0, 400)}`); problems++ }
    }
  })
  page.on('pageerror', (e) => { console.log(`  [pageerror] ${e.message.slice(0, 400)}`); problems++ })

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  const hasCanvas = await page.locator('canvas').count()
  console.log(`${name} ${width}x${height}: canvas=${hasCanvas}`)
  if (!hasCanvas) problems++

  // The page must never scroll sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) { console.log(`  horizontal overflow of ${overflow}px`); problems++ }

  for (const mode of MODES) {
    await page.click(`nav button[data-mode="${mode}"]`)
    // Drive the primary slider to its far end so the failure is on screen.
    // React tracks the previous value, so assigning el.value is ignored.
    // The native setter is the supported way to drive a controlled input.
    const slider = page.locator('input[type=range]').first()
    await slider.evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(el, el.max)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(900)
    const driven = await slider.inputValue()
    if (driven !== (await slider.getAttribute('max'))) {
      console.log(`  slider for ${mode} did not take the value`); problems++
    }
    if (name === 'landscape') await page.screenshot({ path: `.shots/${mode}.png` })
  }

  await page.screenshot({ path: `.shots/layout-${name}.png`, fullPage: false })
  await ctx.close()
}

await browser.close()
server.close()
console.log(problems === 0 ? '\nVIEW OK — no runtime or shader errors\n' : `\n${problems} PROBLEM(S)\n`)
process.exit(problems === 0 ? 0 : 1)
