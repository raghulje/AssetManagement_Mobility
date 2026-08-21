import { useEffect, useRef, useState } from "react";

const LETTERS = ["r", "e", "f", "e", "x"];

const BRAND = {
  blue: "#2879b6",
  green: "#7dc244",
  orange: "#ee6a31",
  ink: "#333842",
};

const LETTER_COLORS = [
  BRAND.blue,
  BRAND.blue,
  BRAND.green,
  BRAND.orange,
  BRAND.orange,
];

const FACE = [
  { mouth: "none", eyeTop: "28%", eyeGap: 7, eyeSize: 10 },
  { mouth: "none", eyeTop: "32%", eyeGap: 6, eyeSize: 9.5 },
  { mouth: "flat", eyeTop: "20%", eyeGap: 6, eyeSize: 9.5 },
  { mouth: "none", eyeTop: "32%", eyeGap: 6, eyeSize: 9.5 },
  { mouth: "smile", eyeTop: "28%", eyeGap: 7, eyeSize: 10 },
];

const POKE_REACTIONS = [
  { id: "hurt", line: "Don't audit me!", duration: 1800 },
  { id: "cry", line: "Please assign…", duration: 2200 },
  { id: "plead", line: "Spare the wipe!", duration: 2000 },
  { id: "hello", line: "Fleet online!", duration: 1800 },
  { id: "refexian", line: "Hey Refexian!", duration: 2200 },
  { id: "wave", line: "Tag secured!", duration: 1800 },
];

type EyeProps = {
  mouseX: number
  mouseY: number
  size?: number
  pupilSize?: number
  maxDistance?: number
  isBlinking?: boolean
  covered?: boolean
  forceLookX?: number
  forceLookY?: number
  sad?: boolean
  wide?: boolean
}

