# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only
#
# engine/ and midi/ must not include UI or hardware headers (requirement R6.1).
# Usage: cmake -DROOT=<repo> -P check_engine_deps.cmake

file(GLOB_RECURSE _files
    "${ROOT}/engine/*.c" "${ROOT}/engine/*.h"
    "${ROOT}/midi/*.c"   "${ROOT}/midi/*.h")

set(_pattern "^[ \t]*#[ \t]*include[ \t]*[<\"][^>\"]*(menu|lcd|button|led|encoder|frontPanel|graphic|pico/|hardware/|stm32|main\\.h)")
set(_bad "")
foreach(_f IN LISTS _files)
    file(STRINGS "${_f}" _hits REGEX "${_pattern}")
    foreach(_h IN LISTS _hits)
        string(APPEND _bad "  ${_f}: ${_h}\n")
    endforeach()
endforeach()

if(_bad)
    message(FATAL_ERROR "Forbidden includes in engine/ or midi/:\n${_bad}")
endif()
