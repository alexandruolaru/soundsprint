import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
  speedSeconds?: number;
};

export function MarqueeText({
  text,
  className = "",
  speedSeconds = 14,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    const check = () => {
      const wrap = wrapRef.current;
      const inner = textRef.current;
      if (!wrap || !inner) return;
      setShouldScroll(inner.scrollWidth > wrap.clientWidth + 8);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden whitespace-nowrap ${className}`}
      title={text}
    >
      {shouldScroll ? (
        <div
          className="flex min-w-max animate-marquee will-change-transform"
          style={{ animationDuration: `${speedSeconds}s` }}
        >
          <div ref={textRef} className="pr-10">
            {text}
          </div>
          <div className="pr-10">{text}</div>
        </div>
      ) : (
        <div ref={textRef} className="truncate">
          {text}
        </div>
      )}
    </div>
  );
}
