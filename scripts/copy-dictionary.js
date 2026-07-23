// dictionary-en's package.json only declares `"exports": "./index.js"`, which blocks
// bundler subpath imports like `dictionary-en/index.aff` — it's built strictly for
// Node (its own index.js reads the files off disk at runtime via node:fs). Copying the
// raw Hunspell files into public/ once per install sidesteps that entirely: they become
// plain static assets Vite serves as-is, with none of the package-exports resolution
// rules that break trying to import them directly. Runs automatically via the
// "postinstall" script in package.json so a fresh `npm ci` always has them.
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const destDir = join(root, 'public', 'dictionaries')

async function main() {
  await mkdir(destDir, { recursive: true })
  await copyFile(join(root, 'node_modules', 'dictionary-en', 'index.aff'), join(destDir, 'en.aff'))
  await copyFile(join(root, 'node_modules', 'dictionary-en', 'index.dic'), join(destDir, 'en.dic'))
  console.log('Copied dictionary-en into public/dictionaries/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
