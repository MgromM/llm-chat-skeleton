export const analizaKonkurencjiCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj firmę/markę po komendzie, np. `/analiza-konkurencji Allegro Ads`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Przygotuj szkielet analizy konkurencji (po polsku) dla: "${args}".\n\nZaznacz na początku wyraźnie, że to ogólna, punktowa struktura oparta na wiedzy modelu (nie na aktualnych, na żywo pobranych danych) i że przed użyciem w prezentacji trzeba ją zweryfikować/uzupełnić realnymi danymi. Uwzględnij sekcje: pozycjonowanie, prawdopodobne mocne/słabe strony, typowe kanały komunikacji, na co warto zwrócić uwagę przy monitoringu tej marki.`,
    };
  },
};
