# Canoptek Archive

A Warhammer 40,000 11th edition **rules encyclopedia**, built from the community-maintained BSData catalogue. This is not an army builder.

## Local development

```sh
git clone https://github.com/BSData/wh40k-11e.git upstream
npm install
npm run data -- upstream public/data
npm run dev
```

## Publishing

Set Settings > Pages > Source to **GitHub Actions**. Every push to main and the weekly scheduled workflow rebuilds the site from BSData.

## Data coverage

BSData supplies roster-oriented unit profiles, abilities, enhancements and condition metadata. It does not guarantee complete 11th-edition core rules or stratagem cards with WHEN, TARGET and EFFECT. Missing content is identified, never invented. Enhancement eligibility is presented as source conditions rather than automatically evaluated for a roster.

Unofficial fan-made reference. No affiliation with Games Workshop, Wahapedia or BSData. Unit image buttons link to Google Images searches; no unit images are hosted.
