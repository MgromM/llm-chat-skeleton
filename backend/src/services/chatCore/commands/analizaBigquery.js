export const analizaBigqueryCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj pytanie po komendzie, np. `/analiza-bigquery jaki był koszt kampanii X w zeszłym miesiącu?`',
      };
    }
    return {
      mode: 'continue',
      prompt: `Użyj narzędzia query_bigquery, aby odpowiedzieć na poniższe pytanie o dane firmowe. Podsumuj wynik po polsku, konkretnie i krótko.\n\nPytanie: ${args}`,
    };
  },
};
