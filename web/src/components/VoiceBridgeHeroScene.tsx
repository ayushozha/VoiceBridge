"use client";

import type { PointerEvent } from "react";
import {
  MotionConfig,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

const waveBars = Array.from({ length: 13 }, (_, index) => index);

export function VoiceBridgeHeroScene() {
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateXBase = useTransform(pointerY, [-0.5, 0.5], [9, -9]);
  const rotateYBase = useTransform(pointerX, [-0.5, 0.5], [-11, 11]);
  const rotateX = useSpring(rotateXBase, { stiffness: 160, damping: 24 });
  const rotateY = useSpring(rotateYBase, { stiffness: 160, damping: 24 });

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5);
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function resetPointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <MotionConfig
      transition={{
        type: "spring",
        stiffness: 120,
        damping: 22,
        mass: 0.9,
      }}
    >
      <div
        className="relative mx-auto aspect-[1.14/1] w-full max-w-[760px] [perspective:1300px]"
        aria-label="3D product visualization of member voice flowing through VoiceBridge to a business workflow"
        onPointerMove={handlePointerMove}
        onPointerLeave={resetPointer}
      >
        <motion.div
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={reduceMotion ? undefined : { rotateX, rotateY }}
        >
          <motion.div
            className="absolute left-[5%] top-[42%] z-20 flex h-28 w-28 items-center justify-center rounded-full border border-white/[0.85] bg-white/75 text-center shadow-[0_24px_60px_rgba(61,131,172,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] [transform:translateZ(120px)] sm:h-32 sm:w-32"
            animate={reduceMotion ? undefined : { y: [0, -10, 0] }}
            transition={{ duration: 4.2, repeat: Infinity, repeatType: "mirror" }}
          >
            <span className="text-sm font-bold leading-5 text-[#1b4f66]">
              Member
              <br />
              voice
            </span>
          </motion.div>

          <motion.div
            className="absolute right-[4%] top-[42%] z-20 flex h-28 w-28 items-center justify-center rounded-full border border-white/[0.85] bg-white/75 text-center shadow-[0_24px_60px_rgba(255,178,43,0.18),inset_0_1px_0_rgba(255,255,255,0.95)] [transform:translateZ(120px)] sm:h-32 sm:w-32"
            animate={reduceMotion ? undefined : { y: [-4, 8, -4] }}
            transition={{ duration: 4.8, repeat: Infinity, repeatType: "mirror" }}
          >
            <span className="text-sm font-bold leading-5 text-[#7a4d05]">
              Business
              <br />
              action
            </span>
          </motion.div>

          <motion.div
            className="absolute left-[18%] right-[18%] top-[43%] z-10 h-28 rounded-lg border border-white/70 bg-white/[0.45] shadow-[0_30px_80px_rgba(71,133,178,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl [transform:rotateX(64deg)_translateZ(30px)]"
            animate={reduceMotion ? undefined : { scale: [1, 1.018, 1] }}
            transition={{ duration: 3.8, repeat: Infinity, repeatType: "mirror" }}
          >
            <div className="absolute inset-x-6 top-1/2 flex -translate-y-1/2 items-center justify-between">
              {waveBars.map((bar) => (
                <motion.span
                  key={bar}
                  className="h-12 w-2 rounded-lg bg-[linear-gradient(180deg,#38d6c5,#6d8cff,#ffbf3d)] shadow-[0_0_20px_rgba(109,140,255,0.34)]"
                  animate={
                    reduceMotion
                      ? undefined
                      : { scaleY: [0.32, 1, 0.48], opacity: [0.42, 1, 0.54] }
                  }
                  transition={{
                    duration: 1.7,
                    repeat: Infinity,
                    repeatType: "mirror",
                    delay: bar * 0.08,
                  }}
                />
              ))}
            </div>
          </motion.div>

          <motion.div
            className="absolute left-1/2 top-[27%] z-30 flex h-56 w-56 -translate-x-1/2 items-center justify-center rounded-full border border-white/[0.85] bg-white/[0.72] p-4 text-center shadow-[0_35px_95px_rgba(44,134,149,0.22),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl [transform-style:preserve-3d] sm:h-64 sm:w-64"
            animate={
              reduceMotion
                ? undefined
                : {
                    y: [0, -12, 0],
                    rotateZ: [-1.2, 1.2, -1.2],
                  }
            }
            transition={{ duration: 6, repeat: Infinity, repeatType: "mirror" }}
          >
            <div className="absolute inset-4 rounded-full border border-[#38d6c5]/35" />
            <div className="absolute inset-9 rounded-full border border-[#6d8cff]/30" />
            <div className="relative">
              <p className="text-sm font-semibold text-[#0f7c86]">VoiceBridge</p>
              <p className="mt-2 text-2xl font-bold leading-7 text-[#112033]">
                Consent
                <br />
                aware AI
              </p>
            </div>
          </motion.div>

          <motion.div
            className="absolute left-[31%] top-[16%] h-14 w-40 rounded-lg border border-[#6d8cff]/35 bg-white/[0.58] p-3 shadow-[0_18px_42px_rgba(109,140,255,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl [transform:translateZ(70px)_rotateZ(-8deg)]"
            animate={reduceMotion ? undefined : { y: [-2, 8, -2] }}
            transition={{ duration: 5.2, repeat: Infinity, repeatType: "mirror" }}
          >
            <p className="text-xs font-semibold text-[#31506d]">Memory stays attached</p>
          </motion.div>

          <motion.div
            className="absolute bottom-[17%] left-[37%] h-14 w-40 rounded-lg border border-[#ffbf3d]/45 bg-white/[0.58] p-3 shadow-[0_18px_42px_rgba(255,191,61,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl [transform:translateZ(86px)_rotateZ(7deg)]"
            animate={reduceMotion ? undefined : { y: [6, -4, 6] }}
            transition={{ duration: 5.8, repeat: Infinity, repeatType: "mirror" }}
          >
            <p className="text-xs font-semibold text-[#7a4d05]">Audit follows the call</p>
          </motion.div>

          <div className="absolute inset-x-[8%] bottom-[13%] h-16 rounded-[50%] bg-[radial-gradient(ellipse,rgba(49,80,109,0.18),transparent_68%)] blur-xl [transform:translateZ(-80px)]" />
        </motion.div>
      </div>
    </MotionConfig>
  );
}
