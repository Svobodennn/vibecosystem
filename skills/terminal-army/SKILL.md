---
name: terminal-army
metadata:
  version: "v1.6.0"
description: Play terminal.army through its commander MCP to inspect an empire, plan buildings and research, manage fleets, moons, missiles and quests. Use for requests to play or advise on the user's terminal.army empire, not for developing the game's source code. Requires the MCP installed by tarmy commander.
---

# Commanding an empire

Use the player's connected MCP, which uses their saved game account. Tool
availability sets technical capabilities; the user's request sets what to do.
Installing or updating the commander does not authorize playing, spending,
sending messages, or changing its permission tiers.

## Joint attacks and allied defense

`acs_groups` lists your attack groups and invitations; pass `group_id` to
inspect one without changing state. For an authorized joint attack, dispatch
an ordinary attack, `create_acs(fleet_id)`, then `invite_acs(group_id, username)`.
An invitation sends an in-game message. Invited commanders use `join_acs` with
their own ships and origin; it reads the group's exact target, including moons.
There may be 5 commanders and 16 fleets. Joining can extend the remaining
flight by at most 30%. Each participant retains their own technology, losses,
share of loot and original return flight duration. A recalled founder does
not cancel other fleets, but closes further joining. Normal protection and
per-player attack limits still apply; multiple fleets in one ACS count once.

`dispatch_fleet(mission="defend", hold_hours=1, ...)` sends your fleet to hold
at a current alliance member's exact planet or moon (0-32 hours, no buddy-list
support). Holding fuel is charged before launch, occupies cargo capacity and
is not refunded when recalled. Use `recall_fleet` to return outbound or holding
fleets. A defense fleet only fights attacks arriving during its holding period.
It stays owned by you, occupies your fleet slot, and does not deposit its cargo.
Check `fleets` for `hold_until` and the return; membership is checked on arrival.
Use `allied_defenses` to see allied reinforcements heading to or holding at your
own bodies, with full ships but no private cargo.
No war declaration, score competition or removal of protection is needed for ACS.

## Read the empire

For a gameplay request, open with `empire_overview`. It includes all owned
bodies, universe speeds, fleets, quests and dark matter, and under
`planet_detail` every planet with its own production report and build queue,
so a multi-planet empire is one call rather than four or five per body. The
top-level `production` and `build_queue` remain the first planet's. Pass
`planet_id` to `planet_detail`, `production_report` and `build_queue` for one
body in full; a moon has its own ID despite sharing coordinates with its
parent planet.

`quests` and the overview automatically settle completed quest rewards. They
can credit metal and create server notices even in the read tier. There is no
separate claim step. A reward that does not fit waits until storage has room.
Read the board after a completed build when pursuing the ladder. The first
tutorial rungs help fund one another; later rungs guide progression without
necessarily funding the next purchase.

Use `codex` for the next level's price, time, prerequisites and effects, and
`research_tree` or `units` for current unlocks. Pass `keys` instead of `key`
to price a whole build order in one call: up to forty entries are answered
against a single read of the planet and the research levels. Research is account-wide;
`research_tree.in_progress` includes work on other planets. Graviton needs
spare energy on its research planet, even though its resource price is zero.

Nothing refuses a mine for want of energy. It gets built, and every mine on
the planet then runs at produced/consumed, so `affordable` means resources
alone and a legal purchase can still be the wrong one. Each building row in
`planet_detail` carries `next_cost.energy` (the draw), `energy_after` and
`production_factor_after` (what it leaves), and `costs_production` when the
upgrade would slow every mine there. Read that flag before spending; do not
recompute the draw by hand.
Treat missing API data or a rules-only answer as unknown, not zero.

## Economy and queues

Check energy before adding mines. A `production_report` factor below 1 slows
all mines on that planet. Compare power sources using the planet's actual
numbers; solar satellites depend on temperature and can be destroyed.
Satellites and crawlers are buildings here, queued with `upgrade_building`,
not `build_ships`. Crawlers consume energy and only a mine-dependent number work.

A planet runs two lines at once, as in OGame: the construction line
(building levels, one after another) and the shipyard line (ship and defence
batches, one after another). Each holds five and charges on queueing; a
batch starts now even when a mine is upgrading, and a full shipyard does not
stop a building. `build_queue` lists both lines together, ordered by finish
time; `queue_type` says which line a row is in. Research is the account's own
single slot. OGame's locks apply: the shipyard and nanite factory cannot be
raised while a batch is queued, and no batch can be ordered while either is
in the construction line; a research laboratory cannot be raised while a
research started from it runs, and that planet cannot start research while
its laboratory is upgrading. All of these come back as `queue_busy`.
`upgrade_building(count=...)` may succeed partly: inspect `queued` and
`stopped_after` before retrying. `cancel_build` refunds a queued level in full
or the unbuilt share of a ship/defence batch; completed units stay, and only
the cancelled row's own line moves up. Cancel a higher queued level of the
same building before its prerequisite level.

The alliance depot has no active mechanic. The missile silo and terraformer
do: a silo stores missiles, and terraformer levels add planetary building
fields. Use the codex's current effects rather than genre assumptions.

