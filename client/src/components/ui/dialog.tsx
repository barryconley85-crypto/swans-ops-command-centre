import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

// Context to track composition state across dialog children
const DialogCompositionContext = React.createContext<{
  isComposing: () => boolean;
  setComposing: (composing: boolean) => void;
  justEndedComposing: () => boolean;
  markCompositionEnd: () => void;
}>({
  isComposing: () => false,
  setComposing: () => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

export const useDialogComposition = () =>
  React.useContext(DialogCompositionContext);

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const composingRef = React.useRef(false);
  const justEndedRef = React.useRef(false);
  const endTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextValue = React.useMemo(
    () => ({
      isComposing: () => composingRef.current,

      setComposing: (composing: boolean) => {
        composingRef.current = composing;
      },

      justEndedComposing: () => justEndedRef.current,

      markCompositionEnd: () => {
        justEndedRef.current = true;

        if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
        }

        endTimerRef.current = setTimeout(() => {
          justEndedRef.current = false;
        }, 150);
      },
    }),
    [],
  );

  return (
    <DialogCompositionContext.Provider value={contextValue}>
      <DialogPrimitive.Root
        data-slot="dialog"
        {...props}
      />
    </DialogCompositionContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      {...props}
    />
  );
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      {...props}
    />
  );
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      {...props}
    />
  );
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50",
        "data-[state=open]:animate-in",
        "data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0",
        "data-[state=open]:fade-in-0",
        "pointer-events-auto",
        className,
      )}
      {...props}
    />
  );
}

DialogOverlay.displayName = "DialogOverlay";

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const { isComposing } =
    useDialogComposition();

  const handleEscapeKeyDown =
    React.useCallback(
      (e: KeyboardEvent) => {
        const isCurrentlyComposing =
          (e as any).isComposing ||
          isComposing();

        if (isCurrentlyComposing) {
          e.preventDefault();
          return;
        }

        onEscapeKeyDown?.(e);
      },
      [isComposing, onEscapeKeyDown],
    );

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />

      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          [
            // Base
            "bg-background",
            "fixed",
            "z-[60]",
            "grid",
            "gap-4",
            "border",
            "shadow-lg",
            "duration-200",

            // Critical touch interaction
            "pointer-events-auto",
            "touch-manipulation",

            // Mobile
            "inset-x-0",
            "top-0",
            "bottom-0",
            "w-full",
            "max-w-none",
            "h-[100dvh]",
            "max-h-[100dvh]",
            "translate-x-0",
            "translate-y-0",
            "overflow-y-auto",
            "overscroll-contain",
            "touch-pan-y",
            "rounded-none",
            "p-4",

            // Mobile animations
            "data-[state=open]:animate-in",
            "data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0",
            "data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95",
            "data-[state=open]:zoom-in-95",

            // Desktop
            "sm:inset-auto",
            "sm:top-[50%]",
            "sm:left-[50%]",
            "sm:bottom-auto",
            "sm:h-auto",
            "sm:max-h-[calc(100vh-2rem)]",
            "sm:w-full",
            "sm:max-w-lg",
            "sm:translate-x-[-50%]",
            "sm:translate-y-[-50%]",
            "sm:rounded-lg",
            "sm:p-6",
          ].join(" "),
          className,
        )}
        onEscapeKeyDown={handleEscapeKeyDown}
        {...props}
      >
        {children}

        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              "absolute right-4 top-4 z-[100]",
              "pointer-events-auto",
              "touch-manipulation",
              "rounded-xs opacity-70",
              "transition-opacity",
              "hover:opacity-100",
              "focus:ring-2",
              "focus:ring-offset-2",
              "focus:outline-hidden",
              "disabled:pointer-events-none",
              "[&_svg]:pointer-events-none",
              "[&_svg]:shrink-0",
              "[&_svg:not([class*='size-'])]:size-4",
            )}
          >
            <XIcon />
            <span className="sr-only">
              Close
            </span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Layout
        "flex flex-col-reverse gap-2",
        "sm:flex-row sm:justify-end",

        // Mobile touch fix
        "relative z-[90]",
        "pointer-events-auto",
        "touch-manipulation",

        // Keep bottom action reachable on iPhone
        "shrink-0",
        "pb-[env(safe-area-inset-bottom)]",

        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<
  typeof DialogPrimitive.Title
>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-lg leading-none font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<
  typeof DialogPrimitive.Description
>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-muted-foreground text-sm",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};