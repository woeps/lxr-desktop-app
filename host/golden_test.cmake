# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only
#
# Renders SCRIPT with RENDER into OUT and compares it with GOLDEN using WAVCMP.
# The render length comes from a "# seconds: <n>" line in the script.

file(STRINGS "${SCRIPT}" _len REGEX "^# seconds: [0-9.]+")
if(NOT _len)
    message(FATAL_ERROR "${SCRIPT}: missing '# seconds: <n>' line")
endif()
string(REGEX REPLACE "^# seconds: ([0-9.]+).*" "\\1" _seconds "${_len}")

execute_process(COMMAND "${RENDER}" "${SCRIPT}" "${_seconds}" "${OUT}" RESULT_VARIABLE _rc)
if(NOT _rc EQUAL 0)
    message(FATAL_ERROR "render failed (${_rc})")
endif()

if(NOT EXISTS "${GOLDEN}")
    message(FATAL_ERROR "no golden file ${GOLDEN}. Listen to ${OUT} and copy it there if it is right.")
endif()

execute_process(COMMAND "${WAVCMP}" "${GOLDEN}" "${OUT}" RESULT_VARIABLE _rc)
if(NOT _rc EQUAL 0)
    message(FATAL_ERROR "output differs from ${GOLDEN}")
endif()
