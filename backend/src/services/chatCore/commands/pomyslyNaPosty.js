export const pomyslyNaPostyCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj temat/markę po komendzie, np. `/pomysly-na-posty marka odzieżowa, kolekcja jesienna`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Zaproponuj 5 pomysłów na posty social media (po polsku) na temat: "${args}".\n\nDla każdego pomysłu podaj: krótki opis treści, format (np. karuzela, rolka/wideo, statyczny post) i przykładowy podpis (caption) z 1-2 hashtagami. Różnicuj formaty i kąty podejścia (edukacyjny, rozrywkowy, sprzedażowy, social proof, behind-the-scenes).`,
    };
  },
};