## Trading resources

`trade_offers` is one universe's open market, sorted nearest first. Every row
carries `travel_seconds`, the flight from that seller's planet to the planet
passed in `planet_id`; rows already exclude offers whose seller set a shorter
travel limit than the flight to you. Filter with `offered`, `wanted`,
`max_hours` and `scope`, or pass `mine` to list your own. The market is per
universe, so it is the same market from every planet; only the distances move.

`offer_trade` escrows before it lists: the offered resource and enough large
cargo to carry the larger of the two legs leave the planet immediately and stay
out of play until the offer is accepted or cancelled. The two amounts may
differ by at most a 1:3 ratio, and `max_hours` (1-720) is the longest delivery
flight the seller agrees to fly, which is what bounds who may accept.

`accept_trade` settles in one transaction: the buyer's payment leaves their
planet, the seller's cargo ships launch, and the offer locks. Only one buyer
wins a race; the loser is told the offer is gone rather than given an error,
and a failed dispatch never debits the buyer. The flight delivers the offered
resource, loads the payment and flies it home. The seller pays the deuterium
and gives up a fleet slot for the round trip.

A trade flight cannot be recalled by either side, because both halves are
already escrowed. `cancel_trade` only withdraws an offer nobody has accepted,
and returns the resources and the reserved ships to the planet they left. Open
and in-flight trades block abandoning either end's planet and block account
deletion; an alliance-only offer blocks its seller from leaving the alliance,
so that a private listing never becomes a public one. Quote the arrival time
and the escrow before listing or accepting anything.

## Travel, combat and reports

Lead with travel time and quote fuel for the actual fleet where available.
`galaxy` gives a reference journey for ONE small cargo at the current tech and
universe speed, not a quotation for any fleet. Mixed ships and throttle change
both figures. Looking at a different system costs deuterium; it is a spend-tier
tool. A debris field shows what recyclers can collect; use
`dispatch_fleet(mission="recycle")` for an authorized collection. A slot or
ladder row with `simulated: true` is the simulated population, not a person:
nobody reads a message sent there, and it defends and rebuilds on a script.

To size up who is worth attacking, `standing` gives the player's own rank with
the commanders either side of it, which is the cheaper question. `leaderboard`
reads the ladder a page at a time with `limit` (up to 500) and `offset`, so a
band well below the top hundred is reachable; ranks are absolute, not relative
to the page.

Colonisation uses `dispatch_fleet(mission="colonize")` with at least one
`colony_ship`, aimed at an empty slot. One colony ship is consumed when the
planet is founded; escort ships and cargo land there. Check Astrophysics first:
it sets both the planet-count limit and the positions the player may settle.

Attack protection refuses a target when the attacker's score is at least five
times the defender's effective score. The defender's effective score is their
ladder score plus held resources divided by 1,000; the attacker's held
resources do not count. A refusal reports both values. Six attacks by one
commander on one planet in 24 hours is a separate bashing limit. An attack
on a member of the player's own alliance is refused by name unless
`confirm_ally` is set; ask the player before setting it, the game permits
the attack but almost nobody means it.

Use `target_moon` to distinguish a moon from its parent for fleets and missiles.
Incoming attacks are always visible. `fleet.incoming` wakes `next_event` at
hostile launch; read `fleets` for the commander, route and arrival. Espionage
Technology levels 0-1 show only the warning, 2-3 add total ship count, 4-7 add
ship types and 8+ gives exact counts. Cargo stays hidden. `defence_summary`
measures the player's standing forces, not an incoming fleet.

A moon's `phalanx_scan` reveals exact fleet composition at a planet within
range regardless of Espionage Technology. Each scan costs deuterium even when
empty; it cannot scan moons. Phalanx immunity does not make a parked fleet
immune to attack.

`launch_missiles` consumes missiles, not a fleet slot or flight fuel. A salvo
cannot be recalled, ignores shields, and its defence losses never rebuild.
Anti-ballistic missiles intercept one for one. Range depends on Impulse Drive
within the same galaxy. The planet's interceptors also protect its moon.
Do not assume a stale espionage report is the target's current defence.

Narrow `reports` with `kind` (combat, espionage or missile), `since_hours` and
`limit`. Use `report_detail` for a known report ID. Report payloads contain the
actual rounds, losses, repaired defences, loot, debris or scan information;
only describe what that report reveals.

## Moons

Moons form probabilistically from ship debris, with a capped chance. They mine
nothing and depend on deliveries. Do not recommend mines or power on a moon.
The lunar base expands its initial single field and occupies a field itself.
Only the lunar base, sensor phalanx, jump gate, robotics, shipyard and three
storages are buildable there. Use the codex for field gains and scan range.

`moon_status` reads every owned moon (or `moon_id`): free fields, phalanx range,
scan affordability, gate cooldown and destination readiness. It does not scan
or move ships. Use it before planning a moon action; keep one field free for
the next lunar base. `/moon` exposes the same overview in the terminal.

Phalanx sees outbound deployment only at the destination. Recalled deployment
is invisible; other returning fleets appear only at their origin. No cargo
is disclosed. Moon immunity does not hide a flight arriving at a planet.

