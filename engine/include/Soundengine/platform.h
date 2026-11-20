/*
 * platform.h: the only place where the engine meets the compiler and CPU.
 *
 * Provides the DSP intrinsics (saturating SIMD adds, bit packing, saturation),
 * the memory-placement macros, and the half-float type. On the RP2350 build
 * the intrinsics map to Arm DSP instructions. On the host test build they are
 * plain C with identical results.
 *
 * Copyright (C) 2026 Erica Synths
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * This file is part of the LXR firmware. It is licensed under the GNU General
 * Public License version 3, with the additional permission and terms in
 * NOTICE.md. See LICENSE and NOTICE.md in the root of the repository.
 */

#ifndef LXR_PLATFORM_H_
#define LXR_PLATFORM_H_

#include <stdint.h>
#include <stddef.h>
#include <string.h>

/* Memory placement: the whole image runs from RAM on the Pico 2
 * (docs/memory-map.md), so these markers are empty. */
#define INDTCM
#define INDTCMZ
#define IN_ITCM_RAM

#ifndef __STATIC_INLINE
#define __STATIC_INLINE static inline
#endif

/* __fp16 storage type: native on Arm (-mfp16-format=ieee), _Float16 on the host. */
#if !defined(__ARM_FP16_FORMAT_IEEE) && !defined(__fp16)
#define __fp16 _Float16
#endif

#if defined(__ARM_FEATURE_SIMD32)

#include <arm_acle.h>

#define __QADD16(a, b)   __qadd16((a), (b))
#define __QSUB16(a, b)   __qsub16((a), (b))
#define __SADD16(a, b)   __sadd16((a), (b))
#define __QADD(a, b)     __qadd((a), (b))
#define __QSUB(a, b)     __qsub((a), (b))
#define __SSAT(v, bits)  __ssat((v), (bits))
#define __SMLALD(a, b, acc) __smlald((a), (b), (acc))
#define __CLZ(x)         __builtin_clz(x)
#define __PKHBT(a, b, sh) \
	({ uint32_t _r; __asm__("pkhbt %0, %1, %2, lsl %3" : "=r"(_r) : "r"(a), "r"(b), "i"(sh)); _r; })

#else /* portable C for the host build */

static inline int32_t lxr_sat16_(int32_t v)
{
	return v > 32767 ? 32767 : (v < -32768 ? -32768 : v);
}

static inline uint32_t __QADD16(uint32_t a, uint32_t b)
{
	int32_t lo = lxr_sat16_((int16_t)a + (int16_t)b);
	int32_t hi = lxr_sat16_((int16_t)(a >> 16) + (int16_t)(b >> 16));
	return ((uint32_t)(uint16_t)lo) | ((uint32_t)(uint16_t)hi << 16);
}

static inline uint32_t __QSUB16(uint32_t a, uint32_t b)
{
	int32_t lo = lxr_sat16_((int16_t)a - (int16_t)b);
	int32_t hi = lxr_sat16_((int16_t)(a >> 16) - (int16_t)(b >> 16));
	return ((uint32_t)(uint16_t)lo) | ((uint32_t)(uint16_t)hi << 16);
}

static inline uint32_t __SADD16(uint32_t a, uint32_t b)
{
	uint32_t lo = (uint16_t)((int16_t)a + (int16_t)b);
	uint32_t hi = (uint16_t)((int16_t)(a >> 16) + (int16_t)(b >> 16));
	return lo | (hi << 16);
}

static inline int32_t __QADD(int32_t a, int32_t b)
{
	int64_t r = (int64_t)a + b;
	return r > INT32_MAX ? INT32_MAX : (r < INT32_MIN ? INT32_MIN : (int32_t)r);
}

static inline int32_t __QSUB(int32_t a, int32_t b)
{
	int64_t r = (int64_t)a - b;
	return r > INT32_MAX ? INT32_MAX : (r < INT32_MIN ? INT32_MIN : (int32_t)r);
}

static inline int32_t __SSAT(int32_t v, uint32_t bits)
{
	int32_t max = (int32_t)((1u << (bits - 1)) - 1u);
	int32_t min = -max - 1;
	return v > max ? max : (v < min ? min : v);
}

static inline uint64_t __SMLALD(uint32_t a, uint32_t b, uint64_t acc)
{
	return acc + (int64_t)((int16_t)a * (int16_t)b) + (int64_t)((int16_t)(a >> 16) * (int16_t)(b >> 16));
}

#define __CLZ(x) ((x) ? (uint8_t)__builtin_clz(x) : (uint8_t)32)
#define __PKHBT(a, b, sh) \
	((((uint32_t)(a)) & 0x0000FFFFu) | ((((uint32_t)(b)) << (sh)) & 0xFFFF0000u))

#endif /* __ARM_FEATURE_SIMD32 */

/* Flush denormal floats to zero on the calling core (audio core). The Arm FPU
 * does this through FPSCR.FZ; on the host the build uses SSE flags instead. */
static inline void lxr_enable_flush_to_zero(void)
{
#if defined(__ARM_FP)
	uint32_t fpscr;
	__asm__ volatile("vmrs %0, fpscr" : "=r"(fpscr));
	fpscr |= (1u << 24);
	__asm__ volatile("vmsr fpscr, %0" : : "r"(fpscr));
#endif
}

#endif /* LXR_PLATFORM_H_ */
