import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Users, Building2, ArrowLeft,
  Phone, MapPin, FileText, Trash2, Wallet,
} from "lucide-react";

import { apiRequest } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

/* ── Status badge variant mapping (establishments) ── */
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

/* ── Blank form states ── */
const emptyOwnerForm = {
  fullName: "", address: "", contactNumber: "", tin: "", notes: "",
};

const emptyEstForm = {
  name: "", barangayId: "", businessType: "", address: "", status: "active", notes: "",
};

export default function BusinessRegistryPage() {
  const qc = useQueryClient();

  /* ── View state: grid of owners, or drill-down detail for one owner ── */
  const [selectedOwnerId, setSelectedOwnerId] = useState(null);
  const [search, setSearch] = useState("");

  /* ── Owner modal state ── */
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [ownerEditTarget, setOwnerEditTarget] = useState(null);
  const [ownerForm, setOwnerForm] = useState(emptyOwnerForm);

  /* ── Establishment modal state ── */
  const [showEstModal, setShowEstModal] = useState(false);
  const [estEditTarget, setEstEditTarget] = useState(null);
  const [estForm, setEstForm] = useState(emptyEstForm);

  /* ── Data queries ── */
  const { data: owners = [], isLoading: ownersLoading } = useQuery({
    queryKey: ["owners", search],
    queryFn:  () => apiRequest(`/owners?search=${encodeURIComponent(search)}`),
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ["establishments"],
    queryFn:  () => apiRequest("/establishments"),
  });

  const { data: barangays = [] } = useQuery({
    queryKey: ["barangays"],
    queryFn:  () => apiRequest("/barangays"),
  });

  /* Owner detail — includes that owner's establishments (backend already joins this) */
  const { data: ownerDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["owners", selectedOwnerId],
    queryFn:  () => apiRequest(`/owners/${selectedOwnerId}`),
    enabled:  !!selectedOwnerId,
  });

  /* Payments for the selected owner — fetched from the owner-scoped endpoint,
     already enriched and ordered. Avoids loading the entire payments table. */
  const { data: ownerPayments = [] } = useQuery({
    queryKey: ["payments", "owner", selectedOwnerId],
    queryFn:  () => apiRequest(`/payments/owner/${selectedOwnerId}`),
    enabled:  !!selectedOwnerId,
  });

  /* Establishment count per owner, for the grid card badges */
  const establishmentCountByOwner = useMemo(() => {
    const counts = {};
    for (const e of establishments) {
      if (e.isArchived) continue;
      counts[e.ownerId] = (counts[e.ownerId] || 0) + 1;
    }
    return counts;
  }, [establishments]);

  /* ── Owner mutations ── */
  const saveOwnerMutation = useMutation({
    mutationFn: (body) =>
      ownerEditTarget
        ? apiRequest(`/owners/${ownerEditTarget.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiRequest("/owners", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(ownerEditTarget ? "Owner updated." : "Owner registered.");
      qc.invalidateQueries({ queryKey: ["owners"] });
      closeOwnerModal();
    },
    onError: (err) => toast.error(err.message),
  });

  /* ── Establishment mutations ── */
  const saveEstMutation = useMutation({
    mutationFn: (body) =>
      estEditTarget
        ? apiRequest(`/establishments/${estEditTarget.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiRequest("/establishments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(estEditTarget ? "Establishment updated." : "Establishment added.");
      qc.invalidateQueries({ queryKey: ["establishments"] });
      qc.invalidateQueries({ queryKey: ["owners", selectedOwnerId] });
      closeEstModal();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteEstMutation = useMutation({
    mutationFn: (id) => apiRequest(`/establishments/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      toast.success(res?.message || "Establishment deleted.");
      qc.invalidateQueries({ queryKey: ["establishments"] });
      qc.invalidateQueries({ queryKey: ["owners", selectedOwnerId] });
      // Payment history for this owner may still reference it — refresh it.
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["tax-records"] });
    },
    onError: (err) => toast.error(err.message),
  });

  /* Permanently delete a single payment straight from the owner's payment
     history. Hard delete (DELETE /payments/:id) — the record is gone from both
     Business Registry and Tax Collection. Refresh payments + tax-records +
     dashboard so every derived balance/status recomputes. */
  const deletePaymentMutation = useMutation({
    mutationFn: (id) => apiRequest(`/payments/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      toast.success(res?.message || "Payment deleted permanently.");
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["tax-records"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleDeletePayment(p) {
    if (
      window.confirm(
        `Permanently delete this payment?\n\nOR ${p.orNumber} — ${formatCurrency(p.amount)} (${p.paymentDate})\nEstablishment: ${p.establishmentName} · ${p.taxYear}\n\nThis removes it everywhere and cannot be undone. It is recorded in the Activity Logs.`
      )
    ) {
      deletePaymentMutation.mutate(p.id);
    }
  }

  /* ── Owner modal helpers ── */
  function openAddOwner() {
    setOwnerEditTarget(null);
    setOwnerForm(emptyOwnerForm);
    setShowOwnerModal(true);
  }

  function openEditOwner(owner) {
    setOwnerEditTarget(owner);
    setOwnerForm({
      fullName:      owner.fullName,
      address:       owner.address,
      contactNumber: owner.contactNumber || "",
      tin:           owner.tin || "",
      notes:         owner.notes || "",
    });
    setShowOwnerModal(true);
  }

  function closeOwnerModal() {
    setShowOwnerModal(false);
    setOwnerEditTarget(null);
    setOwnerForm(emptyOwnerForm);
  }

  const onOwnerChange = (field) => (e) =>
    setOwnerForm((f) => ({ ...f, [field]: e.target.value }));

  const isOwnerFormValid = ownerForm.fullName.trim() && ownerForm.address.trim();

  /* ── Establishment modal helpers ── */
  function openAddEstablishment() {
    setEstEditTarget(null);
    setEstForm(emptyEstForm);
    setShowEstModal(true);
  }

  function openEditEstablishment(est) {
    setEstEditTarget(est);
    setEstForm({
      name:         est.name,
      barangayId:   String(est.barangayId),
      businessType: est.businessType,
      address:      est.address,
      status:       est.status,
      notes:        est.notes || "",
    });
    setShowEstModal(true);
  }

  function closeEstModal() {
    setShowEstModal(false);
    setEstEditTarget(null);
    setEstForm(emptyEstForm);
  }

  const onEstChange = (field) => (e) =>
    setEstForm((f) => ({ ...f, [field]: e.target.value }));

  const isEstFormValid =
    estForm.name.trim() && estForm.barangayId && estForm.businessType.trim() && estForm.address.trim();

  function handleSaveEstablishment() {
    saveEstMutation.mutate({
      ...estForm,
      barangayId: Number(estForm.barangayId),
      ownerId:    selectedOwnerId,
    });
  }

  /* ══════════════════════════════════════════════════════════
     DETAIL VIEW — one owner, their establishments, their payments
     ══════════════════════════════════════════════════════════ */
  if (selectedOwnerId) {
    return (
      <div className="space-y-6">

        <Button variant="outline" size="sm" onClick={() => setSelectedOwnerId(null)}>
          <ArrowLeft size={15} className="mr-2" />
          Back to Business Registry
        </Button>

        {detailLoading || !ownerDetail ? (
          <div className="py-16 text-center text-sm text-slate-500">Loading owner details...</div>
        ) : (
          <>
            {/* Owner header card */}
            <Card>
              <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">{ownerDetail.fullName}</h1>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} /> {ownerDetail.address}
                    </span>
                    {ownerDetail.contactNumber && (
                      <span className="flex items-center gap-1.5">
                        <Phone size={14} /> {ownerDetail.contactNumber}
                      </span>
                    )}
                    {ownerDetail.tin && (
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        <FileText size={14} /> TIN: {ownerDetail.tin}
                      </span>
                    )}
                  </div>
                  {ownerDetail.notes && (
                    <p className="mt-2 text-sm text-slate-400 italic">{ownerDetail.notes}</p>
                  )}
                </div>
                <Button variant="outline" onClick={() => openEditOwner(ownerDetail)}>
                  Edit Owner
                </Button>
              </CardContent>
            </Card>

            {/* Establishments section */}
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                <Building2 size={18} /> Establishments
              </h2>
              <Button size="sm" onClick={openAddEstablishment}>
                <Plus size={15} className="mr-2" /> Add Establishment
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {ownerDetail.establishments.length === 0 ? (
                  <EmptyState
                    icon={Building2}
                    title="No Establishments"
                    description="Add an establishment to this owner to get started."
                  />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {["Name", "Business Type", "Address", "Status", ""].map((h) => (
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
                      {ownerDetail.establishments.map((est) => (
                        <tr
                          key={est.id}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-3.5 font-medium text-slate-800">
                            <span className="flex items-center gap-2">
                              {est.name}
                              {est.isArchived && (
                                <Badge variant="default">Archived</Badge>
                              )}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-slate-500">{est.businessType}</td>
                          <td className="px-6 py-3.5 text-slate-500">{est.address}</td>
                          <td className="px-6 py-3.5">
                            <Badge variant={STATUS_VARIANT[est.status] || "default"}>
                              {STATUS_LABEL[est.status] || est.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openEditEstablishment(est)}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600"
                                disabled={deleteEstMutation.isPending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Permanently delete "${est.name}"?\n\nThis also deletes ALL of its tax records and payments and cannot be undone. It is recorded in the Activity Logs.`
                                    )
                                  ) {
                                    deleteEstMutation.mutate(est.id);
                                  }
                                }}
                                title="Permanently delete this establishment and all its records"
                              >
                                <Trash2 size={15} />
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

            {/* Payment history section */}
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Wallet size={18} /> Payment History
            </h2>

            <Card>
              <CardContent className="p-0">
                {ownerPayments.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="No Payments Yet"
                    description="Payments recorded against this owner's establishments will appear here."
                  />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {["Date", "OR Number", "Establishment", "Year", "Total", "Recorded By"].map((h) => (
                          <th
                            key={h}
                            className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                        <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownerPayments.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-3.5 text-slate-600">{p.paymentDate}</td>
                          <td className="px-6 py-3.5 font-medium text-slate-800">OR {p.orNumber}</td>
                          <td className="px-6 py-3.5 text-slate-700">{p.establishmentName}</td>
                          <td className="px-6 py-3.5 text-slate-500">{p.taxYear}</td>
                          <td className="px-6 py-3.5 font-semibold text-green-700">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="px-6 py-3.5 text-slate-500">{p.recordedByName}</td>
                          <td className="px-6 py-3.5">
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600"
                                disabled={deletePaymentMutation.isPending}
                                onClick={() => handleDeletePayment(p)}
                                title="Permanently delete this payment"
                              >
                                <Trash2 size={15} />
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
          </>
        )}

        {/* Owner edit modal (also reachable from detail view) */}
        <OwnerModal
          open={showOwnerModal}
          editTarget={ownerEditTarget}
          form={ownerForm}
          onChange={onOwnerChange}
          onClose={closeOwnerModal}
          onSave={() => saveOwnerMutation.mutate(ownerForm)}
          isValid={isOwnerFormValid}
          isPending={saveOwnerMutation.isPending}
        />

        {/* Establishment add/edit modal */}
        <EstablishmentModal
          open={showEstModal}
          editTarget={estEditTarget}
          form={estForm}
          barangays={barangays}
          onChange={onEstChange}
          onClose={closeEstModal}
          onSave={handleSaveEstablishment}
          isValid={isEstFormValid}
          isPending={saveEstMutation.isPending}
        />

      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     GRID VIEW — all owners as clickable cards
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">

      <PageHeader
        title="Business Registry"
        subtitle="Manage taxpayers and their registered establishments"
      >
        <Button onClick={openAddOwner}>
          <Plus size={16} className="mr-2" />
          Add Owner
        </Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search by name or TIN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {ownersLoading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
      ) : owners.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title="No Owners Found"
              description={
                search ? "No owners match your search." : "Click 'Add Owner' to register the first taxpayer."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {owners.map((owner) => (
            <Card
              key={owner.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/40"
              onClick={() => setSelectedOwnerId(owner.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">{owner.fullName}</h3>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">{owner.address}</p>
                  </div>
                  <Badge variant="info">
                    {establishmentCountByOwner[owner.id] || 0} Est.
                  </Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-slate-500">
                  {owner.contactNumber && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={12} /> {owner.contactNumber}
                    </p>
                  )}
                  {owner.tin && (
                    <p className="flex items-center gap-1.5 font-mono">
                      <FileText size={12} /> {owner.tin}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Owner add/edit modal (grid-view add path) */}
      <OwnerModal
        open={showOwnerModal}
        editTarget={ownerEditTarget}
        form={ownerForm}
        onChange={onOwnerChange}
        onClose={closeOwnerModal}
        onSave={() => saveOwnerMutation.mutate(ownerForm)}
        isValid={isOwnerFormValid}
        isPending={saveOwnerMutation.isPending}
      />

    </div>
  );
}

/* ── Owner Modal (shared by grid view "Add Owner" and detail view "Edit Owner") ── */
function OwnerModal({ open, editTarget, form, onChange, onClose, onSave, isValid, isPending }) {
  return (
    <Modal open={open} onClose={onClose} title={editTarget ? "Edit Owner" : "Register Owner"} className="max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Full Name *</Label>
          <Input value={form.fullName} onChange={onChange("fullName")} placeholder="e.g. Juan dela Cruz" />
        </div>
        <div className="col-span-2">
          <Label>Address *</Label>
          <Input value={form.address} onChange={onChange("address")} placeholder="Complete address" />
        </div>
        <div>
          <Label>Contact Number</Label>
          <Input value={form.contactNumber} onChange={onChange("contactNumber")} placeholder="09xxxxxxxxx" />
        </div>
        <div>
          <Label>TIN</Label>
          <Input value={form.tin} onChange={onChange("tin")} placeholder="Tax Identification Number" />
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <Input value={form.notes} onChange={onChange("notes")} placeholder="Optional notes" />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={!isValid || isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Establishment Modal (used only from within an owner's detail view — ownerId is implicit) ── */
function EstablishmentModal({ open, editTarget, form, barangays, onChange, onClose, onSave, isValid, isPending }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editTarget ? "Edit Establishment" : "Add Establishment"}
      className="max-w-xl"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Establishment Name *</Label>
          <Input value={form.name} onChange={onChange("name")} placeholder="e.g. Juan's Sari-Sari Store" />
        </div>
        <div>
          <Label>Barangay *</Label>
          <select
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            value={form.barangayId}
            onChange={onChange("barangayId")}
          >
            <option value="">Select barangay...</option>
            {barangays.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Business Type *</Label>
          <Input value={form.businessType} onChange={onChange("businessType")} placeholder="e.g. Retail, Food" />
        </div>
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
        <div className="col-span-2">
          <Label>Address *</Label>
          <Input value={form.address} onChange={onChange("address")} placeholder="Complete business address" />
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <Input value={form.notes} onChange={onChange("notes")} placeholder="Optional notes" />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={!isValid || isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}