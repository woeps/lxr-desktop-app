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