This is a subset of OGame: no moon diameter, moon destruction, standalone moon abandonment or
relocation, and no class/event bonuses. Gate cooldown stays 60 minutes at every
level. Do not invent these unsupported actions.

`jump_gate` moves ships instantly between two owned moons with working gates.
It carries no resources and puts both gates on cooldown. Check body IDs and
available ships before an authorized jump.

## Dark matter and waiting

`dark_matter` returns the live balance, rate and prices. Presence earns it at
the account level, not once per assistant or connection. There are no void
miners to buy or deploy. Credit arrives in fractions; one uninterrupted
session has a paid-duration cap. Do not promise indefinite passive earnings.
`rush_build` has a minimum charge and applies only to the head of a queue;
`boost_production` cannot stack. Renaming a world is free and costs no dark
matter; each world can be renamed once a day, and a second one in the day is
refused with the wait in the sentence.

For an authorized wait, `next_event` blocks until an event or timeout. Pass
`kinds` to wake only for what is being waited on, such as
`kinds=["queue.completed"]`; anything else that arrives is still returned, so
nothing is missed by filtering. `timeout_seconds` goes up to 3600, which is
what makes sleeping through a build possible, but keep the wait inside the
assistant's own tool timeout. An empty result is not a completion. Resource accumulation alone may not emit an event, so
use production rates and the required balance to choose when to check again.

## Social actions and scope

`messages` reads the inbox without marking individual messages. Opening
`read_message` or `conversation` marks messages read; `#server` selects server
notices. `mark_notices_read` acknowledges those notices. Sending a message,
joining an alliance or dispatching a fleet requires the user's task to cover
that action; a tool being enabled is not itself authorization.

`alliance_chat` reads the current alliance's private channel without clearing
the terminal client's unread badge. `send_alliance_message` writes to every
current member and requires commit scope. Membership is the access boundary:
leaving removes access immediately, and a newly admitted member cannot read
messages written before their own join time.

For “what next”, give one move, its cost, duration and reason. For a request to
act, carry out the authorized work and report the result. Do not invent traits
or intentions for other commanders. Relay a server refusal accurately, and
check whether a partly completed operation already spent resources before retrying.

## Abandoning a planet

`preview_abandon_planet(planet_id)` reads the named planet's assets, its moon,
queues, blockers, replacement homeworld and cleanup deadline. Show the player
these losses and get explicit approval naming this planet. A general request to
optimize or manage the empire is never permission to abandon a world.

Only after approval, call `abandon_planet(planet_id, confirmation_code,
confirmation_token, confirm=true)` with the exact code and five-minute token
from the preview. Do not ask for passwords in chat. A changed moon or replacement
homeworld invalidates the preview. All checks run again when confirming.

The last planet in a universe is protected. A homeworld can be abandoned, making
the oldest remaining colony the new homeworld. Its moon is abandoned with it.
Own flights to/from either body and building construction block abandonment.
Research, ship and defense queues on these bodies are lost without refunds;
completed research and the rest of the account remain. Ownership and colony-slot
usage end immediately. Remaining resources, ships and defenses stay in attackable
ruins, and foreign flights continue normally. The position reopens at the next
03:00 UTC cleanup after at least 24 hours (24-48 hours, independent of speed).
Standalone moon abandonment is not offered by these tools.

## Versions and missing tools

Commander has its own semantic version, shared by the MCP tools, briefing and
this skill's `metadata.version`. The MCP handshake reports the running Commander
version; its instructions also identify the tarmy build. `tarmy --version`
lists the local client and bundled Commander versions and checks installed
guides against the bundle. A match means the installed guide matches that
binary, not that an online check found the latest release. The TUI footer and
`/version` show the bundled Commander version, not another assistant's process.

A missing tool may be excluded by `--allow`, unavailable in an older binary,
or not loaded by the assistant yet. Check the briefing and configuration
before diagnosing. Preserve an existing read-only setup during an update.
Starting `tarmy` automatically updates the client/MCP executable and refreshes
previously installed, unedited guides from that executable. Already running MCP
processes keep their old code until reconnected. `tarmy update` updates the binary; `tarmy commander <assistant> --name <existing-name>
--allow <existing-tiers>` refreshes its registration and bundled skill.
Restart the MCP connection or assistant to load changed tools.

`tarmy commander codex --skill-only` refreshes only the bundled guide.
It preserves a locally edited skill; `--no-skill` skips skill installation.
Use `changelog` to inspect published changes. Reference docs:
[installation](https://docs.terminal.army/install/),
[commands](https://docs.terminal.army/commands/),
[commander](https://docs.terminal.army/commander/).


### Combat forecasts

Before planning an attack, call `combat_rules` for the live universe's rules and
`simulate_combat` with fresh espionage data and each force's combat technologies.
Both are read-only server calls. Never infer rapid fire from initial total attack,
and never interpret `moon_chance` as a fraction: its unit is percent. Missing
research or stale fleet information makes a forecast uncertain; do not fill it
with invented intel. New combat reports carry `simulation_input` for replay.
The simulator returns sampled outcomes and loss ranges, not guaranteed wins.
