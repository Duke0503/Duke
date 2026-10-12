"use client";

import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "cn";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase select-none",
        "group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
