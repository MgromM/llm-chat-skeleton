// Ports the "salesmore-prezentacja" Claude Code skill into the product
// itself: instead of a skill file read by a coding agent, this rewrites the
// prompt so the model builds the real .pptx itself via the code_execution
// tool (python-pptx) — pipeline.js's extractGeneratedFiles() already turns
// any file the sandbox writes into a downloadable attachment, so no new
// file-handling plumbing is needed here.
const BRAND = {
  dark: '29272E',
  orange: 'F8502C',
  white: 'FFFFFF',
  lavender: 'EDEDF5',
  font: 'Segoe UI',
};

export const prezentacjaKampaniiCommand = {
  mode: 'continue',
  async run({ args }) {
    if (!args?.trim()) {
      return {
        mode: 'bypass',
        reply:
          'Wklej po komendzie dane/analizę kampanii (np. z Meta Ads, Google Ads, DV360 — tekst, liczby, wnioski), np. ' +
          '`/prezentacja Meta Ads, budżet 15k zł, 320k wyświetleń, CTR 1.8%, 42 leady, koszt/lead 357 zł...`.',
      };
    }
    return {
      mode: 'continue',
      prompt: `Zbuduj prezentację PowerPoint (.pptx) podsumowującą wyniki kampanii marketingowej na podstawie poniższych danych, używając narzędzia code_execution (python-pptx). Zapisz plik i zakończ go w katalogu roboczym, żeby był dostępny do pobrania.

Dane kampanii:
"""
${args}
"""

Branding Sales&More do zastosowania (kolory HEX, RGB z tych HEX):
- Ciemny (tekst/tła nagłówków): #${BRAND.dark}
- Pomarańczowy (akcent/CTA): #${BRAND.orange}
- Biały: #${BRAND.white}
- Lawendowy (tła sekcji): #${BRAND.lavender}
- Font: ${BRAND.font} (jeśli niedostępny w środowisku, użyj najbliższego systemowego sans-serif)

Struktura prezentacji:
1. Slajd tytułowy — tło pomarańczowe (#${BRAND.orange}), biały tekst: nazwa kampanii/klienta i okres raportowania.
2. Slajd z kartami KPI — tło lawendowe (#${BRAND.lavender}), 3-5 kart z kluczowymi metrykami (duża liczba + opis), ciemny tekst.
3. Slajd z tabelą szczegółowych wyników (rozbicie na kanały/kreacje/okresy, jeśli dane na to pozwalają).
4. Slajd z wnioskami i rekomendacjami na kolejny okres (zwięzłe punkty).

Layout 10x5.63 cala (proporcje 16:9), spójna kolorystyka na każdym slajdzie. Po wygenerowaniu pliku krótko podsumuj po polsku, co zawiera prezentacja.`,
    };
  },
};
