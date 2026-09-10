---
name: plan-mvp
description: >
  Wznawia pracę nad planem MVP projektu salesmore-llm z pliku
  docs/plan-mvp.md po wyczyszczeniu czatu. Czyta plan, przypomina status
  weryfikacji i priorytety (P0/P1/P2), i bierze się za najwyższy
  niedokończony priorytet — chyba że użytkownik wskaże konkretny punkt.
  Używaj ZAWSZE, gdy użytkownik mówi „wznów plan", „kontynuuj plan mvp",
  „co dalej z planem", „weź się za priorytety", „/plan-mvp" albo otwiera
  świeży czat i pyta o stan projektu salesmore-llm — nawet bez słowa
  „skill". Cały stan trzymany jest w pliku docs/plan-mvp.md, nie w
  pamięci rozmowy.
---

# Plan MVP — wznawianie pracy

Użytkownik czyści czat między sesjami pracy nad `salesmore-llm`. Cały stan
projektu (kontekst, decyzje, status weryfikacji, priorytety, backlog) żyje
w [`docs/plan-mvp.md`](../../../docs/plan-mvp.md) — nie w historii rozmowy.

## Kroki

1. Przeczytaj `docs/plan-mvp.md` w całości (sekcje: Status weryfikacji MVP,
   Priorytety, Do zrobienia / backlog).
2. Krótko podsumuj użytkownikowi (2-4 zdania): co jest zweryfikowane, jaki
   jest aktualny najwyższy priorytet (P0 na górze listy „Priorytety"), które
   punkty backlogu jeszcze czekają.
3. Jeśli użytkownik nie wskazał konkretnego zadania — zaproponuj start od
   najwyższego niedokończonego priorytetu (pierwszy `[ ]`/punkt z sekcji
   Priorytety, który nie ma odpowiednika w „Zweryfikowane i działające").
   Jeśli wskazał konkretny punkt (np. „zrób P1 z eksportami") — idź od razu
   w niego, bez dopytywania które źródło.
4. Pracuj nad tym punktem normalnie (kod, testy, itd.).
5. Po ukończeniu lub istotnym postępie **zaktualizuj `docs/plan-mvp.md`**:
   - przenieś/zaznacz punkt jako zrobiony w sekcji „Status weryfikacji MVP"
     lub odznacz `[x]` w „Do zrobienia / backlog”,
   - jeśli zmienia się kolejność ważności — zaktualizuj „Priorytety”,
   - jeśli pojawiły się nowe otwarte pytania/TODO — dopisz je we właściwej
     sekcji, nie twórz nowych plików.
6. Na koniec zapytaj, czy użytkownik chce wyczyścić czat — następna sesja
   i tak wznowi się z pliku.

## Zasada nadrzędna

Nie zakładaj kontekstu z rozmowy sprzed czyszczenia. Zawsze czytaj plik na
nowo na starcie — mógł się zmienić (ręcznie albo w innej sesji).
