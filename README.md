# games.benspotswood.com

A small games site. Each game lives in its own folder and is served at `games.benspotswood.com/<game>/`.

| Path | What |
|---|---|
| `index.html`, `src/hub/` | Hub page listing the games |
| `keepfall/index.html`, `src/keepfall/` | **Keepfall**, a turn-based castle card battle |

## Working on it

```
npm install      # once
npm run dev      # local dev server with live reload
npm test         # rules engine + AI tests
npm run build    # production files in dist/
```

## Keepfall code layout

- `types.ts` – game state, card and rule types
- `cards.ts` – every card, as data. Add or rebalance cards here.
- `engine.ts` – the rules: `step(state, action) → newState`. Pure, seeded, no UI.
- `ai.ts` – opponent AI (easy / normal / hard)
- `main.ts`, `style.css` – the screen
- `balance.test.ts` – runs 200 AI-vs-AI games and prints win stats and card play counts

## Deploying

Every push to `main` builds the site and uploads `dist/` to Hostinger via `.github/workflows/deploy.yml`.

One-time setup:

1. **Hostinger hPanel → Files → FTP Accounts**: create an FTP account whose directory is the `games` subdomain folder.
2. **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**:
   - `FTP_SERVER` – FTP hostname shown in hPanel
   - `FTP_USERNAME` – the FTP account's username
   - `FTP_PASSWORD` – its password
   - `FTP_SERVER_DIR` – *optional*, only if the FTP account isn't limited to the games folder (must end in `/`)
3. Push to `main`, or run the workflow manually from the **Actions** tab.
