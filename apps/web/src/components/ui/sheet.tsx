"use client";

/**
 * The bottom sheet.
 *
 * Used for the Switch Character picker and the end-of-call summary. On a phone the sheet is
 * the right shape for "one decision, then back to what you were doing" — it never takes over
 * the screen, and swiping it down is the same as Cancel.
 *
 * Radix supplies the focus trap and the safe-area padding comes from the viewport meta tag.
 * The only styling decision here is the drag handle: a sheet with no handle reads like a page
 * that failed to load.
 */

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "cn";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;
const SheetTitle = SheetPrimitive.Title;
const SheetDescription = SheetPrimitive.Description;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { showClose?: boolean }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-card border-border fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85vh] w-full max-w-[430px] flex-col rounded-t-2xl border-t border-x-0 border-b-0 pb-6 shadow-2xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-250",
          className,
        )}
        {...props}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="bg-border h-1 w-10 rounded-full" aria-hidden />
        </div>
        {showClose ? (
          <SheetPrimitive.Close
            className="text-muted-foreground hover:text-foreground absolute top-3 right-3 rounded-full p-1.5 transition-colors"
            aria-label="Close"
          >
            <XIcon className="size-4" />
          </SheetPrimitive.Close>
        ) : null}
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 px-5 pt-2 pb-3", className)} {...props} />;
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("flex flex-col gap-2 px-5 pt-4", className)} {...props} />;
}

function SheetHeading({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-heading"
      className={cn("font-display text-lg font-semibold", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetHeading,
  SheetDescription,
};
