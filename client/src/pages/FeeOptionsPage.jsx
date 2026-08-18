import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Tags } from "lucide-react";

import { apiRequest } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

const CATEGORIES = [
  { key: "business_tax", label: "Business Tax", badge: "info" },
  { key: "mayors_permit", label: "Mayor's Permit", badge: "purple" },
  { key: "regulatory", label: "Regulatory Fees", badge: "warning" },
];

export default function FeeOptionsPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState({ business_tax: "", mayors_permit: "", regulatory: "" });

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["fee-options", "all"],
    queryFn: () => apiRequest("/fee-options?all=true"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fee-options"] });
  };

  const addMutation = useMutation({
    mutationFn: (body) => apiRequest("/fee-options", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_d, vars) => {
      toast.success("Option added.");
      setDrafts((s) => ({ ...s, [vars.category]: "" }));
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiRequest(`/fee-options/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Option removed.");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function add(category) {
    const label = drafts[category].trim();
    if (!label) return;
    addMutation.mutate({ category, label });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Options"
        subtitle="Manage the item choices that appear when recording a payment"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const items = options.filter((o) => o.category === cat.key);
          return (
            <Card key={cat.key}>
              <CardContent className="p-4">
                <div className="mb-3">
                  <Badge variant={cat.badge}>{cat.label}</Badge>
                </div>

                {isLoading ? (
                  <p className="py-6 text-center text-sm text-slate-400">Loading...</p>
                ) : items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No options yet.</p>
                ) : (
                  <ul className="mb-3 space-y-1">
                    {items.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <span className="text-slate-700">{o.label}</span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600"
                          title="Remove option"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(`Remove "${o.label}"? Past payments keep their record.`)) {
                              deleteMutation.mutate(o.id);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Add item..."
                    value={drafts[cat.key]}
                    onChange={(e) => setDrafts((s) => ({ ...s, [cat.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        add(cat.key);
                      }
                    }}
                    className="h-9"
                  />
                  <Button size="sm" onClick={() => add(cat.key)} disabled={addMutation.isPending}>
                    <Plus size={15} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Tags size={14} /> Removing an option only hides it from future payments — existing
        records are never changed.
      </p>
    </div>
  );
}
