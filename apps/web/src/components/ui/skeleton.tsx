import { cn } from "cn";

/** The grey box that holds a row's place while it loads. Quiet, not a spinner. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-duke-card-2 animate-pulse rounded-lg", className)}
      {...props}
    />
  );
}

export { Skeleton };
