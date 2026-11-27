# games.benspotswood.com

A small games site. Each game lives in its own folder and is served at `games.benspotswood.com/<game>/`.

| Path | What |
|---|---|
| `index.html`, `src/hub/` | Hub page listing the games |
| `kids/index.html`, `src/kidshub/` | **Kids' Games**: the page toddlers pick a game from (Balloon Pop, Match It!, Barnyard, ABC, Toy Phone). In each game ⬅ goes back (game → its start screen → Kids' Games); ⚙️ asks a grown-up sum, then shows settings (`src/kids/nav.ts`, `gate.ts`) |
| `keepfall/index.html`, `src/keepfall/` | **Keepfall**, a turn-based castle card battle |

## Working on it

```
npm install      # once
npm run dev      # local dev server with live reload
npm test         # rules engine + AI tests
npm run build    # production files in dist/
```

## Keepfall code layout

- `types.ts` – game state, card, building and rule types
- `cards.ts` – every card and building, as data, plus upgrades (`archers+`) and the starter deck
- `factions.ts` – factions and shared weather events
- `relics.ts` – campaign relics
- `engine.ts` – the rules: `step(state, action) → newState`. Pure, seeded, no UI.
- `ai.ts` – opponent AI (easy / normal / hard)
- `draft.ts` – card offers and AI drafting
- `campaign.ts` – campaign map, battles, rewards, camps (pure, saveable run state)
- `battle.ts` – the battle screen; `main.ts` – menus, draft and campaign screens; `ui.ts` – shared UI helpers
- `sound.ts` – synthesized sound effects
- `balance.test.ts` – AI-vs-AI games for every faction pairing; prints win rates and card play counts

## Deploying

Every push to `main` builds the site and uploads `dist/` to Hostinger via `.github/workflows/deploy.yml`.

One-time setup:

1. **Hostinger hPanel → Files → FTP Accounts**: use the site's FTP account. Its login starts in `public_html`, and the workflow uploads into `./games/` (the subdomain's folder, `public_html/games`).
2. **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**:
   - `FTP_SERVER` – the **FTP IP** shown in hPanel (no `ftp://`, no port)
   - `FTP_USERNAME` – the FTP account's username
   - `FTP_PASSWORD` – its password
   - `FTP_SERVER_DIR` – *optional*, overrides the upload folder `./games/` (must end in `/`)
3. Push to `main`, or run the workflow manually from the **Actions** tab.
