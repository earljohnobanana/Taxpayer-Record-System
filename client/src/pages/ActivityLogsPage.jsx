import { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Search, ScrollText } from "lucide-react";
import { apiRequest } from "@/services/api";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

const PAGE_SIZE = 25;

export default function ActivityLogsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search);

  /* A new search resets back to the first page. */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  /* Server-side search + pagination. Response is the standard envelope:
     { data, total, page, pageSize, totalPages }. */
  const { data, isLoading, error, isPlaceholderData } = useQuery({
    queryKey: ["activity-logs", debouncedSearch, page],
    queryFn: () => {
      const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      return apiRequest(`/activity-logs?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">

      <PageHeader
        title="Activity Logs"
        subtitle="Recent actions performed across the system"
      />

      <div className="relative max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          className="pl-9"
          placeholder="Search user, module, action, details..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
          ) : error ? (
            <div className="py-16 text-center text-sm text-red-500">{error.message}</div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No Activity Found"
              description={
                search
                  ? "No log entries match your search."
                  : "System actions will appear here as they happen."
              }
            />
          ) : (
            <>
              <table
                className={`w-full text-sm transition-opacity ${
                  isPlaceholderData ? "opacity-60" : ""
                }`}
              >
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {["Date / Time", "User", "Module", "Action", "Details"].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3.5 text-slate-500 whitespace-nowrap">
                        {log.createdAt}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-800">
                        {log.userName || "—"}
                      </td>
                      <td className="px-6 py-3.5 text-slate-600">{log.module}</td>
                      <td className="px-6 py-3.5 text-slate-600">{log.action}</td>
                      <td className="px-6 py-3.5 text-slate-500">{log.details || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                totalPages={data.totalPages}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
