### Upute za pokretanej poslužitelja

- U `src` direktoriju se već nalazi datoteka `pre-compiled.js` koju je moguće
pokrenuti za pokretanje web poslužitelja. Upute za [pokretanje](#pokretanje).

- Projekt je napisan u `typescript`-u te je izvorni kod potrebno transpajlirati
u `javascript` kako bi se mogao pokrenuti.

#### Transpajliranje

Za transpajliranje je potreban `typescript` kompajler koji se može instalirati
pokretanjem u terminalu:
> `npm install -g typescript` (Globalno instalira typescript; za `npm` je potrebno
imati instaliran NodeJS)

Kad je typescript instaliran potrebno je pribaviti pakete o kojima ovisi program
(jedino ovisi o paketu `@types/node`) pokretanjem:
> `npm install`

Kad su paketi pribavljeni pokreće se transpilacija u direktoriju s
datotekama `tsconfig.json`, `package.json` pokretanjem:
> `tsc`

Nakon pokretanja transpajlera u `src` direktoriju će biti kreirana nova
datoteka nazvana `main.js` koju je moguće pokrenuti za pokretane web
poslužitelja.

#### Pokretanje poslužitelja

Vrlo važno je da se poslužitelj pokreće iz direktorija s datotekama `tsconfig.json`,
`package.json`, tj. iz direktorija iznad `src` jer interno koristi relativne putanje
za dohvaćanje datoteka koje se koriste u primjerima.

- Za pokretanje poslužitelja koristi koristi se `node src/main.js` ili `node src/pre-compiled.js`
ako se želi pokretati priložena .js datoteka.
