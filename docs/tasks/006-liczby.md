# 006 — Punkt 12: realne liczby z produkcji (2026-09-21)

Źródło: `railway ssh -s backend`, zapytania bezpośrednio do `usage_metrics` /
`quality_scores` na produkcyjnej bazie. Okres danych: 2026-09-16 11:58 UTC —
2026-09-21 08:24 UTC (5 dni, jedyne dane jakie istnieją — produkt jest świeżo
wdrożony, ruch na razie testowy z 3 kont adminów).

## Koszt

- **Requesty z policzonym kosztem:** 18
- **Suma kosztu:** $0.682075
- **Koszt/request (średnia):** $0.0379
- **Model:** wyłącznie `claude-sonnet-5` (100% ruchu)

## Jakość

- **Sędzia:** `claude-haiku-4-5-20251001`
- **Średnia ocena (skala 1-5):** 3.67
- **Liczba ocenionych odpowiedzi:** 18 (100% requestów ma ocenę)

## Koszt/user/miesiąc

Rozbicie per-user jest chronione przez RLS (świadomie — tabela `conversations`
ma `FORCE ROW LEVEL SECURITY`, zapytanie z poziomu `railway ssh` łączy się bez
kontekstu `app.current_user_id`/`app.is_admin`, więc join przez
`conversations` zwraca 0 wierszy). To jest oczekiwane działanie zabezpieczenia,
nie bug — nie obchodziłem tego przez wymuszanie kontekstu admina z poziomu
SSH (poza zakresem tego, co można zrobić bez logowania przez UI).

Liczba aktywnych kont na produkcji: 3 (wszystkie `role='admin'`, patrz punkt
10 w [006](006-domkniecie-do-prezentacji.md)).

Szacunek na tej podstawie (kierunkowy, próbka bardzo mała — 18 requestów w 5
dni to głównie ruch testowy, nie realne użycie 30-60 specjalistów z celu
MVP):

- Ekstrapolacja do 30 dni: $0.682075 × (30/5) ≈ **$4.09/miesiąc** przy obecnym
  tempie ruchu testowego
- Przy 3 aktywnych kontach: ≈ **$1.36/user/miesiąc**

**Zastrzeżenie do prezentacji:** to są liczby z testowego ruchu (18
requestów), nie z realnego użycia zespołu. Do twardego porównania kosztowego
potrzeba tygodni realnego ruchu 30-60 specjalistów (cel z
[docs/plan-mvp.md](../plan-mvp.md)). Warto to jasno powiedzieć prezesowi —
liczby pokazują rząd wielkości kosztu/request i jakość, nie docelowy koszt
miesięczny całego zespołu.
