/*
 * preset_flash.h: preset storage in the board's flash (design section 7.3).
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_PRESET_FLASH_H_
#define LXR_PRESET_FLASH_H_

/** Hands the flash preset region to the engine. Returns -1 (and stores nothing) if the
 *  firmware image would overlap the preset region. Control core. */
int preset_flash_init(void);

#endif /* LXR_PRESET_FLASH_H_ */
