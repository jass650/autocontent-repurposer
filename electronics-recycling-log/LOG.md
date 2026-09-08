# Electronics Recycling Project — Session Log

A running log of salvaged/reclaimed electronics being reverse-engineered and
repurposed. Each entry documents what a board is, what's known about it,
whether it's usable on the active build, and what's next.

Every piece of scrap gets a verdict:
- **On bench — active** — usable now, being worked on for the current
  project, stays out of storage.
- **Stored — see `INVENTORY.md`** — not usable right now; packaged and
  put away under a labeled container, tracked in the inventory file so
  it can be found again later.

`INVENTORY.md` in this folder is the master list of storage containers,
their labels, and their locations — check there for "what do we have"
and "where is it."

---

## 2026-09-04 — 7" TFT LCD panel + driver/controller board

**Status:** On bench — active teardown, not yet stored.

**Setup:** panel and driver board sitting on an anti-static mat, driver
board wired to a breadboard and a bench power supply/adapter module
(barrel-jack DC-in, screw-terminal outputs).

**Panel**
- 7" TFT LCD, glossy glass, silver bezel.
- FPC (flex) cable printed `KA TTC9439A -05-11`, terminating in a ZIF
  connector on the driver board.
- Likely native resolution in the 800×480 / 1024×600 class for this panel
  size — needs confirming from the FPC pinout or a datasheet lookup once
  the exact panel model is identified.

**Driver board**
- Silkscreen: `3000-06-43025L-V1`, `FR4-1.0mm`, dated `2025-03-12`.
- Central QFP IC (likely the LCD timing controller / decoder) plus a
  smaller SOIC IC nearby — part numbers not yet read off the packages.
- Connectors/headers present:
  - ZIF FPC connector to the LCD panel
  - UART header (TX/RX, 2-pin)
  - `BAT1` battery connector (JST-style, 2-pin)
  - microSD/TF card slot
  - Two USB connectors (one appears to be USB-C) — pads silkscreened
    `HUSBDP`/`HUSBDN`-style, suggesting USB data lines routed to the main
    IC rather than straight power
  - U.FL antenna connector (`ANT1`) with a short pigtail + wire antenna
    attached — points to an onboard BT/Wi-Fi radio module
- Powered from a bench supply module via the breadboard during this
  session; screen was dark/unpowered in the photo (no backlight visible).

**Hypothesis:** this looks like a general-purpose "smart" LCD driver board
of the kind used in car head units, digital photo frames, or portable
media players — SD card + USB + Bluetooth + battery all point to a
board meant to drive the panel from local media or a paired device rather
than a bare LVDS/RGB "just show HDMI" driver.

**Next steps**
- [ ] Read the exact part numbers off the main QFP IC and the SOIC IC
      next to it, and look up their datasheets.
- [ ] Confirm the panel's native resolution/interface (RGB, LVDS, MIPI)
      from the FPC pin count/pitch.
- [ ] Determine required supply voltage/current for the driver board and
      backlight (separate rail?) before powering up for real.
- [ ] Check what the UART header expects (likely 3.3V logic — verify
      before connecting a USB-serial adapter).
- [ ] Try powering the board and confirm backlight/video output.
