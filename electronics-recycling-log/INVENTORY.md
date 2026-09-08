# Electronics Recycling — Container Inventory

Master index of every physical storage container (bin/box/bag) holding
scrap that isn't currently on the bench. Each container gets one label and
one row here. Before minting a new label, check this file for an existing
container in the same category with room left.

## Label format

`ER-<CATEGORY>-<NNN>`

| Category code | Contents |
|---|---|
| DISP | Displays / LCD / OLED panels (with or without driver board attached) |
| BRD  | Bare PCBs, driver/controller boards, modules pulled from a device |
| PWR  | Batteries, power supplies, chargers, DC-DC modules, adapters |
| CONN | Connectors, cables, headers, ribbon/FPC, wire |
| MECH | Enclosures, brackets, screws, mechanical hardware |
| MISC | Anything that doesn't fit the above |

`NNN` is a 3-digit sequence assigned in order per category (001, 002, ...).
Numbers are never reused, even if a container is later emptied.

## Workflow

1. You bring a piece of scrap to my attention (describe it, show it, hand
   it to me for teardown notes).
2. I write it up in `LOG.md`.
3. I check it against the active build's needs (the open items at the
   bottom of `LOG.md`) and make a call:
   - **Usable now** → it stays on the bench. Logged in `LOG.md` only,
     status marked "On bench — active." No inventory row.
   - **Not usable now** → I assign a container label (new, or an
     existing one with room), tell you how to package it, and add/update
     the row below. You write the label on the container and place it —
     tell me where, and I record it in Location.
4. This file is the source of truth for "what's in storage and where."
   Ask me "what do we have" or "where's X" and I read this file first.

## Containers

| Label | Category | Location | Contents | Date added | Notes |
|---|---|---|---|---|---|
| _(none yet — first stored item creates the first row)_ | | | | | |

---

## Packaging guidelines by category

- **DISP** — anti-static bag; protect the panel face with original
  foam/film if still attached; store flat or vertical, never stacked
  under weight (cracks glass, flexes the FPC tail).
- **BRD** — anti-static bag; cap or wrap exposed pins/connectors; keep
  away from loose metal or screws in the same container.
- **PWR** — batteries isolated, tape over terminals, one per bag, never
  loose against metal or other batteries; check for swelling before
  storing.
- **CONN** — small-parts bin with dividers or individual bags, grouped
  by connector type/pitch; coil and tape any pigtail/antenna so it
  doesn't snag.
- **MECH** — no anti-static needed; sort screws/hardware by size in a
  divided container or labeled zip bag.
- **MISC** — anti-static bag if anything conductive/board-like,
  otherwise a plain bag or bin.
