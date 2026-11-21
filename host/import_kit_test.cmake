# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only
#
# End-to-end check of host/scripts/import_kit.py: builds an old-style kit file
# (8-byte name + parameter bytes, here a short one from "older firmware"),
# imports it, and validates the result with lxr_preset_info (C, engine code).
# Usage: cmake -DPYTHON=... -DIMPORT=... -DINFO=... -DWORK=<dir> -P import_kit_test.cmake

file(MAKE_DIRECTORY "${WORK}")
set(_kit "${WORK}/TEST.SND")
execute_process(COMMAND "${PYTHON}" -c
    "import sys; d=b'Kick Two'+bytes([0,0,0,0,0,0,0,0,40,50]+[63]*180); open(sys.argv[1],'wb').write(d)"
    "${_kit}" RESULT_VARIABLE _rc)
if(NOT _rc EQUAL 0)
    message(FATAL_ERROR "could not write the test kit")
endif()

execute_process(COMMAND "${PYTHON}" "${IMPORT}" "${_kit}" -o "${WORK}/test.bin" --slot 3
    OUTPUT_VARIABLE _out RESULT_VARIABLE _rc)
if(NOT _rc EQUAL 0 OR NOT _out MATCHES "older firmware, 57 parameter" OR NOT _out MATCHES "0x103F2000")
    message(FATAL_ERROR "import_kit.py failed or printed unexpected text:\n${_out}")
endif()

execute_process(COMMAND "${INFO}" "${WORK}/test.bin" OUTPUT_VARIABLE _info RESULT_VARIABLE _rc)
if(NOT _rc EQUAL 0 OR NOT _info MATCHES "OK preset 'Kick Two'" OR NOT _info MATCHES "coarse1 +40")
    message(FATAL_ERROR "lxr_preset_info rejected the imported preset:\n${_info}")
endif()

execute_process(COMMAND "${PYTHON}" "${IMPORT}" "${WORK}/x.PAT" RESULT_VARIABLE _rc ERROR_VARIABLE _err)
if(_rc EQUAL 0 OR NOT _err MATCHES "only kit files")
    message(FATAL_ERROR "pattern file was not refused")
endif()
