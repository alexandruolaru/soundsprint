type Props = {
  levels: [number, number, number];
};

export function Visualizer({ levels }: Props) {
  return (
    <div className="flex items-end gap-1 h-6">
      {levels.map((lvl, i) => {
        const v = Math.max(0.15, Math.min(1, lvl));

        return (
          <div
            key={i}
            className="w-1.5 rounded-full bg-white/70 shadow-[0_0_12px_rgba(255,255,255,0.25)]"
            style={{
              height: "24px",
              transform: `scaleY(${v})`,
            }}
          />
        );
      })}
    </div>
  );
}
