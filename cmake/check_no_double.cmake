# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only
#
# Fails if the engine library calls software double-precision helpers or double
# libm functions (requirement R5.1: the Cortex-M33 FPU is single precision).
# Usage: cmake -DNM=<arm-none-eabi-nm> -DLIB=<liblxr_engine.a> -P check_no_double.cmake

execute_process(COMMAND "${NM}" -A -u "${LIB}" OUTPUT_VARIABLE _syms RESULT_VARIABLE _rc)
if(NOT _rc EQUAL 0)
    message(FATAL_ERROR "nm failed on ${LIB}")
endif()

string(REPLACE "\n" ";" _lines "${_syms}")
set(_bad "")
foreach(_l IN LISTS _lines)
    if(_l MATCHES "U (__aeabi_d[a-z0-9]+|__aeabi_[a-z]*2d|sin|cos|tan|pow|exp|exp2|log|log2|log10|tanh|sqrt|fabs|floor|ceil|fma|fmod|atan|atan2|round)$")
        string(APPEND _bad "  ${_l}\n")
    endif()
endforeach()

if(_bad)
    message(FATAL_ERROR "Double-precision code in the engine (use float and the f-variants of libm):\n${_bad}")
endif()
