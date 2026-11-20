# Copyright (C) 2026 Erica Synths
# SPDX-License-Identifier: GPL-3.0-only

cmake_minimum_required(VERSION 3.21)

# Host test build: compiles engine/, midi/ and ui/console with the host C
# compiler, with no Pico SDK and no hardware (requirements R5.5 and R6.6).
#
#   cmake -S host -B build/host -G Ninja
#   cmake --build build/host
#   ctest --test-dir build/host
#
# Targets are added by tasks 5 to 8 of .kiro/specs/1-move-this-repo-over/tasks.md.

project(lxr_host LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

enable_testing()

set(LXR_ROOT ${CMAKE_CURRENT_LIST_DIR}/..)

# Settings shared by every host target. The engine must stay single-precision (R5.1).
add_library(lxr_host_flags INTERFACE)
target_include_directories(lxr_host_flags INTERFACE
    ${LXR_ROOT}/engine/include
    ${LXR_ROOT}/midi/include
    ${LXR_ROOT}/ui
)
target_compile_options(lxr_host_flags INTERFACE
    -Wall -Wextra -Wdouble-promotion -Wfloat-conversion -fsingle-precision-constant
)

# --- parameter table (task 4) ---------------------------------------------------
add_executable(test_param_table
    test_param_table.c
    ${LXR_ROOT}/engine/src/param_table.c
)
target_link_libraries(test_param_table PRIVATE lxr_host_flags)
add_test(NAME param_table COMMAND test_param_table)

# --- engine (tasks 5 and 8) ---------------------------------------------------------
# The whole engine and the MIDI parser, built for the host.
file(GLOB LXR_ENGINE_SOURCES ${LXR_ROOT}/engine/src/*.c ${LXR_ROOT}/engine/src/*/*.c ${LXR_ROOT}/engine/src/*/*/*.c)
list(FILTER LXR_ENGINE_SOURCES EXCLUDE REGEX "param_table\\.c$")
add_library(lxr_engine_host STATIC
    ${LXR_ENGINE_SOURCES}
    ${LXR_ROOT}/engine/src/param_table.c
    ${LXR_ROOT}/midi/src/MIDI/MidiParser.c
    ${LXR_ROOT}/ui/ui_iface.c
)
target_link_libraries(lxr_engine_host PUBLIC lxr_host_flags m)
# TODO(task 8.4): remove this once the float-to-double promotions found in task 1 are fixed.
target_compile_options(lxr_engine_host PRIVATE -Wno-double-promotion -Wno-attributes -Wno-unused-parameter -Wno-sign-compare -Wno-unused-variable -Wno-unused-but-set-variable)

add_executable(test_engine test_engine.c)
target_link_libraries(test_engine PRIVATE lxr_engine_host)
add_test(NAME engine_api COMMAND test_engine)

# --- MIDI parser (task 6) ---------------------------------------------------------
# Built against a recording mock of the Engine API (in the test file).
add_executable(test_midi_parser
    test_midi_parser.c
    ${LXR_ROOT}/midi/src/MIDI/MidiParser.c
    ${LXR_ROOT}/engine/src/param_table.c
)
target_link_libraries(test_midi_parser PRIVATE lxr_host_flags)
add_test(NAME midi_parser COMMAND test_midi_parser)
