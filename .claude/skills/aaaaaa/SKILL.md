---
name: aaaaaa
description: >
  Odpala najwyższy niedokończony priorytet z `docs/plan-mvp.md`, dzieli go na
  kawałki tak, żeby kontekst jednego okna nie przekraczał ok. 100k tokenów,
  zapisuje cały stan (co zrobione, co zostało, co w toku) w tym pliku — czyli
  w miejscu widocznym także po wyczyszczeniu czatu — proponuje wyczyszczenie
  czatu po checkpointcie/zakończeniu, i jeśli task nie zostanie skończony w
  całości, rozbija resztę na jawne pod-zadania w pliku, żeby następna sesja
  nie powtórzyła zrobionej już roboty ani nie zgubiła tego, co zostało.
  Używaj ZAWSZE, gdy użytkownik mówi „leć dalej", „lecimy z P1/P2/...",
  „następny priorytet", „co dalej z planem", „kontynuuj", „zrób kolejny task"
  w kontekście `salesmore-llm` — nawet bez słowa „skill". Jeśli użytkownik
  wskaże konkretny priorytet/task, idź w niego wprost, bez dopytywania które
  źródło (zawsze `docs/plan-mvp.md`).
---

# Następny priorytet — runner z budżetem kontekstu

Wykonuje pracę nad `salesmore-llm` po kolei, z listy priorytetów w
`docs/plan-mvp.md`, w sposób odporny na czyszczenie czatu i na duże zadania,
które nie mieszczą się w jednym oknie kontekstu.

## Zasada nadrzędna

Użytkownik czyści czat między sesjami. **Cały stan (priorytety, co zrobione,
co jest w toku, co zostało) trzyma się wyłącznie w `docs/plan-mvp.md`** — nie
w pamięci rozmowy i nie w osobnych plikach-audytach. Świeży czat ma wznowić
pracę, czytając wyłącznie ten plik.

## Krok 1 — Przeczytaj plan

Przeczytaj `docs/plan-mvp.md` w całości: sekcje „Status weryfikacji MVP”,
„Priorytety”, „Do zrobienia / backlog”, i ewentualną sekcję „Zadanie w toku”
(patrz Krok 3b) jeśli istnieje.

- Jest sekcja „Zadanie w toku” z niedokończonym zadaniem → **wznów je**
  (patrz Krok 3b), nie zaczynaj nowego priorytetu.
- Inaczej → weź **pierwszy priorytet z listy „Priorytety”, który nie ma
  jeszcze odpowiednika w „Zweryfikowane i działające”** (czyli pierwszy bez
  przekreślenia/`~~...~~`/dopisku „zrobione”).
- Użytkownik wskazał konkretny priorytet/punkt wprost (np. „zrób P2 z
  eksportami”) → idź w niego, pomijając automatyczny wybór, ale nadal
  aktualizuj ten sam plik na końcu.
- Plan pusty / brak niedokończonych priorytetów → powiedz to wprost, nie
  wymyślaj zadania.

## Krok 2 — Oszacuj rozmiar PRZED startem

Zanim zaczniesz kodować, oszacuj z grubsza, czy zadanie zmieści się w
budżecie ok. **100k tokenów kontekstu** jednego okna. Nie masz licznika
tokenów na żywo, więc szacuj po proxy — potraktuj to jak wstępny research:

- Ile plików trzeba będzie przeczytać/dotknąć (grep + otwarcie kandydatów)?
- Czy któryś z nich jest duży (>300 linii / >20KB)?
- Ile warstw to obejmuje (np. backend + frontend + migracja DB naraz)?
- Ile odrębnych, samodzielnie weryfikowalnych kroków to ma (np. „dodaj
  endpoint” + „dodaj UI” + „dodaj eksport” to zwykle 3 różne zadania)?

**Podziel na osobne czaty zamiast robić w jednym oknie, gdy zachodzi choć
jedno:**
- realistycznie **>6–8 plików** trzeba będzie otworzyć/edytować,
- zadanie obejmuje **więcej niż dwie warstwy naraz** (np. DB + backend +
  frontend + eksport),
- **>4 samodzielne podzadania**, które dałoby się zweryfikować osobno,
- masz do przeczytania **duży plik/pliki** (razem >1500 linii) niezbędne do
  zrozumienia kontekstu przed pierwszą edycją.

