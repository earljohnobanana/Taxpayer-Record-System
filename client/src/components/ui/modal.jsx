import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className = "",
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-0" />

        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-white shadow-2xl border border-slate-200 outline-none",
            className
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
            <Dialog.Title className="text-lg font-semibold text-slate-800">
              {title}
            </Dialog.Title>

            <Dialog.Close asChild>
              <button
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* min-h-0 lets this shrink inside the flex column so overflow-y-auto
              actually scrolls instead of pushing content past max-h-[90vh]. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {children}
          </div>

          {/* Optional pinned footer: stays visible below the scroll area. */}
          {footer && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}