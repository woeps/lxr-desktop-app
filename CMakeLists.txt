# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only

cmake_minimum_required(VERSION 3.21)

# LXR drum sound module for RP2350 boards: Waveshare RP2350-Zero (default) or
# Raspberry Pi Pico 2 (-DPICO_BOARD=pico2).
#
#   cmake --preset release
#   cmake --build --preset release
#
# Produces build/<preset>/lxr.uf2. See README.md.

set(PICO_BOARD waveshare_rp2350_zero CACHE STRING "Board type")
set(PICO_PLATFORM rp2350-arm-s CACHE STRING "Platform")

include(${CMAKE_CURRENT_LIST_DIR}/cmake/pico_sdk_import.cmake)

project(lxr
    VERSION 2.0
    DESCRIPTION "LXR drum sound module for RP2350 boards"
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

add_executable(lxr
    board/rp2350/main.c
    board/rp2350/audio_i2s.c
    board/rp2350/console_usb.c
    board/rp2350/midi_uart.c
    board/rp2350/preset_flash.c
)
pico_generate_pio_header(lxr ${CMAKE_CURRENT_LIST_DIR}/board/rp2350/i2s.pio)
target_include_directories(lxr PRIVATE board/rp2350)
target_link_libraries(lxr PRIVATE
    pico_stdlib pico_multicore
    hardware_pio hardware_dma hardware_irq hardware_uart hardware_clocks hardware_vreg hardware_adc hardware_flash
    lxr_engine_flags)

# System clock and core voltage (design section 9, task 9.5). The RP2350 is rated for
# 150 MHz; the module runs at 250 MHz at the stock 1.10 V (docs/memory-map.md section 9).
set(LXR_SYS_CLOCK_KHZ 250000 CACHE STRING "System clock in kHz (250 MHz at 1.10 V: chosen in task 9.5, soak-tested)")
set(LXR_VREG_VOLTAGE VREG_VOLTAGE_1_10 CACHE STRING "Core voltage (hardware/vreg.h name), at most VREG_VOLTAGE_1_20")
set_property(CACHE LXR_VREG_VOLTAGE PROPERTY STRINGS VREG_VOLTAGE_1_10 VREG_VOLTAGE_1_15 VREG_VOLTAGE_1_20)
if(LXR_SYS_CLOCK_KHZ GREATER 250000)
    message(FATAL_ERROR "LXR_SYS_CLOCK_KHZ above the 250 MHz limit of design section 9")
endif()
if(NOT LXR_VREG_VOLTAGE MATCHES "^VREG_VOLTAGE_1_(10|15|20)$")
    message(FATAL_ERROR "LXR_VREG_VOLTAGE must be VREG_VOLTAGE_1_10, _1_15 or _1_20 (limit 1.20 V)")
endif()
target_compile_definitions(lxr PRIVATE LXR_SYS_CLOCK_KHZ=${LXR_SYS_CLOCK_KHZ} LXR_VREG_VOLTAGE=${LXR_VREG_VOLTAGE})

option(LXR_BOOT_DEMO "Play every voice once after boot (hardware check)" OFF)
if(LXR_BOOT_DEMO)
    target_compile_definitions(lxr PRIVATE LXR_BOOT_DEMO=1)
endif()

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
# Silent float-to-double promotion is an error in the engine (R5.1): the M33 FPU is single precision.
target_compile_options(lxr_engine PRIVATE -O3 -fno-thread-jumps -Werror=double-promotion)
target_link_libraries(lxr PRIVATE lxr_engine)
pico_add_map_output(lxr)

add_custom_command(TARGET lxr_engine POST_BUILD
    COMMAND ${CMAKE_COMMAND} -DNM=${CMAKE_NM} -DLIB=$<TARGET_FILE:lxr_engine>
            -P ${CMAKE_CURRENT_LIST_DIR}/cmake/check_no_double.cmake
    COMMENT "Checking the engine for double-precision code"
    VERBATIM
)

# The engine runs from RAM (docs/memory-map.md, section 3).
pico_set_binary_type(lxr copy_to_ram)

# USB carries power, flashing and the serial console (USB CDC). No USB MIDI.
# The console module starts stdio_usb itself (console_usb.c).
pico_enable_stdio_usb(lxr 1)
pico_enable_stdio_uart(lxr 0)

pico_add_extra_outputs(lxr)

# Fails if engine/ or midi/ reach into UI or hardware headers (R6.1).
add_custom_target(check_engine_deps ALL
    COMMAND ${CMAKE_COMMAND} -DROOT=${CMAKE_CURRENT_LIST_DIR}
            -P ${CMAKE_CURRENT_LIST_DIR}/cmake/check_engine_deps.cmake
    COMMENT "Checking engine/ and midi/ include rules"
    VERBATIM
)
