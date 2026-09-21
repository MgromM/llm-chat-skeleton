# 006 — Punkt 15: scenariusz demo (2-3 min)

URL: `https://frontend-production-c7e96.up.railway.app`
Logowanie: Google OAuth, domena `@salesmore.pl`.

## 1. Czat (~60s)

1. Zaloguj się (konto `michal.grom@salesmore.pl` lub inne admin z 3
   istniejących na produkcji).
2. Otwórz nową konwersację, zadaj pytanie związane z realną pracą specjalisty
   (np. pytanie o kampanię/klienta — coś krótkiego i konkretnego).
3. Pokaż odpowiedź modelu i podkreśl: historia rozmowy zapisana per
   użytkownik, dane izolowane RLS-em (nie trzeba tego dowodzić na żywo, tylko
   wspomnieć — patrz slajd bezpieczeństwa).

## 2. Slash-komenda (~60s)

Dostępne gotowe komendy (`backend/src/services/chatCore/slashDispatch.js`):

- `/pomoc` — lista komend (bezpieczny start, na wypadek gdyby coś innego nie
  zadziałało)
- `/koszt-dzisiaj` — pokazuje dzienny koszt użycia, dobre pod kątem
  narracji "sami mierzymy nasz koszt"
- `/brief-kreatywny`, `/tekst-reklamowy`, `/pomysly-na-posty`,
  `/analiza-konkurencji` — realne, użyteczne dla specjalisty akcje

**Rekomendacja na demo:** `/koszt-dzisiaj` — bezpośrednio łączy się z
liczbami pokazanymi na slajdzie 5 prezentacji (koszt/request), spina
narrację "produkt" z narracją "dane".

## 3. Panel admina (~60s)

1. Przejdź do panelu admina.
2. Pokaż: przypisania klient↔zespół, koszty/jakość w czasie (te same dane co
   w [006-liczby.md](006-liczby.md)), panel compliance (access-audit,
   zgody), zarządzanie użytkownikami.
3. Zamknij mocnym zdaniem: "to wszystko już działa, brakuje tylko więcej
   realnego ruchu, żeby liczby były reprezentatywne dla całego zespołu."

## Uwagi

- **Nie próbuj samodzielnie logować się na produkcję** — logowanie to
  Google OAuth i wymaga fizycznego dostępu Michała do konta @salesmore.pl
  (patrz punkt 10/11 w [006](006-domkniecie-do-prezentacji.md)). Ten
  scenariusz jest gotowy do wykonania, ale próba generalna (punkt 16) i
  nagranie zapasowe (punkt 17) wymagają, żeby Michał sam się zalogował i
  przeszedł przez powyższe kroki — najlepiej połączyć to z manualnym
  przejściem checklisty 002 (punkt 10), żeby nie logować się dwa razy.
