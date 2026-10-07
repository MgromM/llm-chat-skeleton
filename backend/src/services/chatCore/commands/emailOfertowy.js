export const emailOfertowyCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj kontekst po komendzie, np. `/email-ofertowy oferta usług doradczych dla małej firmy produkcyjnej, pierwszy kontakt`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Napisz gotowy do wysłania e-mail ofertowy (po polsku, profesjonalny ale nie sztywny ton) na podstawie: "${args}".\n\nStruktura: krótki, konkretny temat wiadomości (Subject); personalizowane otwarcie nawiązujące do kontekstu odbiorcy; 2-3 zdania wartości (dlaczego warto, jaki problem rozwiązujemy); jasne wezwanie do działania (np. propozycja krótkiej rozmowy z 2 terminami); krótka stopka. Unikaj sprzedażowego żargonu i przesadnych obietnic — ma brzmieć jak wiadomość od realnej osoby, nie masowy mailing.`,
    };
  },
};
