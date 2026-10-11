const response = await fetch('https://podolsk.asna.ru/product/furatsilin/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
const html = await response.text();
const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
const state = raw && JSON.parse(raw)?.props?.initialState?.product?.product;
const products = state?.data || [];
const local = (state?.pharmacies || []).filter(place => /Кузнечики|Доллежаля|65-летия Победы|Варенникова|Стрельбицкого/i.test(place.address));
const productUrl = products[0]?.url_name ? `https://podolsk.asna.ru/cards/${products[0].url_name}.html` : '';
const card = productUrl ? await fetch(productUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }) : null;
const cardHtml = card ? await card.text() : '';
const clean = value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
const cardPharmacies = [...cardHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(match => {
  const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => clean(cell[1]));
  return cells.length >= 4 && /Кузнечики/i.test(cells[1]) ? [{ name: cells[0], address: cells[1], price: Number(cells[3].replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]) }] : [];
});
console.log(JSON.stringify({ status: response.status, variants: products.length, familyLocalPharmacies: local.length, firstName: products[0]?.name, productUrl, cardStatus: card?.status, cardLocalPharmacies: cardPharmacies }));
if (!response.ok || !products.length || !card?.ok || !cardPharmacies.length) process.exitCode = 1;
