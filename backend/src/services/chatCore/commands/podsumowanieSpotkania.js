export const podsumowanieSpotkaniaCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Wklej notatki/transkrypt ze spotkania po komendzie, np. `/podsumowanie-spotkania [wklejone notatki]`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Na podstawie poniższych notatek/transkryptu ze spotkania przygotuj (po polsku) zwięzłe podsumowanie gotowe do wysłania klientowi lub zespołowi:\n\n"""\n${args}\n"""\n\nStruktura: 2-3 zdania streszczenia najważniejszych ustaleń; lista konkretnych decyzji podjętych na spotkaniu; lista zadań do wykonania (action items) w formacie "kto — co — do kiedy" (jeśli notatki nie precyzują osoby/terminu, zaznacz to jako "do ustalenia" zamiast zmyślać); ewentualne otwarte pytania/ryzyka do wyjaśnienia. Nie dodawaj informacji, których nie ma w notatkach.`,
    };
  },
};
