# BELL ($BELL) – "Paid at the opening bell."

Statisk sajt: `index.html`, `styles.css`, `app.js`, `config.js` och lokala Geist-typsnitt. Ingen build behövs.

## Vid launch
Öppna `config.js` och fyll i:
- `ca` – contract address (CA-pillret i menyn syns först när det finns)
- `buyUrl` – länken till coinen på StonkFun
- `xUrl` – X-kontot

## Vad som är riktigt och vad som är simulerat
- **Riktigt:** nedräkningen till NYSE-öppning 09:30 New York (sommartid och börsens helgdagar inräknade), 24h-urtavlan, besökarens lokala tid, aktiepriserna och 24h-rörelsen på tavlan (xStocks via Jupiter, med DexScreener som reserv), vilken aktie som leder, samt kalkylatorn.
- **Simulerat:** potten, avgiftsflödet och utdelningen. Det står "Simulated pot on live stock prices." under urtavlan. Sätt `simulate: false` när riktig on-chain-data kopplas in.
- Knappen "Ring the bell" spelar upp en demo av utdelningen. Klockan ringer automatiskt på riktigt 09:30 New York om sidan är öppen.

## Priser
1. Jupiter Tokens API v2 (`/tokens/v2/search`) hittar varje xStock och dess mint. Mintarna sparas i webbläsaren i 24 h.
2. Jupiter Price API v3 uppdaterar priserna var 30:e sekund (keyless, först `api.jup.ag`, sedan `lite-api.jup.ag`).
3. Svarar inte Jupiter används DexScreener. Svarar ingen visas referenspriser, och det står tydligt på sidan.

## Underhåll
- `holidays` i `config.js` täcker 2026–2027. Lägg till 2028 nästa höst.
- Aktierna på tavlan ändras i `board` i `config.js`.

## Deploy
Dra mappen till Vercel eller pusha till GitHub och importera. Inga miljövariabler.

Typsnitt: Geist och Geist Mono (SIL Open Font License, se `fonts/LICENSE-Geist.txt`).
