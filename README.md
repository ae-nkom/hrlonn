# HR lønn

Webapp for å laste inn lønnsgrunnlag, analysere lønnsnivå/lønnsutvikling og eksportere tabeller og figurgrunnlag til Excel.

## Krav

- Node.js 20 eller nyere
- npm
- Nettleser med støtte for moderne JavaScript

Appen kjører lokalt i nettleseren. Data lagres i `localStorage`, ikke på en server.

## Første oppstart fra scratch

1. Gå til prosjektmappen:

```bash
cd /home/roger/prosjekter/hrlonn
```

2. Installer avhengigheter:

```bash
npm install
```

3. Start devserver:

```bash
npm run dev
```

4. Åpne appen i nettleseren:

```text
http://127.0.0.1:5173/
```

Hvis port `5173` er opptatt, velger Vite en annen port og skriver URL-en i terminalen.

## Data som må lastes inn

På siden `Datagrunnlag` laster du opp tre filer:

- `SAP-rådata`: Excel-fil (`.xlsx` eller `.xls`)
- `Referanselønn`: Excel-fil (`.xlsx` eller `.xls`) med arket `Referanselønn`, tittel i A1 og kolonnene `navn`, `init`, `ref_ar`, `ref_lonn` på rad 4
- `Manuell input`: Excel-fil (`.xlsx` eller `.xls`)

Når filene er lastet inn, lagres datagrunnlaget i nettleserens `localStorage`. Appen blir på `Datagrunnlag` slik at du kan hente KPI-data før du går videre til oversikten. Du slipper derfor å laste opp filene på nytt etter refresh, så lenge du bruker samme nettleser/profil og ikke tømmer lagret data.

## KPI-data

KPI-data hentes ikke automatisk. Etter at lønnsgrunnlaget er lastet inn:

1. Skriv målår i feltet `KPI målår`, for eksempel `2026`.
2. Trykk `Hent KPI-data`.
3. Appen henter KPI fra SSB, lagrer dette i samme `localStorage`-pakke som resten av datagrunnlaget og går deretter til `Oversikt`.

Når KPI-data finnes i `localStorage`, vises grønn bekreftelse på `Datagrunnlag` også etter refresh.

## Sider i appen

- `Datagrunnlag`: last opp filer, hent KPI-data og tøm lagret data.
- `Kildedata`: se opplastede kildetabeller og eksporter dem til Excel.
- `Oversikt`: nøkkeltall, figurer og analysegrunnlag for ansatte i 2.5.1-grunnlaget.
- `Lønnsutvikling`: filtrert visning av utvikling fra referanselønn til dagens lønn.
- `Lønnsnivå`: lønnsnivå fordelt på kjønn, ansiennitet og stilling.
- `Presentasjon`: presentasjonsklare tabeller, lønnsnivåfigurer, lønnsutvikling og ekstern sammenligning.

## Filtre og eksport

Excel-eksportene skal følge det som vises i appen:

- Aktive filtre tas med i eksporten.
- Tabeller eksporterer synlige rader, inkludert aktivt søk og sortering.
- Figurer eksporterer figurgrunnlaget som brukes i figuren.
- Minifigurer eksporterer alle minifigurene i samme Excel-fil.

Excel-filene formateres med tittel, metadata, frosset topp, filterrad, tydelige overskrifter og tilpassede kolonnebredder.

## Produksjonsbygg

Kjør:

```bash
npm run build
```

Dette lager en produksjonsversjon i `dist/`.

For å teste produksjonsbygget lokalt:

```bash
npm run preview
```

## Nullstille lokal data

I appen kan du trykke `Tøm lagret data` på `Datagrunnlag`.

Alternativt kan du slette nettleserens `localStorage` for `http://127.0.0.1:5173`.

## Feilsøking

Hvis appen ikke starter:

```bash
npm install
npm run dev
```

Hvis bygg feiler:

```bash
npm run build
```

Hvis appen viser gamle data etter endringer, tøm lagret data i appen eller slett `localStorage`.

Hvis KPI-henting feiler, sjekk nettverkstilgang og at SSB-tabell 14700 er tilgjengelig.