function EyeBall({
  mouseX,
  mouseY,
  size = 10,
  pupilSize = 3.6,
  maxDistance = 2.6,
  isBlinking = false,
  covered = false,
  forceLookX,
  forceLookY,
  sad = false,
  wide = false,
}: EyeProps) {
  const eyeRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const eyeSize = wide ? size * 1.25 : size;

  useEffect(() => {
    if (!eyeRef.current || covered || sad) return;
    if (forceLookX !== undefined && forceLookY !== undefined) {
      setPos({ x: forceLookX, y: forceLookY });
      return;
    }
    const eye = eyeRef.current.getBoundingClientRect();
    const cx = eye.left + eye.width / 2;
    const cy = eye.top + eye.height / 2;
    const dx = mouseX - cx;
    const dy = mouseY - cy;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    setPos({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance, covered, sad]);

  return (
    <div
      ref={eyeRef}
      style={{
        width: eyeSize,
        height: covered || isBlinking || sad ? 2.5 : eyeSize,
        backgroundColor: "#fff",
        borderRadius: "50%",
        border: "1.5px solid rgba(51,56,66,0.22)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transition: "height 0.15s ease, width 0.2s ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
      }}
    >
      {!isBlinking && !covered && !sad ? (
        <div
          style={{
            width: pupilSize,
            height: pupilSize,
            backgroundColor: BRAND.ink,
            borderRadius: "50%",
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            transition: "transform 0.08s ease-out",
          }}
        />
      ) : null}
    </div>
  );
}

function Mouth({ type, mood, reaction }: { type: string; mood: string; reaction?: string }) {
  const s = 0.7;

  if (reaction === "cry" || reaction === "plead") {
    return (
      <div
        style={{
          width: 14 * s,
          height: 8 * s,
          borderTop: `${2.2 * s}px solid ${BRAND.ink}`,
          borderLeft: `${2.2 * s}px solid ${BRAND.ink}`,
          borderRight: `${2.2 * s}px solid ${BRAND.ink}`,
          borderBottom: "none",
          borderRadius: `${12 * s}px ${12 * s}px 0 0`,
          marginTop: 4 * s,
        }}
      />
    );
  }
  if (reaction === "hurt") {
    return (
      <div
        style={{
          width: 12 * s,
          height: 8 * s,
          borderRadius: "50%",
          background: BRAND.ink,
          marginTop: 4 * s,
        }}
      />
    );
  }
  if (reaction === "hello" || reaction === "refexian" || reaction === "wave") {
    return (
      <div
        style={{
          width: 14 * s,
          height: 14 * s,
          borderRadius: "50%",
          border: `${2.4 * s}px solid ${BRAND.ink}`,
          marginTop: 3 * s,
          background: "rgba(255,255,255,0.35)",
        }}
      />
    );
  }
  if (type === "none" || mood === "hide" || mood === "none") return null;
  if (mood === "ooo" || mood === "talk") {
    return (
      <div
        style={{
          width: 11 * s,
          height: 12 * s,
          borderRadius: "45%",
          border: `${2.4 * s}px solid ${BRAND.ink}`,
          marginTop: 4 * s,
        }}
      />
    );
  }
  if (mood === "smile") {
    return (
      <div
        style={{
          width: 16 * s,
          height: 9 * s,
          borderBottom: `${2.5 * s}px solid ${BRAND.ink}`,
          borderLeft: `${2.5 * s}px solid ${BRAND.ink}`,
          borderRight: `${2.5 * s}px solid ${BRAND.ink}`,
          borderTop: "none",
          borderRadius: `0 0 ${14 * s}px ${14 * s}px`,
          marginTop: 3 * s,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 20 * s,
        height: 2.5 * s,
        backgroundColor: BRAND.ink,
        borderRadius: 99,
        marginTop: 5 * s,
      }}
    />
  );
}

function Tears({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="refex-tears" aria-hidden>
      <span />
      <span />
    </div>
  );
}

function CoveringHands({ color, active, peek = false, plead = false }: { color: string; active: boolean; peek?: boolean; plead?: boolean }) {
  const s = 0.7;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: plead ? "-8%" : "4%",
        width: 58 * s,
        height: 36 * s,
        transform: "translateX(-50%)",
        pointerEvents: "none",
        opacity: active || plead ? 1 : 0,
        transition: "opacity 0.25s ease, top 0.3s ease",
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 26 * s,
          height: 20 * s,
          backgroundColor: color,
          borderRadius: "42% 52% 46% 40%",
          left: peek || plead ? 0 : 7 * s,
          top: peek ? 12 * s : plead ? -4 * s : 2 * s,
          transform: plead
            ? "rotate(-40deg) translateY(-4px)"
            : peek
              ? "rotate(-12deg)"
              : "rotate(-26deg)",
          transition: "all 0.35s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 26 * s,
          height: 20 * s,
          backgroundColor: color,
          borderRadius: "52% 42% 40% 46%",
          right: peek || plead ? 0 : 7 * s,
          top: peek ? 12 * s : plead ? -4 * s : 2 * s,
          transform: plead
            ? "rotate(40deg) translateY(-4px)"
            : peek
              ? "rotate(12deg)"
              : "rotate(26deg)",
          transition: "all 0.35s ease",
        }}
      />
    </div>
  );
}

/**
 * Interactive lowercase "refex" wordmark with eyes, poke reactions,
 * username-watch bend/stretch, and password cover-eyes.
 */
type LetterProps = {
  isTyping?: boolean
  isPasswordFocused?: boolean
  showPassword?: boolean
  passwordLength?: number
  emailLength?: number
  isExcited?: boolean
}

