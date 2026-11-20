# LXR firmware: copyright, licence and trademark notice

Copyright (C) 2012-2026 Erica Synths. All rights not expressly granted below are reserved.

## What this notice covers

This notice and the licence in [LICENSE](LICENSE) apply to:

- `engine/`, `midi/`, `ui/`, `board/`, `host/`: the LXR drum sound module firmware
- `cmake/`: the build system

Third-party components keep their own licences, listed [below](#third-party-components).

## Licence

The firmware and build system are free software: you can redistribute and/or modify them
under the terms of the **GNU General Public License version 3** (GPL-3.0-only) as published by the
Free Software Foundation, with the additional permission and the additional terms below
(GPL-3.0 section 7). The full licence text is in [LICENSE](LICENSE).

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even
the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
License for more details.

### Additional permission under GNU GPL version 3 section 7

If you modify this Program, or any covered work, by linking or combining it with software from
STMicroelectronics that is distributed under STMicroelectronics licence terms, in particular the
"Ultimate Liberty" licence SLA0044 (or a modified version of that software), the licensors of this
Program grant you additional permission to convey the resulting work. This includes the STM32 USB
Device Library, the STM32CubeMX-generated code and the STMicroelectronics example code listed below.
Corresponding Source for a non-source form of such a combination shall include the source code for the
parts of that software used as well as that of the covered work.

### Additional terms under GNU GPL version 3 section 7

1. **Trademarks (section 7(e)).** This licence does not grant any rights under trademark law in the
   names "Erica Synths", "LXR" and "LXR-02" or in the associated logos. They may not be used for any
   product, modified firmware, service or other activity, commercial or not, in a way that suggests
   that it comes from, is approved by or is affiliated with Erica Synths, without prior written
   permission from Erica Synths. Truthful statements of compatibility, such as "custom firmware for
   the Erica Synths LXR-02", are allowed.
2. **Marking of modified versions (section 7(c)).** Modified versions must be marked in reasonable ways
   as different from the original version. At a minimum, the start-up screen of the device must show
   that the firmware is modified (for example a different name or version text), and a modified version
   must not be presented as official Erica Synths firmware.

## Hardware

The LXR hardware is the property of Erica Synths. That includes the electronic design (schematics,
printed circuit board layouts, bills of materials), the front panel, enclosure and industrial design, and
the product's appearance. It is protected by copyright, design rights and other intellectual property
rights. The hardware is **not** part of this repository and is **not** licensed under GPL-3.0 or any
other licence. It may not be copied, reproduced, manufactured or sold, in whole or in part, without
prior written permission from Erica Synths.

The GPL-3.0 licence of the firmware does not grant any rights to the hardware.

## Third-party components

These components are included in source form and are distributed under their own licences.

| Component | Location | Licence |
|---|---|---|

The firmware is built against the Raspberry Pi Pico SDK (BSD-3-Clause) and Arm CMSIS headers
(Apache-2.0). Neither is copied into this repository; they are fetched or installed at build time.
Earlier versions of this repository included STMicroelectronics HAL, USB and CMSIS device code and
ChaN FatFs for the STM32F765 desktop unit. They are removed from this tree and remain in the git history
under their original licences.
