import { footprintPaths } from "@/lib/cells";

/** Static shape of a zone's H3 cells. Decorative unless a label is given. */
export function CellFootprint({
  cells,
  anchored,
  className,
  label,
}: {
  cells: readonly string[];
  anchored: boolean;
  className?: string;
  label?: string;
}) {
  const { paths, width, height } = footprintPaths(cells);
  const pad = 3;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          className={anchored ? "fill-mangrove/70 stroke-gold" : "fill-mangrove/45 stroke-tide/50 dark:stroke-roots/60"}
          strokeWidth={anchored ? 1.2 : 0.8}
          strokeDasharray={anchored ? undefined : "2 1.5"}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
