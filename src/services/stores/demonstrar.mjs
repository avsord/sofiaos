// Uso: node demonstrar.mjs "pagina.html" ["link do anúncio"]   → lê HTML salvo (sem rede)
//      node demonstrar.mjs --live "link do anúncio"            → coleta ao vivo (backend)
import {readFileSync} from "node:fs";
import {extractMercadoLivreHtml, readMercadoLivre} from "./mercado-livre.mjs";
const args = process.argv.slice(2);
if (args[0] === "--live") {
  const r = await readMercadoLivre(args[1] || "", {allowCatalogWinner: true});
  console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1;
} else if (args[0]) {
  const url = args[1] || "https://www.mercadolivre.com.br/p/MLB42258825?pdp_filters=item_id%3AMLB5296520523";
  try {
    const reading = extractMercadoLivreHtml(readFileSync(args[0], "utf8"), url);
    console.log(JSON.stringify({validation: "arquivo local; não é consulta ao vivo", reading}, null, 2));
  } catch (e) { console.error(JSON.stringify({ok: false, code: e.code, error: e.message})); process.exitCode = 1; }
} else {
  console.error('Uso: node demonstrar.mjs "pagina.html" ["link"]  |  node demonstrar.mjs --live "link"');
  process.exitCode = 2;
}
