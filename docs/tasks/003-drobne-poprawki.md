# 003 — Drobne poprawki zostawione przez agenta implementującego

**Nie blokuje** 001/002 — to porządki, można zrobić równolegle albo po.

## Cel
Posprzątać drobne niespójności, które wyszły przy implementacji 10 nowych
funkcji (2026-09-15), a które agent świadomie zostawił jako "poza
zakresem zadania".

## Do zrobienia

1. **Niespójność portów w lokalnym devie** — `.claude/launch.json` uruchamia
   backend na porcie 8095, ale `frontend/.env.local` ma
   `NEXT_PUBLIC_BACKEND_URL` wskazujące na 8092. Ujednolicić (sprawdzić
   które demo/testy faktycznie tego używają i ustawić jedną wartość w obu
   miejscach).
2. **Duplikat pola w odpowiedzi API** — `GET /conversations` w
   `backend/src/routes/chat.routes.js` zwraca zarówno `system_prompt` jak i
   `systemPrompt` dla tej samej wartości. Zostawić jedno (prawdopodobnie
   `systemPrompt`, camelCase pasuje do reszty API), zaktualizować frontend
   jeśli gdzieś czyta wersję snake_case.
3. **Fałszywe alarmy precheck bezpieczeństwa** — `sensitiveDataPrecheck.js`
   czasem blokuje niewinne wiadomości zawierające frazy typu "secret code"
   (zauważone przy teście uploadu PDF). Sprawdzić prompt/heurystykę tego
   agenta i poluzować tak, żeby nie blokował normalnych, biznesowych
   sformułowań — bez osłabiania realnej ochrony przed wyciekiem danych.

## Kryterium "zrobione"
Trzy punkty wyżej poprawione, każdy w osobnym małym commicie, opisane w
PR/commit message dlaczego (nie tylko co).
