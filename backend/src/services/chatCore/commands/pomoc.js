import { listCommands } from '../slashDispatch.js';

// Kept alongside COMMANDS in slashDispatch.js rather than derived from each
// command's own prompt text, since those prompts are written for the model,
// not for a human skimming `/pomoc`.
const DESCRIPTIONS = {
  '/pomoc': 'Pokazuje tę listę komend.',
  '/koszt-dzisiaj': 'Podsumowanie kosztu i liczby zapytań do LLM za dziś (bez wywołania modelu, koszt $0).',
  '/analiza-bigquery': 'Odpowiada na pytanie o dane firmowe, odpytując BigQuery (wymaga skonfigurowanego dostępu).',
  '/brief-kreatywny': 'Generuje krótki brief kreatywny dla kampanii: grupa docelowa, insight, key message, hasła, kanały.',
  '/tekst-reklamowy': '3 warianty tekstu reklamowego (nagłówek, treść, CTA) dopasowane do wskazanej platformy.',
  '/pomysly-na-posty': '5 pomysłów na posty social media z formatem i przykładowym podpisem dla każdego.',
  '/analiza-konkurencji': 'Szkielet analizy konkurencji do zweryfikowania/uzupełnienia realnymi danymi.',
  '/plan-kampanii': 'Szkielet planu kampanii: cel/KPI, grupa docelowa, kanały, podział budżetu, harmonogram.',
  '/email-ofertowy': 'Gotowy do wysłania e-mail ofertowy do klienta na podstawie podanego kontekstu.',
  '/podsumowanie-spotkania': 'Zamienia wklejone notatki/transkrypt ze spotkania w podsumowanie z decyzjami i action items.',
  '/persona-klienta': 'Szkielet persony klienta: cele, bolączki, kanały, typowe zastrzeżenia zakupowe.',
  '/prezentacja': 'Generuje gotowy do pobrania plik .pptx (branding Sales&More) na podstawie wklejonych danych kampanii.',
  '/kampanie-ads': 'Podsumowanie wyników kampanii Google Ads / Meta Ads z ostatnich 7 dni (wymaga skonfigurowanego dostępu).',
};

export const pomocCommand = {
  mode: 'bypass',
  async run() {
    const lines = listCommands().map((name) => `- **${name}** — ${DESCRIPTIONS[name] ?? '(brak opisu)'}`);
    return {
      mode: 'bypass',
      reply: `Dostępne komendy:\n\n${lines.join('\n')}\n\nUżycie: wpisz komendę, spację, a po niej treść/dane (jeśli wymagane) — np. \`/brief-kreatywny nowa linia kosmetyków dla mężczyzn\`.`,
    };
  },
};
