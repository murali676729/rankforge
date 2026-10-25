# Ranker Flown (RankForge Studio)

A browser-based video editor for making ranked "Top N" countdown videos.

- **Use it online:** https://murali676729.github.io/rankforge/ (Chrome or Edge, since export uses WebCodecs)
- **Windows desktop app:** download `Ranker-Flown-win32-x64.zip` from [Releases](https://github.com/murali676729/rankforge/releases/latest), unzip, and run `Ranker Flown.exe`

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev        # editor at http://localhost:5173
```

On Windows you can also double-click `Start Ranker Flown.bat`.

## Build

```bash
npm run build      # website → dist/
npm run app:build  # desktop app → release/Ranker Flown-win32-x64/
```

Every push to `main` rebuilds and publishes the website through GitHub Actions (`.github/workflows/deploy.yml`).
