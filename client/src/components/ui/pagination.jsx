import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Server-side pagination footer.
 *
 * Renders "Showing X–Y of Z" plus Prev/Next controls. Designed to sit inside
 * a Card, below a table. Hidden entirely when there is nothing to page through
 * (a single page or empty result set).
 *
 * Props:
 *   page        current 1-based page
 *   pageSize    rows per page
 *   total       total matching rows (across all pages)
 *   totalPages  total number of pages
 *   onChange    (nextPage) => void
 */
export function Pagination({ page, pageSize, total, totalPages, onChange }) {
  if (!total || totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 text-sm text-slate-500">
      <span>
        Showing <span className="font-medium text-slate-700">{from}</span>–
        <span className="font-medium text-slate-700">{to}</span> of{" "}
        <span className="font-medium text-slate-700">{total}</span>
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={15} className="mr-1" /> Prev
        </Button>
        <span className="px-1 text-xs text-slate-400">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next <ChevronRight size={15} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}
