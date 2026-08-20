/**
 * Resolve `sharp` out of the DSH harness profile instead of installing a
 * second copy here. Loaded through `createRequire` anchored at the profile's
 * node_modules, so this workspace needs no `node_modules` of its own — and no
 * directory junction that a recursive delete could follow.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const anchors = [
  join(homedir(), '.dsh', 'profiles', 'node_modules'),
  join(process.env.DSH_HOME ?? '', 'profiles', 'node_modules'),
  join(process.env.DSH_HOME ?? '', 'profiles', 'web', 'node_modules'),
].filter((dir) => dir !== '' && existsSync(dir))

let loaded
for (const dir of anchors) {
  try {
    loaded = createRequire(join(dir, 'anchor.cjs'))('sharp')
    break
  } catch {
    // Try the next anchor.
  }
}
if (loaded === undefined) {
  throw new Error(`sharp not resolvable from any of:\n  ${anchors.join('\n  ') || '(no candidate directories exist)'}`)
}

export default loaded
