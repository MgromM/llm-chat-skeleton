export const tekstReklamowyCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply: 'Podaj platformę i temat po komendzie, np. `/tekst-reklamowy Meta Ads, promocja -20% na zamówienia powyżej 200 zł`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Napisz 3 warianty tekstu reklamowego (po polsku) na podstawie: "${args}".\n\nDla każdego wariantu podaj: nagłówek (max 40 znaków), treść główną (max 125 znaków) i CTA. Dopasuj długość i styl do wskazanej platformy reklamowej. Zaznacz, który wariant polecasz i dlaczego.`,
    };
  },
};