export default function AnimatedRefexLetters({
  isTyping = false,
  isPasswordFocused = false,
  showPassword = false,
  passwordLength = 0,
  emailLength = 0,
  isExcited = false,
}: LetterProps) {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [blinkMask, setBlinkMask] = useState([false, false, false, false, false]);
  const [jumpTick, setJumpTick] = useState(0);
  const [bouncePhase, setBouncePhase] = useState(0);
  const [reactions, setReactions] = useState<Record<number, string>>({});
  const [speech, setSpeech] = useState<{ index: number; line: string; id: string } | null>(null);
  const pokeCount = useRef(0);
  const letterRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const clearReactionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const covering = isPasswordFocused && !showPassword;
  const isPeeking = passwordLength > 0 && showPassword;
  const jumping = jumpTick % 2 === 1;
  const watchingEmail = isTyping || emailLength > 0;
  const typeLookX = Math.min(6, Math.max(-2, emailLength * 0.45 - 1));
  const typeLookY = watchingEmail ? 3.5 : 0;
  const stretch = watchingEmail ? 1 + Math.min(0.18, emailLength * 0.012) : 1;
  const bend = watchingEmail ? -6 - Math.min(10, emailLength * 0.55) : 0;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setBouncePhase((p) => (p + 1) % 5), 850);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timeout = setTimeout(() => {
        setJumpTick((n) => n + 1);
        setTimeout(() => setJumpTick((n) => n + 1), 260);
        schedule();
      }, Math.random() * 5000 + 3800);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (isPasswordFocused || isExcited) {
      setJumpTick((n) => n + 1);
      const t = setTimeout(() => setJumpTick((n) => n + 1), 220);
      return () => clearTimeout(t);
    }
  }, [isPasswordFocused, isExcited]);

  useEffect(() => {
    const clears = LETTERS.map((_, i) => {
      let timeout: ReturnType<typeof setTimeout>;
      const run = () => {
        timeout = setTimeout(() => {
          setBlinkMask((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
          setTimeout(() => {
            setBlinkMask((prev) => {
              const next = [...prev];
              next[i] = false;
              return next;
            });
            run();
          }, 140);
        }, Math.random() * 3500 + 1800 + i * 350);
      };
      run();
      return () => clearTimeout(timeout);
    });
    return () => clears.forEach((c) => c());
  }, []);

  const pokeLetter = (index: number) => {
    const reaction = POKE_REACTIONS[pokeCount.current % POKE_REACTIONS.length];
    pokeCount.current += 1;
    if (clearReactionRef.current) clearTimeout(clearReactionRef.current);
    setReactions({ [index]: reaction.id });
    setSpeech({ index, line: reaction.line, id: reaction.id });
    setJumpTick((n) => n + 1);
    clearReactionRef.current = setTimeout(() => {
      setReactions({});
      setSpeech(null);
    }, reaction.duration);
  };

  const bounceY = (offset: number) => {
    const idle = [0, -5, -1, -7, -2][(bouncePhase + offset) % 5] * 0.55;
    return idle + (jumping || isExcited ? -12 * 0.55 : 0);
  };

  const faceShift = (index: number) => {
    const el = letterRefs.current[index];
    if (!el) return { x: 0, y: 0, skew: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.35;
    return {
      x: Math.max(-5, Math.min(5, (mouseX - cx) / 40)),
      y: Math.max(-4, Math.min(4, (mouseY - cy) / 50)),
      skew: Math.max(-4, Math.min(4, -(mouseX - cx) / 160)),
    };
  };

  const mouthMood = () => {
    if (covering) return "hide";
    if (isExcited) return "ooo";
    if (watchingEmail) return "talk";
    if (isPeeking) return "smile";
    return "default";
  };

  const mood = mouthMood();

  return (
    <div className="refex-stage refex-stage--compact">
      {LETTERS.map((char, index) => {
        const face = faceShift(index);
        const look = FACE[index];
        const peek = isPeeking && index === 2;
        const lookingAway = covering;
        const y = bounceY(index);
        const reaction = reactions[index];

        let faceX = lookingAway ? (index % 2 === 0 ? -5 : 5) : face.x;
        let faceY = face.y;
        if (watchingEmail && !lookingAway && !reaction) {
          faceX = typeLookX;
          faceY = typeLookY;
        }

        let transform = `skewX(${face.skew}deg) translateY(${y}px)`;
        if (lookingAway) {
          transform = `skewX(${index % 2 === 0 ? -7 : 7}deg) translateY(${y}px)`;
        } else if (reaction === "hurt") {
          transform = `scaleY(0.78) scaleX(1.12) translateY(${y + 6}px)`;
        } else if (reaction === "cry") {
          transform = `skewX(${index % 2 === 0 ? -4 : 4}deg) scaleY(0.92) translateY(${y + 4}px)`;
        } else if (reaction === "plead") {
          transform = `scaleY(1.08) translateY(${y - 6}px)`;
        } else if (reaction === "hello" || reaction === "refexian" || reaction === "wave") {
          transform = `skewX(${index % 2 === 0 ? 8 : -8}deg) scaleY(1.06) rotate(${index % 2 === 0 ? -6 : 6}deg) translateY(${y - 8}px)`;
        } else if (watchingEmail) {
          const lean = bend + (index - 2) * 1.5;
          transform = `skewX(${lean}deg) scaleY(${stretch}) scaleX(${1 / Math.sqrt(stretch)}) translateX(6px) translateY(${y}px)`;
        }

        const forceLookX = lookingAway
          ? -3
          : isPeeking
            ? peek
              ? 3
              : -3
            : watchingEmail
              ? typeLookX
              : undefined;
        const forceLookY = lookingAway
          ? -3
          : isPeeking
            ? peek
              ? 3
              : -2
            : watchingEmail
              ? typeLookY
              : undefined;

        return (
          <button
            key={`${char}-${index}`}
            type="button"
            ref={(el) => {
              letterRefs.current[index] = el;
            }}
            className="refex-letter"
            aria-label={`Letter ${char}, poke me`}
            onClick={() => pokeLetter(index)}
            style={{
              transform,
              marginLeft: index === 0 ? 0 : -3,
            }}
          >
            {speech?.index === index ? (
              <span className={`refex-bubble refex-bubble--${speech.id}`} role="status">
                {speech.line}
              </span>
            ) : null}

            <span
              className="refex-glyph"
              style={{
                backgroundImage: `linear-gradient(90deg,
                  ${BRAND.blue} 0%,
                  ${BRAND.blue} 18%,
                  ${BRAND.green} 50%,
                  ${BRAND.orange} 82%,
                  ${BRAND.orange} 100%)`,
                backgroundSize: `${LETTERS.length * 100}% 100%`,
                backgroundPosition: `${(index / (LETTERS.length - 1)) * 100}% 0`,
              }}
            >
              {char}
            </span>

            <div
              className="refex-face"
              style={{
                top: look.eyeTop,
                transform: `translate(calc(-50% + ${faceX}px), ${faceY}px)`,
              }}
            >
              <div className="refex-eyes" style={{ gap: look.eyeGap }}>
                <EyeBall
                  mouseX={mouseX}
                  mouseY={mouseY}
                  size={look.eyeSize}
                  isBlinking={blinkMask[index] && !reaction}
                  covered={(covering && !peek) || reaction === "hurt"}
                  sad={reaction === "cry"}
                  wide={reaction === "plead" || reaction === "hello"}
                  forceLookX={forceLookX}
                  forceLookY={forceLookY}
                />
                <EyeBall
                  mouseX={mouseX}
                  mouseY={mouseY}
                  size={look.eyeSize}
                  isBlinking={blinkMask[index] && !reaction}
                  covered={(covering && !peek) || reaction === "hurt"}
                  sad={reaction === "cry"}
                  wide={reaction === "plead" || reaction === "hello"}
                  forceLookX={forceLookX}
                  forceLookY={forceLookY}
                />
              </div>
              <Tears active={reaction === "cry"} />
              <Mouth
                type={look.mouth}
                mood={mood === "default" ? look.mouth : mood}
                reaction={reaction}
              />
            </div>

            <CoveringHands
              color={LETTER_COLORS[index]}
              active={covering || (isPeeking && !peek)}
              peek={peek}
              plead={reaction === "plead"}
            />
          </button>
        );
      })}
    </div>
  );
}