Gdy zachodzi próg podziału: **rozbij zadanie na ponumerowane, konkretne
pod-zadania i zapisz cały plan podziału w `docs/plan-mvp.md` (nowa sekcja
„## Zadanie w toku”, patrz szablon niżej) PRZED napisaniem pierwszej linijki
kodu** — nie dopisuj podziału retroaktywnie po zrobieniu części pracy. Jeśli
sesja padnie w połowie, plan ma przetrwać nawet bez wykonanej roboty.

Gdy zadanie NIE łapie progów podziału — rób je w całości w tym oknie, bez
sztucznego dzielenia „na zapas”.

## Krok 3 — Rób oszczędnie, pilnuj budżetu w trakcie

- Czytaj tylko to, co potrzebne do tego kroku — nie wciągaj całego repo.
- Licz orientacyjnie wywołania narzędzi (Bash/Read/Edit/Write/Agent) od
  startu zadania/pod-zadania. **Po ok. 20–25 wywołaniach bez zamknięcia
  bieżącego pod-zadania → checkpoint natychmiast**, nawet jeśli formalnie nie
  złapałeś progów z Kroku 2. To jest proxy na „kontekst zbliża się do 100k”.
- Diffy, nie przepisywanie całych plików. Duże pliki: grep/offset-limit
  zamiast pełnego `Read`.
- Weryfikuj realnie (uruchom, przetestuj endpoint, otwórz wygenerowany
  plik) — nie deklaruj „zrobione” bez sprawdzenia, tak jak przy P0/P1 wyżej
  w tym planie.

### Krok 3b — Wznawianie zadania „w toku”

Jeśli w `docs/plan-mvp.md` jest sekcja „## Zadanie w toku”:
1. Przeczytaj listę pod-zadań — każde ma status `[x]` zrobione / `[/]` w
   toku (przerwane w połowie) / `[ ]` niezrobione.
2. Zacznij od pierwszego `[/]` (jeśli jest — sprawdź najpierw realny stan w
   kodzie/gicie, bo mogło zostać dokończone poza tym planem), inaczej od
   pierwszego `[ ]`.
3. **Nie wracaj do `[x]`** i nie rób ich drugi raz — to jest właśnie
   mechanizm chroniący przed powtarzaniem tej samej roboty.
4. Po skończeniu pod-zadania: odhacz `[x]` w tej samej sekcji, checkpoint
   (patrz Krok 4), zaproponuj czyszczenie czatu.
5. Gdy wszystkie pod-zadania są `[x]` → zamknij całe zadanie: przenieś jego
   opis do „Status weryfikacji MVP”, usuń sekcję „## Zadanie w toku”,
   zaktualizuj „Priorytety” (przekreśl zrobiony punkt).

## Krok 4 — Checkpoint / zakończenie (zawsze na koniec tury)

Niezależnie od tego, czy zadanie skończyło się w całości, czy tylko
częściowo, **zaktualizuj `docs/plan-mvp.md` przed zaproponowaniem
czyszczenia czatu**:

**A. Zadanie skończone w całości:**
1. Dopisz krótki, konkretny wpis do „Status weryfikacji MVP” — co zrobiono,
   jak zweryfikowano (realny test, nie deklaracja).
2. W „Priorytety” przekreśl zrobiony punkt (`~~...~~` + „zrobione”).
3. Jeśli zadanie miało sekcję „## Zadanie w toku” — usuń ją całkowicie
   (przeniosłeś jej treść do punktu 1).
4. Jeśli w trakcie wypłynęły nowe TODO/otwarte pytania — dopisz je we
   właściwej sekcji (backlog / otwarte pytania), nie twórz nowych plików.

**B. Zadanie nieskończone (checkpoint w połowie, próg budżetu, koniec
pracy na dziś itp.):**
1. Upewnij się, że jest sekcja „## Zadanie w toku” (dopisz jeśli jej nie
   było) z pełną listą pod-zadań wg szablonu niżej.
2. Odhacz `[x]` te, które realnie są zrobione i zweryfikowane. Oznacz `[/]`
   dokładnie jedno — to, które jest w połowie. Reszta `[ ]`.
3. Przy każdym `[x]`/`[/]` dopisz jednym zdaniem **co konkretnie zrobiono i
   jak to zweryfikowano** (pliki, komenda testu, wynik) — to jest to, co
   chroni przed „zapomnieniem” i przed zrobieniem tego samego drugi raz w
   kolejnej sesji, bo następna sesja nie ma pamięci tej rozmowy.
4. **Priorytetów NIE przekreślaj**, dopóki całe zadanie nie jest `[x]` w
   100% — inaczej plan skłamie, że coś jest gotowe.

**Zawsze na końcu (A i B):** krótkie podsumowanie w czacie (2-4 zdania: co
zrobione, co dalej) i **zaproponuj wyczyszczenie czatu** — stan i tak jest w
pliku, następna sesja wznowi się bez pytania „na czym skończyliśmy”.

## Szablon sekcji „Zadanie w toku” (w `docs/plan-mvp.md`)

```markdown
## Zadanie w toku

**[Nazwa priorytetu, np. P1 — Agent wykrywający niepewne sytuacje wycieku danych]**

Podzadania (rozbite RRRR-MM-DD, żeby zmieścić się w ~100k tokenów na okno):

- [x] 1. [opis] — zrobione: [co i jak zweryfikowano, pliki]
- [/] 2. [opis] — w toku: [co już jest, co brakuje do dokończenia]
- [ ] 3. [opis]
- [ ] 4. [opis]

### Do wznowienia
- [ewentualne detale/decyzje, które trzeba pamiętać przy podzadaniu 2/3/4,
  np. nazwa nowej tabeli, wybrany format API]
```

Sekcja żyje tylko tyle, ile trwa dane zadanie — po jego pełnym zamknięciu
(Krok 4A, punkt 3) znika z pliku, żeby `docs/plan-mvp.md` nie puchł.
