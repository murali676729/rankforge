// Packs the desktop app into release/Ranker Flown-win32-x64/Ranker Flown.exe.
// Run through "npm run app:build", which first builds the editor into dist-app/.
const fs = require('node:fs');
const path = require('node:path');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');

if (!fs.existsSync(path.join(root, 'dist-app', 'index.html'))) {
  console.error('dist-app/ is missing. Run "npm run app:build" instead of this script directly.');
  process.exit(1);
}

// The editor is fully bundled by Vite, so the app only needs these. Everything else
// (src/, node_modules/, release/ …) stays out of the package.
const KEEP = [/^\/package\.json$/, /^\/electron(\/|$)/, /^\/dist-app(\/|$)/];

packager({
  dir: root,
  out: path.join(root, 'release'),
  name: 'Ranker Flown',
  executableName: 'Ranker Flown',
  platform: 'win32',
  arch: 'x64',
  icon: path.join(root, 'electron', 'icon.ico'),
  overwrite: true,
  asar: true,
  prune: false,
  ignore: (p) => p !== '' && !KEEP.some((re) => re.test(p.replace(/\\/g, '/'))),
  win32metadata: { ProductName: 'Ranker Flown', FileDescription: 'Ranker Flown video editor', CompanyName: 'Ranker Flown' },
})
  .then(([dir]) => console.log(`\nDone: ${path.join(dir, 'Ranker Flown.exe')}`))
  .catch((e) => {
    console.error('\nPackaging failed:', e.message || e);
    process.exit(1);
  });
