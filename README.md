# Secret Number

A real-time hidden-number deduction game for friends, inspired by the "Secret Number" main match from a reality-TV mind-game show. Each friend plays on their own phone.

## How it plays
1. One person **creates a group** and shares the 4-letter room code or invite link. Everyone else **joins**.
2. In the lobby the host picks the **rule set** (Devil's Rules or Casual), the **number of players** and the investigation time.
3. Everyone reads the **briefing**. Each player gets a unique secret number that **nobody can see, including its owner**.
4. **Investigation:** visit other players and spend tickets. The game combines your number with theirs (sum, product, division, or count of zeros) and shows the result to both of you. Everyone else only sees that a visit happened.
5. **Final answers:** guess your own number (+5 if right, −5 if wrong) and anyone else's (+2 each). You also get +3 if nobody guesses your number.
6. **Reveal:** the numbers are revealed one by one, followed by the standings. The lowest score is eliminated.

| | Devil's Rules | Casual |
|---|---|---|
| Numbers | 1–100 | 1–30 |
| Tickets | 3× +, 2× ×, 2× ÷, 1× 0 | 4× + |
| Players | 4–12 | 3–8 |
| Investigation | 15 min (adjustable) | 5 min (adjustable) |

In Devil's Rules, addition results at the extremes are shown as ranges: sums of 20 or less show as `3–20`, and sums of 180 or more show as `180–199`.

## Notes
Every game has a **Notes** tab, saved on your device only:
- a **number grid** for your own number: tap once to cross a number out, twice to mark it likely, and a third time to clear it. If only one number is left, it is filled in as your guess.
- a **suspected number and notes** for each player. Suspected numbers are filled in as your final guesses.
- **general notes** for alliances, suspicions and lies.

## Practice vs bots (single play)
Choose **Practice vs bots** on the home screen to play alone in your browser, with no account or network needed. Pick the rule set, the number of bots, the timer and a difficulty:
- **Easy:** bots visit at random and guess wildly. The **Coach** is on, showing which numbers your clues still allow.
- **Medium:** bots choose informative visits, share honest clues in chat, and guess when they are close.
- **Hard:** bots play sharp, discard claims that contradict what they know, and lie in chat about a quarter of the time.

Tap a bot to visit it with a ticket, or to **ask for a clue** for free (they may lie). Turn on **Trust chat claims** to let the coach use what bots say. After the reveal, **Show solution** lists what your clues proved and every lie told in chat.

## Tech
- Vite + React + TypeScript frontend (`src/`).
- Practice mode: a client-side engine and bots (`src/practice/`), with a constraint solver (`solver.ts`) shared by the bots and the coach.
- Supabase Postgres + Realtime backend (`supabase/migrations/0001_init.sql`). Secret numbers, clue results and guesses sit in tables that browsers cannot read. Every action goes through `SECURITY DEFINER` functions, authenticated by a per-player token.

## Local development
```bash
npm install
cp .env.example .env.local   # optional; defaults point at the hosted project
npm run dev
npm test
```

To use your own Supabase project, run `supabase/migrations/0001_init.sql` in it and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
