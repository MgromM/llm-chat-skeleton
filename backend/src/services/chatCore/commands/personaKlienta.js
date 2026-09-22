export const personaKlientaCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj produkt/usługę i rynek po komendzie, np. `/persona-klienta usługi księgowe dla małych firm w Polsce`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Zbuduj szkielet persony klienta (po polsku, jedna persona) dla: "${args}".\n\nUwzględnij: imię i krótki opis (wiek, zawód/rola, kontekst życiowy); główne cele i motywacje związane z tym produktem/usługą; największe bolączki i obawy (pain points); gdzie szuka informacji i podejmuje decyzje zakupowe (kanały, źródła zaufania); typowe zastrzeżenia przy zakupie i jak je adresować w komunikacji. Zaznacz wyraźnie, że to hipoteza robocza do zweryfikowania realnymi danymi/wywiadami z klientami, nie wynik badania.`,
    };
  },
};
