# 004 — Podatności bezpieczeństwa (Dependabot)

**Nie blokuje** logowania/demo, ale **blokuje bezpieczne pokazanie
aplikacji na zewnątrz** (klientom, poza wewnętrznym zespołem).

## Cel
Ocenić i załatać krytyczne/wysokie podatności zgłoszone przez GitHub
Dependabot na repo `salesandmore/salesmore-LLM-mvp`.

## Stan wyjściowy (2026-09-15)
GitHub przy każdym pushu zgłasza: **21 podatności (1 critical, 12 high,
8 moderate)**. Nie zostały jeszcze przejrzane w tej sesji.

## Kroki
1. Wejdź na
   https://github.com/salesandmore/salesmore-LLM-mvp/security/dependabot
   (lub `gh api repos/salesandmore/salesmore-LLM-mvp/dependabot/alerts`
   jeśli `gh` CLI jest zalogowane).
2. Wypisz alert krytyczny i alerty "high" — dla każdego: pakiet, wersja,
   czy jest dostępna łatka (nowa wersja), czy paczka jest w
   backend/frontend czy w devDependencies (te ostatnie mniej pilne, bo nie
   trafiają do obrazu produkcyjnego).
3. Dla każdego z łatwą łatką: `npm audit fix` (ostrożnie — sprawdzić czy nie
   robi major bump łamiącego API) albo ręczny bump wersji w `package.json`.
4. Dla podatności bez prostej łatki (wymaga migracji na inną bibliotekę) —
   spisać jako osobne zadanie z oceną ryzyka, nie próbować na szybko przed
   deadline'em.
5. Po każdej łatce: `npm test` (jeśli są testy) + szybki smoke test
   (`npm run dev`, zaloguj się, wyślij wiadomość) — upewnić się że nic nie
   padło.
6. Commit + push, redeploy jeśli backend/frontend się zmienił (patrz 001 —
   `railway up`, nie `railway redeploy`).

## Kryterium "zrobione"
Krytyczna (1) i wszystkie "high" (12) podatności albo załatane, albo
świadomie zaakceptowane z udokumentowanym powodem (np. "dev-only
dependency, nie trafia do produkcji").
