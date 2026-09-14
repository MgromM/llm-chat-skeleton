export const briefKreatywnyCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj produkt/kampanię po komendzie, np. `/brief-kreatywny nowa linia kosmetyków dla mężczyzn`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Przygotuj krótki brief kreatywny (po polsku) dla kampanii marketingowej na temat: "${args}".\n\nUwzględnij: grupę docelową, kluczowy insight, główny komunikat (key message), ton komunikacji, 2-3 propozycje haseł (headline) i sugerowane kanały. Format: zwięzłe punkty, gotowe do wysłania klientowi.`,
    };
  },
};
