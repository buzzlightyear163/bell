/*
  BELL – allt du behöver ändra vid launch finns här.
  Klistra in CA, länk till coinen och X-kontot. Resten kan stå kvar.
*/
window.BELL = {
  ticker: "$BELL",

  // Contract address. Lämna tomt innan launch: CA-pillret i menyn döljs då.
  ca: "",

  // Var "Buy $BELL"-knapparna leder. Byt till coinens sida på StonkFun vid launch.
  buyUrl: "https://stonkfun.xyz",

  // X-kontot. Lämna tomt för att dölja X-knappen.
  xUrl: "",

  platform: "StonkFun",
  pairedWith: "SPYx",

  // Fördelning av avgifterna (procent).
  potShare: 80,   // till potten som köper aktien åt holders
  burnShare: 20,  // köper tillbaka och bränner $BELL

  supply: 1_000_000_000,

  // Aktierna på tavlan (tokeniserade xStocks på Solana). [symbol, namn]
  board: [
    ["NVDAx", "NVIDIA"],
    ["TSLAx", "Tesla"],
    ["AAPLx", "Apple"],
    ["MSFTx", "Microsoft"],
    ["GOOGLx", "Alphabet"],
    ["AMZNx", "Amazon"],
    ["METAx", "Meta"],
    ["COINx", "Coinbase"],
    ["HOODx", "Robinhood"],
    ["MSTRx", "Strategy"]
  ],

  // Din backend. När den finns: lägg in adressen här, så läser sajten den
  // riktiga potten var 15:e sekund och slutar simulera.
  // Svaret ska vara JSON: { "pot": 412.55 }  (potten i USD)
  // Valfritt: "lastBell": { "stock": "NVDAx", "amount": 1.94, "holders": 1312, "tx": "https://solscan.io/tx/..." }
  potEndpoint: "",

  // Simulerad pott tills backenden är kopplad. Visas med en liten "Simulated"-etikett.
  simulate: true,
  sim: {
    potPerHour: 64,        // ungefär hur fort potten växer, i USD per timme
    holders: 1312          // används i demo-ringningen
  },

  // Visas bara om livepriserna inte går att hämta.
  reference: {
    label: "Oct 28, 2026",
    prices: {
      NVDAx: [215.57, -1.06],
      AAPLx: [345.51, -0.26],
      GOOGLx: [306.12, -4.61],
      METAx: [613.01, -1.16],
      MSFTx: [548.59, 3.11],
      AMZNx: [255.28, 0.8]
    }
  },

  // NYSE:s stängda dagar. Uppdatera listan en gång per år.
  holidays: {
    "2026-01-01": "New Year's Day",
    "2026-01-19": "Martin Luther King Jr. Day",
    "2026-02-16": "Presidents' Day",
    "2026-04-03": "Good Friday",
    "2026-05-25": "Memorial Day",
    "2026-06-19": "Juneteenth",
    "2026-07-03": "Independence Day",
    "2026-09-07": "Labor Day",
    "2026-11-26": "Thanksgiving",
    "2026-12-25": "Christmas",
    "2027-01-01": "New Year's Day",
    "2027-01-18": "Martin Luther King Jr. Day",
    "2027-02-15": "Presidents' Day",
    "2027-03-26": "Good Friday",
    "2027-05-31": "Memorial Day",
    "2027-06-18": "Juneteenth",
    "2027-07-05": "Independence Day",
    "2027-09-06": "Labor Day",
    "2027-11-25": "Thanksgiving",
    "2027-12-24": "Christmas"
  }
};
