# BELL ($BELL) – "Paid at the opening bell."

Statisk sajt utan bygge: `index.html`, `styles.css`, `app.js`, `config.js`, `assets/` och `fonts/`. Dra mappen till Vercel eller importera repot.

## Vid launch
Öppna `config.js` och fyll i:
- `ca` – contract address (CA-knappen i menyn syns först när den finns)
- `buyUrl` – länken till coinen på StonkFun
- `xUrl` – X-kontot

## Din backend
Sätt `potEndpoint` i `config.js` till din adress. Sajten läser den var 15:e sekund och slutar då simulera potten (etiketten "Simulated" försvinner).
Svaret ska vara JSON: `{ "pot": 412.55 }`, alltså potten i USD.

## Vad som är riktigt och vad som är simulerat
- **Riktigt:** nedräkningen till NYSE:s öppning 09:30 New York (sommartid och börsens helgdagar inräknade), kalendern, besökarens lokala tid, tavlan med 10 xStocks (priser via Jupiter, DexScreener som reserv), ledaren och kalkylatorn.
- **Simulerat tills backenden är kopplad:** potten.
- **Förklaring, inte data:** urtavlan som spelar upp en dag när man scrollar.
- "Ring the bell" är en demo. Klockan ringer också av sig själv 09:30 New York om sidan är öppen. Ljud spelas bara efter att besökaren tryckt på knappen.

## 3D-klockan
- `assets/bell-scene.js` är live-klockan (three.js, pendelfysik, kläpp som slår). Den byggs från `src/bell-scene.js`:
  `npx esbuild src/bell-scene.js --bundle --minify --format=esm --outfile=assets/bell-scene.js` (kräver `npm i three esbuild`).
- Klarar inte webbläsaren WebGL, eller har besökaren valt reducerad rörelse, visas stillbilden `assets/bell-frame.png` i stället.
- Loggan och faviconen är coin-bilden (`assets/bell-mark.png`, `assets/favicon-64.png`).

## Underhåll
- `holidays` i `config.js` täcker 2026–2027. Lägg till 2028 nästa höst.
- Aktierna på tavlan ändras i `board` i `config.js`.

Typsnitt: Geist och Geist Mono (SIL Open Font License, se `fonts/LICENSE-Geist.txt`).
