import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Building2, Archive } from "lucide-react";

import { apiRequest } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

/* ── Status badge variant mapping ── */
const STATUS_VARIANT = {
  active:   "success",
  inactive: "warning",
  closed:   "danger",
};

const STATUS_LABEL = {
  active:   "Active",
  inactive: "Inactive",
  closed:   "Closed",
};

/* ── Blank form state ── */
const emptyForm = {
  name:         "",
  barangayId:   "",
  ownerId:      "",
  businessType: "",
  address:      "",
  status:       "active",
  notes:        "",
};

export default function EstablishmentsPage() {
  const qc = useQueryClient();

  const [search,      setSearch]      = useState("");
  const [showModal,   setShowModal]   = useState(false);
  const [editTarget,  setEditTarget]  = useState(null); // null = add mode
  const [form,        setForm]        = useState(emptyForm);

  /* ── Data queries ── */
  const { data: establishments = [], isLoading } = useQuery({
    queryKey: ["establishments"],
    queryFn:  () => apiRequest("/establishments"),
  });

  const { data: barangays = [] } = useQuery({
    queryKey: ["barangays"],
    queryFn:  () => apiRequest("/barangays"),
  });

  const { data: owners = [] } = useQuery({
    queryKey: ["owners"],
    queryFn:  () => apiRequest("/owners"),
  });

  /* ── Client-side search filter ── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return establishments;
    return establishments.filter(
      (e) =>
        e.name.toLowerCase().includes(q)         ||
        e.barangayName.toLowerCase().includes(q) ||
        e.ownerName.toLowerCase().includes(q)    ||
        e.businessType.toLowerCase().includes(q)
    );
  }, [establishments, search]);

  /* ── Mutations ── */
  const saveMutation = useMutation({
    mutationFn: (body) =>
      editTarget
        ? apiRequest(`/establishments/${editTarget.id}`, {
            method: "PUT",
            body:   JSON.stringify(body),
          })
        : apiRequest("/establishments", {
            method: "POST",
            body:   JSON.stringify(body),
          }),
    onSuccess: () => {
      toast.success(editTarget ? "Establishment updated." : "Establishment added.");
      qc.invalidateQueries({ queryKey: ["establishments"] });
      closeModal();
    },
    onError: (err) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id) =>
      apiRequest(`/establishments/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => {
      toast.success("Establishment archived.");
      qc.invalidateQueries({ queryKey: ["establishments"] });
    },
    onError: (err) => toast.error(err.message),
  });

  /* ── Modal helpers ── */
  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(est) {
    setEditTarget(est);
    setForm({
      name:         est.name,
      barangayId:   String(est.barangayId),
      ownerId:      String(est.ownerId),
      businessType: est.businessType,
      address:      est.address,
      status:       est.status,
      notes:        est.notes || "",
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setForm(emptyForm);
  }

  /* Generic field updater */
  const onChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  /* Form is valid when all required fields are filled */
  const isFormValid =
    form.name.trim()         &&
    form.barangayId          &&
    form.ownerId             &&
    form.businessType.trim() &&
    form.address.trim();

  /* ── Render ── */
  return (
    <div className="space-y-6">

      {/* Header */}
      <PageHeader
        title="Establishments"
        subtitle="Manage registered business establishments in Santa Catalina"
      >
        <Button onClick={openAdd}>
          <Plus size={16} className="mr-2" />
          Add Establishment
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <Input
          className="pl-9"
          placeholder="Search name, barangay, owner, type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table card */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No Establishments Found"
              description={
                search
                  ? "No establishments match your search."
                  : "Click 'Add Establishment' to register one."
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {[
                    "Establishment",
                    "Barangay",
                    "Owner",
                    "Business Type",
                    "Status",
                    "",
                  ].map((h) => (
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
                {filtered.map((est) => (
                  <tr
                    key={est.id}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-3.5 font-medium text-slate-800">
                      {est.name}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      {est.barangayName}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      {est.ownerName}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      {est.businessType}
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={STATUS_VARIANT[est.status] || "default"}>
                        {STATUS_LABEL[est.status] || est.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(est)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          onClick={() => {
                            if (confirm(`Archive "${est.name}"?`)) {
                              archiveMutation.mutate(est.id);
                            }
                          }}
                        >
                          <Archive size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editTarget ? "Edit Establishment" : "Add Establishment"}
        className="max-w-xl"
      >
        <div className="grid grid-cols-2 gap-4">

          {/* Name */}
          <div className="col-span-2">
            <Label>Establishment Name *</Label>
            <Input
              value={form.name}
              onChange={onChange("name")}
              placeholder="e.g. Juan's Sari-Sari Store"
            />
          </div>

          {/* Barangay */}
          <div>
            <Label>Barangay *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={form.barangayId}
              onChange={onChange("barangayId")}
            >
              <option value="">Select barangay...</option>
              {barangays.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Owner */}
          <div>
            <Label>Owner *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={form.ownerId}
              onChange={onChange("ownerId")}
            >
              <option value="">Select owner...</option>
              {owners.map((o) => (
                <option key={o.id} value={String(o.id)}>
                  {o.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Business Type */}
          <div>
            <Label>Business Type *</Label>
            <Input
              value={form.businessType}
              onChange={onChange("businessType")}
              placeholder="e.g. Retail, Food, Services"
            />
          </div>

          {/* Status */}
          <div>
            <Label>Status *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={form.status}
              onChange={onChange("status")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Address */}
          <div className="col-span-2">
            <Label>Address *</Label>
            <Input
              value={form.address}
              onChange={onChange("address")}
              placeholder="Complete business address"
            />
          </div>

          {/* Notes */}
          <div className="col-span-2">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={onChange("notes")}
              placeholder="Optional notes"
            />
          </div>

          {/* Actions */}
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              disabled={!isFormValid || saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate({
                  ...form,
                  barangayId: Number(form.barangayId),
                  ownerId:    Number(form.ownerId),
                })
              }
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>

        </div>
      </Modal>

    </div>
  );
}