# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only

cmake_minimum_required(VERSION 3.21)

# LXR drum sound module for the Raspberry Pi Pico 2 (RP2350).
#
#   cmake --preset release
#   cmake --build --preset release
#
# Produces build/<preset>/lxr.uf2. See README.md.

set(PICO_BOARD pico2 CACHE STRING "Board type")
set(PICO_PLATFORM rp2350-arm-s CACHE STRING "Platform")

include(${CMAKE_CURRENT_LIST_DIR}/cmake/pico_sdk_import.cmake)

project(lxr
    VERSION 2.0
    DESCRIPTION "LXR drum sound module for the Raspberry Pi Pico 2"
    LANGUAGES C CXX ASM
)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

pico_sdk_init()

# Flags every engine source needs: __fp16 (FX buffer) and single-precision math.
add_library(lxr_engine_flags INTERFACE)
target_compile_options(lxr_engine_flags INTERFACE
    $<$<COMPILE_LANGUAGE:C>:-mfp16-format=ieee -fsingle-precision-constant>
)
# TODO(task 8.4): add -Wdouble-promotion -Wfloat-conversion here once the
# float-to-double promotions found in task 1 are fixed.

add_executable(lxr
    board/pico2/main.c
)
target_link_libraries(lxr PRIVATE pico_stdlib lxr_engine_flags)

# Engine, MIDI parser and UI registry: plain C, no SDK headers (R6.1).
file(GLOB LXR_ENGINE_SOURCES CONFIGURE_DEPENDS
    ${CMAKE_CURRENT_LIST_DIR}/engine/src/*.c
    ${CMAKE_CURRENT_LIST_DIR}/engine/src/*/*.c
    ${CMAKE_CURRENT_LIST_DIR}/engine/src/*/*/*.c)
add_library(lxr_engine STATIC
    ${LXR_ENGINE_SOURCES}
    midi/src/MIDI/MidiParser.c
    ui/ui_iface.c
    ui/console/console.c
)
target_include_directories(lxr_engine PUBLIC engine/include midi/include ui)
target_link_libraries(lxr_engine PUBLIC lxr_engine_flags)
target_compile_options(lxr_engine PRIVATE -O3 -fno-thread-jumps)
target_link_libraries(lxr PRIVATE lxr_engine)

# The engine runs from RAM (docs/memory-map.md, section 3).
pico_set_binary_type(lxr copy_to_ram)

# USB is for power and BOOTSEL flashing only: no stdio over USB, no USB MIDI.
pico_enable_stdio_usb(lxr 0)
pico_enable_stdio_uart(lxr 0)

pico_add_extra_outputs(lxr)

# Fails if engine/ or midi/ reach into UI or hardware headers (R6.1).
add_custom_target(check_engine_deps ALL
    COMMAND ${CMAKE_COMMAND} -DROOT=${CMAKE_CURRENT_LIST_DIR}
            -P ${CMAKE_CURRENT_LIST_DIR}/cmake/check_engine_deps.cmake
    COMMENT "Checking engine/ and midi/ include rules"
    VERBATIM
)
