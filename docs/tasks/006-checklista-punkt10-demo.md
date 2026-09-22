# 006 — Checklista: punkt 10 (QA na produkcji) + demo (15-17)

Wszystko poniżej robisz w JEDNEJ sesji, jednym logowaniem przez Google OAuth,
żeby nie logować się kilka razy. URL produkcji:
`https://frontend-production-c7e96.up.railway.app`

Przygotuj z wyprzedzeniem: dwa adresy `@salesmore.pl`, do których masz
dostęp (inne niż `michal.grom`, `andrzej.rusilowicz`, `tomasz.kozarzewski` —
te trzy mają już `role='admin'`, nie nadają się do testu izolacji non-admin).
Każde nowe logowanie samoprowizonuje konto z rolą `specialist`.

## Część A — punkt 10: QA produkcyjne dwoma non-admin kontami

Cel: potwierdzić RLS end-to-end przez UI (nie tylko w bazie, jak już
zweryfikowano) + przejść checklistę 002.

- [ ] A1. Zaloguj się pierwszym nowym adresem `@salesmore.pl` (Google OAuth).
      Sprawdź w bazie (`railway ssh` na `backend`), że konto ma
      `role='specialist'`, nie `admin`.
- [ ] A2. Na koncie 1 przeprowadź 1-2 krótkie konwersacje w czacie, zapamiętaj
      ich treść/tytuły.
- [ ] A3. Wyloguj się, zaloguj się drugim nowym adresem `@salesmore.pl`.
- [ ] A4. Na koncie 2 sprawdź sidebar konwersacji — **ma być pusty / bez
      konwersacji z konta 1**. To jest kluczowy test izolacji RLS przez UI.
- [ ] A5. Na koncie 2 przeprowadź własną krótką konwersację.
- [ ] A6. Zaloguj się z powrotem na konto 1 — sprawdź, że widać tylko swoje
      konwersacje (nie widać tych z konta 2).
- [ ] A7. Zaloguj się jednym z 3 istniejących kont admin (np.
      `michal.grom@salesmore.pl`) — sprawdź w panelu `/clients/access-audit`
      i `/metrics/retention`, że dane się ładują i widać wpisy z obu kont
      testowych.
- [ ] A8. Przejdź checklistę z [002-qa-nowych-funkcji.md](002-qa-nowych-funkcji.md)
      jeszcze raz na produkcyjnym URL (9/10 punktów było już zweryfikowane
      lokalnie — tu chodzi o potwierdzenie na produkcji, zwłaszcza punkt 2:
      banner błędów przy 429/500, i punkt 7: mobile UI).
- [ ] A9. Po zakończeniu: odhacz punkt 10 w
      [006-domkniecie-do-prezentacji.md](006-domkniecie-do-prezentacji.md) i
      dopisz notatkę z wynikiem (co potwierdzone, czy były niespodzianki).

## Część B — demo: próba generalna (punkty 15-17)

Scenariusz szczegółowy: [006-demo-script.md](006-demo-script.md). Rób to na
koncie admin (`michal.grom` albo inne z 3 istniejących).

- [ ] B1. **Czat (~60s)** — nowa konwersacja, konkretne pytanie związane z
      pracą specjalisty (np. o kampanię/klienta). Pokaż odpowiedź, wspomnij
      izolację RLS (nie trzeba dowodzić na żywo — masz to już z Części A).
- [ ] B2. **Slash-komenda (~60s)** — użyj `/koszt-dzisiaj` (łączy się z
      liczbami ze slajdu 5 prezentacji). Jeśli coś nie zadziała, zacznij od
      `/pomoc` jako bezpieczny fallback.
- [ ] B3. **Panel admina (~60s)** — pokaż przypisania klient↔zespół,
      koszty/jakość w czasie, panel compliance (access-audit, zgody),
      zarządzanie użytkownikami. Zamknij zdaniem o brakującym realnym ruchu.
- [ ] B4. Zmierz czas całości — cel 2-3 min, jeśli dłużej, zdecyduj co skrócić.
- [ ] B5. **Plan B (punkt 17)** — podczas próby generalnej nagraj
      screencast całego przebiegu (lub zrób zrzuty ekranu kluczowych momentów:
      odpowiedź czatu, wynik slash-komendy, panel admina) na wypadek awarii
      live przed prezesem.
- [ ] B6. Po zakończeniu: odhacz punkty 15, 16, 17 w
      [006-domkniecie-do-prezentacji.md](006-domkniecie-do-prezentacji.md),
      dopisz link/lokalizację nagrania z B5 i ewentualne uwagi z próby.

## Jeśli coś nie zadziała

Zanotuj dokładny błąd (zrzut ekranu + treść z konsoli przeglądarki, jeśli się
da) i wróć do mnie z tym — dokończę analizę i poprawkę bez potrzeby
ponownego logowania z Twojej strony, o ile problem da się zreprodukować
lokalnie.
