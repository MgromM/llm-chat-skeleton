export const planKampaniiCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj cel/produkt kampanii po komendzie, np. `/plan-kampanii wprowadzenie nowej linii suplementów, budżet 20k/mies.`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Przygotuj szkielet planu kampanii marketingowej (po polsku) dla: "${args}".\n\nUwzględnij: cel i KPI (mierzalne), grupę docelową, proponowane kanały z uzasadnieniem, orientacyjny podział budżetu między kanały (w %), ramowy harmonogram (fazy: przygotowanie/start/optymalizacja/podsumowanie) i sugerowane metryki sukcesu per kanał. Zaznacz na początku, że to punkt wyjścia do doprecyzowania z klientem, nie gotowa oferta. Format: zwięzłe punkty i tabela podziału budżetu, gotowe do dalszej rozbudowy.`,
    };
  },
};
