# Learned: code-reviewer:anti-pattern

> Bu kural otomatik olusturuldu (11 tekrar, agent_learning tipi).

## Pattern
code-reviewer:anti-pattern

## Ornekler
- removed — `updateTimeline` only pushes or mutates status). So once any type exists, `types.length` c
- return to 0. The `types.length === 0` branch only fires before the first agent ever spawns, when the
- touches `inFlightRef`**. If it didn't, it would zero out P2's live lock.

## Ilk gorulme
2026-06-06T10:24:22.405Z

## Son gorulme
2026-06-10T15:40:55.643Z
