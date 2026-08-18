import { useState, useMemo, useEffect, useRef } from "react";
import {
  useQuery, useMutation, useQueryClient, keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, Receipt, ArrowLeft, Wallet,
  MapPin, Building2, User, Pencil, Trash2, ChevronDown,
} from "lucide-react";

import { apiRequest } from "@/services/api";
import { formatCurrency, cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

const PAGE_SIZE = 25;

/* ── Status badge variant mapping ──
   Backend computePaymentStatus returns one of:
   "Fully Paid" | "Partially Paid" | "Not Paid" */
const STATUS_VARIANT = {
  "Fully Paid":     "success",
  "Partially Paid": "warning",
  "Not Paid":       "danger",
};

const SCHEDULE_LABEL = {
  full:        "Full Payment",
  quarterly:   "Quarterly",
  semi_annual: "Semi-Annual",
};

/* ── Blank form states ── */
const emptyTaxForm = {
  establishmentId: "",
  taxYear:         new Date().getFullYear(),
  taxDue:          "",
  paymentSchedule: "full",
};

/* The three charge categories. Each holds a configurable list of items
   (fee_options); a payment is made up of individual items across these. */
const CATEGORIES = [
  { key: "business_tax",  label: "Business Tax",   badge: "info" },
  { key: "mayors_permit", label: "Mayor's Permit", badge: "purple" },
  { key: "regulatory",    label: "Regulatory Fees", badge: "warning" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
const CATEGORY_BADGE = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.badge]));

/* A reserved, standalone charge (not part of any fee-options catalog). It is
   stored as a regulatory line item so it flows through the payload, receipt
   total and payment history like any other charge, but in the modal it is
   rendered as a single checkbox + amount box instead of inside a dropdown. */
const PENALTY_LABEL = "Penalty";

/* A payment's total is stored on p.amount (server keeps it = sum of items). */
const paymentTotal = (p) => Number(p.amount || 0);

/* Distinct categories present in a payment's items → badges. */
function paymentTypeBadges(p) {
  const cats = new Set((p.items || []).map((it) => it.category));
  return CATEGORIES.filter((c) => cats.has(c.key)).map((c) => ({
    label: c.label,
    variant: c.badge,
  }));
}

const emptyPaymentForm = {
  paymentDate: new Date().toISOString().slice(0, 10),
  orNumber:    "",
  remarks:     "",
};

/* Selected items, grouped by category: { business_tax: { "Business Tax": "500" }, ... }.
   Only selected labels are present; the value is the amount as a string. */
const emptyItemState = { business_tax: {}, mayors_permit: {}, regulatory: {} };

/* A dropdown of checkbox options for one category, each with an amount field,
   plus a box to add a custom item not in the list. `options` is the catalog
   labels; `selected` is { label: amountString } for this category. */
function FeeCategoryPicker({ title, badge, options, selected, onToggle, onAmount, onAddCustom }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  // Show catalog options plus any selected custom labels not in the catalog.
  // Penalty has its own dedicated checkbox, so keep it out of this dropdown.
  const catalog = options.map((o) => o.label).filter((l) => l !== PENALTY_LABEL);
  const extras = Object.keys(selected).filter(
    (l) => !catalog.includes(l) && l !== PENALTY_LABEL
  );
  const allLabels = [...catalog, ...extras];

  // Penalty is rendered as a separate standalone box, so exclude it from this
  // picker's own count/subtotal summary.
  const summaryKeys = Object.keys(selected).filter((l) => l !== PENALTY_LABEL);
  const chosen = summaryKeys
    .map((l) => [l, selected[l]])
    .filter(([, a]) => Number(a) > 0);
  const subtotal = chosen.reduce((s, [, a]) => s + Number(a || 0), 0);

  function addCustom() {
    const label = custom.trim();
    if (!label) return;
    onAddCustom(label);
    setCustom("");
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <Badge variant={badge}>{title}</Badge>
          <span className="text-slate-500">
            {summaryKeys.length > 0
              ? `${summaryKeys.length} selected · ${formatCurrency(subtotal)}`
              : "None selected"}
          </span>
        </span>
        <ChevronDown size={16} className={cn("text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-border bg-slate-50/60 p-3">
          {allLabels.map((label) => {
            const isChecked = label in selected;
            return (
              <div key={label} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={isChecked}
                  onChange={(e) => onToggle(label, e.target.checked)}
                  id={`${title}-${label}`}
                />
                <label htmlFor={`${title}-${label}`} className="flex-1 text-sm text-slate-700">
                  {label}
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  disabled={!isChecked}
                  value={isChecked ? selected[label] : ""}
                  onChange={(e) => onAmount(label, e.target.value)}
                  className="h-8 w-28"
                />
              </div>
            );
          })}

          <div className="flex items-center gap-2 border-t border-border pt-2">
            <Input
              placeholder="Add other item..."
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              className="h-8 flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addCustom}>
              <Plus size={14} className="mr-1" /> Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Establishment selector with a fixed-height, scrollable list and a search box.
   Replaces a native <select> so that a long list of establishments scrolls
   inside a capped panel (max-h-60) instead of growing tall enough to cover the
   modal's Save button. Closes on outside click or after a choice is made. */
function EstablishmentPicker({ establishments, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  const selected = establishments.find((e) => String(e.id) === String(value));
  const label = selected
    ? `${selected.name} — ${selected.ownerName}`
    : "Select establishment...";

  const q = query.trim().toLowerCase();
  const filtered = q
    ? establishments.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.ownerName || "").toLowerCase().includes(q)
      )
    : establishments;

  // Close the panel when clicking anywhere outside this control.
  useEffect(() => {
    if (!open) return;
    function onDocClick(ev) {
      if (ref.current && !ref.current.contains(ev.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          !selected && "text-slate-400"
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={16}
          className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <Input
              autoFocus
              placeholder="Search establishment or owner..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8"
            />
          </div>
          {/* Fixed max height + scroll — the whole point: the list never
              overruns the modal or hides the Save button. */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No matches.</p>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onChange(String(e.id));
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50",
                    String(e.id) === String(value) &&
                      "bg-primary/10 font-medium text-primary"
                  )}
                >
                  {e.name} — {e.ownerName}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaxCollectionPage() {
  const qc = useQueryClient();

  /* ── View state: list of tax records, or drill-down for one ── */
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [search,      setSearch]      = useState("");
  const [yearFilter,  setYearFilter]  = useState("");
  const [page,        setPage]        = useState(1);
  const debouncedSearch = useDebounce(search);

  /* ── Tax Record modal state ── */
  const [showTaxModal,  setShowTaxModal]  = useState(false);
  const [taxEditTarget, setTaxEditTarget] = useState(null); // null = add mode
  const [taxForm,       setTaxForm]       = useState(emptyTaxForm);

  /* ── Payment modal state ── */
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm,      setPaymentForm]      = useState(emptyPaymentForm);
  const [paymentEditTarget, setPaymentEditTarget] = useState(null); // null = add mode
  const [itemState,        setItemState]        = useState(emptyItemState);

  /* A new search or year filter resets to the first page. */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, yearFilter]);

  /* ── Data queries ── */
  /* Server-side search + year filter + pagination. Response is the standard
     envelope: { data, total, page, pageSize, totalPages }. */
  const { data: taxData, isLoading, isPlaceholderData } = useQuery({
    queryKey: ["tax-records", yearFilter, debouncedSearch, page],
    queryFn:  () => {
      const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
      if (yearFilter) params.set("year", yearFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      return apiRequest(`/tax-records?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const taxRecords = taxData?.data ?? [];

  const { data: establishments = [] } = useQuery({
    queryKey: ["establishments"],
    queryFn:  () => apiRequest("/establishments"),
  });

  /* Configurable fee options for the payment pickers, grouped by category. */
  const { data: feeOptions = [] } = useQuery({
    queryKey: ["fee-options"],
    queryFn:  () => apiRequest("/fee-options"),
  });
  const optionsByCategory = useMemo(() => {
    const grouped = { business_tax: [], mayors_permit: [], regulatory: [] };
    for (const o of feeOptions) {
      if (grouped[o.category]) grouped[o.category].push(o);
    }
    return grouped;
  }, [feeOptions]);

  /* The currently selected tax record — sourced live from the current page of
     the tax-records query so totalPaid/balance/status stay fresh after a
     payment is recorded (the record was drilled into from this same page). */
  const selectedRecord = useMemo(
    () => taxRecords.find((r) => r.id === selectedRecordId) || null,
    [taxRecords, selectedRecordId]
  );

  /* Payments for the selected record — fetched from the scoped endpoint, which
     now includes recordedByName. Avoids loading the entire payments table. */
  const { data: recordPayments = [] } = useQuery({
    queryKey: ["payments", "tax-record", selectedRecordId],
    queryFn:  () => apiRequest(`/payments/tax-record/${selectedRecordId}`),
    enabled:  selectedRecordId != null,
  });

  /* ── Tax Record mutations ── */
  const saveTaxMutation = useMutation({
    mutationFn: (body) =>
      taxEditTarget
        ? apiRequest(`/tax-records/${taxEditTarget.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiRequest("/tax-records", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(taxEditTarget ? "Tax record updated." : "Tax record created.");
      qc.invalidateQueries({ queryKey: ["tax-records"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      closeTaxModal();
    },
    onError: (err) => toast.error(err.message),
  });

  /* Permanently delete an entire tax-record year row, along with every payment
     recorded against it. Hard delete (DELETE /tax-records/:id) — after it
     succeeds, drop back to the list view and refresh the derived lists. */
  const deleteTaxMutation = useMutation({
    mutationFn: (id) => apiRequest(`/tax-records/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      toast.success(res?.message || "Tax record deleted permanently.");
      setSelectedRecordId(null);
      qc.invalidateQueries({ queryKey: ["tax-records"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleDeleteTaxRecord(record) {
    if (
      window.confirm(
        `Permanently delete this tax record?\n\n${record.taxYear} — ${record.establishmentName} (${record.ownerName || "—"})\nTotal Paid so far: ${formatCurrency(record.totalPaid)}\n\nThis also deletes ALL payments recorded against it and cannot be undone. It is recorded in the Activity Logs.`
      )
    ) {
      deleteTaxMutation.mutate(record.id);
    }
  }

  /* ── Payment mutations ── */
  /* After any change, invalidate payments + tax-records + dashboard so the
     header's Total Paid / Balance / status recompute (they're derived from the
     payment list on the server, so a refetch is all it takes). */
  const invalidatePayments = () => {
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["tax-records"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["fee-options"] });
  };

  const recordPaymentMutation = useMutation({
    mutationFn: (body) =>
      apiRequest("/payments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Payment recorded.");
      invalidatePayments();
      closePaymentModal();
    },
    onError: (err) => toast.error(err.message),
  });

  const editPaymentMutation = useMutation({
    mutationFn: ({ id, body }) =>
      apiRequest(`/payments/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Payment updated.");
      invalidatePayments();
      closePaymentModal();
    },
    onError: (err) => toast.error(err.message),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id) => apiRequest(`/payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Payment deleted. Balance recalculated.");
      invalidatePayments();
    },
    onError: (err) => toast.error(err.message),
  });

  /* ── Tax Record modal helpers ── */
  function openAddTax() {
    setTaxEditTarget(null);
    setTaxForm(emptyTaxForm);
    setShowTaxModal(true);
  }

  function openEditTax(record) {
    setTaxEditTarget(record);
    setTaxForm({
      establishmentId: String(record.establishmentId),
      taxYear:         record.taxYear,
      taxDue:          String(record.taxDue),
      paymentSchedule: record.paymentSchedule,
    });
    setShowTaxModal(true);
  }

  function closeTaxModal() {
    setShowTaxModal(false);
    setTaxEditTarget(null);
    setTaxForm(emptyTaxForm);
  }

  const onTaxChange = (field) => (e) =>
    setTaxForm((f) => ({ ...f, [field]: e.target.value }));

  const isTaxFormValid = taxEditTarget
    ? String(taxForm.taxDue).trim() !== "" && taxForm.paymentSchedule
    : taxForm.establishmentId && taxForm.taxYear && String(taxForm.taxDue).trim() !== "";

  function handleSaveTax() {
    if (taxEditTarget) {
      // Only taxDue and paymentSchedule are editable — establishment/year are
      // locked after creation, preserving historical integrity.
      saveTaxMutation.mutate({
        taxDue:          Number(taxForm.taxDue),
        paymentSchedule: taxForm.paymentSchedule,
      });
    } else {
      saveTaxMutation.mutate({
        establishmentId: Number(taxForm.establishmentId),
        taxYear:         Number(taxForm.taxYear),
        taxDue:          Number(taxForm.taxDue),
        paymentSchedule: taxForm.paymentSchedule,
      });
    }
  }

  /* ── Payment modal helpers ── */
  function openRecordPayment() {
    setPaymentEditTarget(null);
    setPaymentForm(emptyPaymentForm);
    setItemState(emptyItemState);
    setShowPaymentModal(true);
  }

  function openEditPayment(p) {
    setPaymentEditTarget(p);
    setPaymentForm({
      paymentDate: p.paymentDate,
      orNumber:    p.orNumber,
      remarks:     p.remarks || "",
    });
    const next = { business_tax: {}, mayors_permit: {}, regulatory: {} };
    for (const it of p.items || []) {
      if (next[it.category]) next[it.category][it.label] = String(it.amount);
    }
    setItemState(next);
    setShowPaymentModal(true);
  }

  function closePaymentModal() {
    setShowPaymentModal(false);
    setPaymentEditTarget(null);
    setPaymentForm(emptyPaymentForm);
    setItemState(emptyItemState);
  }

  const onPaymentChange = (field) => (e) =>
    setPaymentForm((f) => ({ ...f, [field]: e.target.value }));

  /* Item picker handlers. */
  function toggleItem(category, label, checked) {
    setItemState((s) => {
      const cat = { ...s[category] };
      if (checked) cat[label] = cat[label] ?? "";
      else delete cat[label];
      return { ...s, [category]: cat };
    });
  }
  function setItemAmount(category, label, amount) {
    setItemState((s) => ({ ...s, [category]: { ...s[category], [label]: amount } }));
  }
  function addCustomItem(category, label) {
    toggleItem(category, label, true);
  }

  /* Build the items[] payload and running total from itemState. */
  const paymentItemsPayload = CATEGORIES.flatMap((c) =>
    Object.entries(itemState[c.key])
      .map(([label, amt]) => ({ category: c.key, label, amount: Number(amt) }))
      .filter((it) => it.amount > 0)
  );
  const paymentFormTotal = paymentItemsPayload.reduce((s, it) => s + it.amount, 0);

  const isPaymentFormValid =
    paymentForm.paymentDate &&
    paymentForm.orNumber.trim() &&
    paymentItemsPayload.length > 0;

  function handleSavePayment() {
    if (paymentEditTarget) {
      editPaymentMutation.mutate({
        id: paymentEditTarget.id,
        body: {
          paymentDate: paymentForm.paymentDate,
          orNumber:    paymentForm.orNumber,
          remarks:     paymentForm.remarks,
          items:       paymentItemsPayload,
        },
      });
    } else {
      recordPaymentMutation.mutate({
        paymentDate: paymentForm.paymentDate,
        orNumber:    paymentForm.orNumber,
        remarks:     paymentForm.remarks,
        taxRecordId: selectedRecordId,
        items:       paymentItemsPayload,
      });
    }
  }

  function handleDeletePayment(p) {
    if (
      window.confirm(
        `Delete this payment?\n\nOR ${p.orNumber} — ${formatCurrency(p.amount)} (${p.paymentDate})\n\nThe balance will be recalculated. This is recorded in the Activity Logs.`
      )
    ) {
      deletePaymentMutation.mutate(p.id);
    }
  }

  /* ══════════════════════════════════════════════════════════
     DETAIL VIEW — one tax record + its payment history
     ══════════════════════════════════════════════════════════ */
  if (selectedRecordId) {
    return (
      <div className="space-y-6">

        <Button variant="outline" size="sm" onClick={() => setSelectedRecordId(null)}>
          <ArrowLeft size={15} className="mr-2" />
          Back to Tax Collection
        </Button>

        {!selectedRecord ? (
          <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
        ) : (
          <>
            {/* Tax record header card */}
            <Card>
              <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-800">
                      {selectedRecord.taxYear} Tax Assessment
                    </h1>
                    <Badge variant={STATUS_VARIANT[selectedRecord.status] || "default"}>
                      {selectedRecord.status}
                    </Badge>
                  </div>

                  {/* Payor — shown prominently so staff can immediately see who this assessment is for */}
                  <p className="mt-1 flex items-center gap-1.5 text-base font-semibold text-primary">
                    <User size={16} /> Payor: {selectedRecord.ownerName || "—"}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Building2 size={14} /> {selectedRecord.establishmentName || "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} /> {selectedRecord.barangayName || "—"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-6">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Total Due</p>
                      <p className="text-lg font-semibold text-slate-800">
                        {formatCurrency(selectedRecord.taxDue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Total Paid</p>
                      <p className="text-lg font-semibold text-green-700">
                        {formatCurrency(selectedRecord.totalPaid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Balance</p>
                      <p
                        className={cn(
                          "text-lg font-semibold",
                          selectedRecord.balance > 0 ? "text-red-600" : "text-slate-400"
                        )}
                      >
                        {formatCurrency(selectedRecord.balance)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Payment Schedule: {SCHEDULE_LABEL[selectedRecord.paymentSchedule]}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" onClick={() => openEditTax(selectedRecord)}>
                    Edit Tax Record
                  </Button>
                  {/* Always available: even with Business Tax fully paid, staff
                      may still record Mayor's Permit or regulatory fees. */}
                  <Button onClick={openRecordPayment}>
                    <Plus size={16} className="mr-2" /> Record Payment
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600"
                    disabled={deleteTaxMutation.isPending}
                    onClick={() => handleDeleteTaxRecord(selectedRecord)}
                    title="Permanently delete this tax record and all its payments"
                  >
                    <Trash2 size={16} className="mr-2" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Payment history section */}
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Wallet size={18} /> Payment History
            </h2>

            <Card>
              <CardContent className="overflow-x-auto p-0">
                {recordPayments.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="No Payments Yet"
                    description="Click 'Record Payment' above to log the first payment for this tax record."
                  />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        {["Date", "OR Number", "Type", "Items", "Total"].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                          >
                            {h}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordPayments.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-50 hover:bg-slate-50 transition-colors align-top"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{p.paymentDate}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">OR {p.orNumber}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {paymentTypeBadges(p).map((b) => (
                                <Badge key={b.label} variant={b.variant}>{b.label}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              {(p.items || []).map((it, i) => (
                                <span key={i} className="text-slate-600">
                                  {it.label}
                                  <span className="ml-1 font-medium text-slate-800">
                                    {formatCurrency(it.amount)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-green-700">
                            {formatCurrency(paymentTotal(p))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditPayment(p)}
                              >
                                <Pencil size={14} className="mr-1" /> Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600"
                                disabled={deletePaymentMutation.isPending}
                                onClick={() => handleDeletePayment(p)}
                              >
                                <Trash2 size={14} />
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

        {/* Edit Tax Record modal (reachable from detail view) */}
        <Modal
          open={showTaxModal}
          onClose={closeTaxModal}
          title="Edit Tax Record"
          className="max-w-lg"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Establishment</Label>
              <div className="flex h-10 w-full items-center rounded-md border border-border bg-slate-50 px-3 text-sm text-slate-500">
                {selectedRecord?.establishmentName}
              </div>
            </div>
            <div>
              <Label>Tax Year</Label>
              <div className="flex h-10 w-full items-center rounded-md border border-border bg-slate-50 px-3 text-sm text-slate-500">
                {taxForm.taxYear}
              </div>
            </div>
            <div>
              <Label>Total Amount Due (₱) *</Label>
              <Input type="number" value={taxForm.taxDue} onChange={onTaxChange("taxDue")} />
            </div>
            <div className="col-span-2">
              <Label>Payment Schedule *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={taxForm.paymentSchedule}
                onChange={onTaxChange("paymentSchedule")}
              >
                <option value="full">Full Payment</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi_annual">Semi-Annual</option>
              </select>
            </div>
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeTaxModal}>Cancel</Button>
              <Button disabled={!isTaxFormValid || saveTaxMutation.isPending} onClick={handleSaveTax}>
                {saveTaxMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Record Payment modal — taxRecordId is implicit, no selector shown */}
        <Modal
          open={showPaymentModal}
          onClose={closePaymentModal}
          title={
            paymentEditTarget
              ? `Edit Payment — OR ${paymentEditTarget.orNumber}`
              : `Record Payment — ${selectedRecord?.taxYear} / ${selectedRecord?.establishmentName}`
          }
          className="max-w-lg"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Date *</Label>
              <Input type="date" value={paymentForm.paymentDate} onChange={onPaymentChange("paymentDate")} />
            </div>
            <div>
              <Label>OR Number *</Label>
              <Input value={paymentForm.orNumber} onChange={onPaymentChange("orNumber")} placeholder="e.g. 0012345" />
            </div>
            <div className="col-span-2 mt-1 border-t border-border pt-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Charges — tick what&apos;s being paid in this receipt and enter each amount
              </p>
              <div className="space-y-3">
                {CATEGORIES.map((c) => (
                  <FeeCategoryPicker
                    key={c.key}
                    title={c.label}
                    badge={c.badge}
                    options={optionsByCategory[c.key] || []}
                    selected={itemState[c.key]}
                    onToggle={(label, checked) => toggleItem(c.key, label, checked)}
                    onAmount={(label, amount) => setItemAmount(c.key, label, amount)}
                    onAddCustom={(label) => addCustomItem(c.key, label)}
                  />
                ))}

                {/* Standalone Penalty charge — a single checkbox + amount box
                    (no dropdown). Stored as a regulatory line item. */}
                {(() => {
                  const isChecked = PENALTY_LABEL in itemState.regulatory;
                  return (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={isChecked}
                        onChange={(e) =>
                          toggleItem("regulatory", PENALTY_LABEL, e.target.checked)
                        }
                        id="charge-penalty"
                      />
                      <label htmlFor="charge-penalty" className="flex flex-1 items-center gap-2">
                        <Badge variant="warning">Penalty</Badge>
                      </label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="0.00"
                        disabled={!isChecked}
                        value={isChecked ? itemState.regulatory[PENALTY_LABEL] : ""}
                        onChange={(e) =>
                          setItemAmount("regulatory", PENALTY_LABEL, e.target.value)
                        }
                        className="h-8 w-28"
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="col-span-2">
              <Label>Remarks</Label>
              <Input value={paymentForm.remarks} onChange={onPaymentChange("remarks")} placeholder="Optional" />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">Total this receipt</span>
              <span className="font-semibold text-slate-800">{formatCurrency(paymentFormTotal)}</span>
            </div>
            {selectedRecord && !paymentEditTarget && (
              <p className="col-span-2 text-xs text-slate-400">
                Balance before this payment: {formatCurrency(selectedRecord.balance)}
              </p>
            )}
            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closePaymentModal}>Cancel</Button>
              <Button
                disabled={
                  !isPaymentFormValid ||
                  recordPaymentMutation.isPending ||
                  editPaymentMutation.isPending
                }
                onClick={handleSavePayment}
              >
                {recordPaymentMutation.isPending || editPaymentMutation.isPending
                  ? "Saving..."
                  : paymentEditTarget
                  ? "Save Changes"
                  : "Save Payment"}
              </Button>
            </div>
          </div>
        </Modal>

      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     LIST VIEW — all tax records
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">

      <PageHeader
        title="Tax Collection"
        subtitle="Manage annual tax assessments and record payments against them"
      >
        <Button onClick={openAddTax}>
          <Plus size={16} className="mr-2" />
          Add Tax Record
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search establishment, owner, barangay..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Input
          className="max-w-[160px]"
          type="number"
          placeholder="Filter by year"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
        />
      </div>

      {/* Table card */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
          ) : taxRecords.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No Tax Records Found"
              description={
                search || yearFilter
                  ? "No tax records match your filters."
                  : "Click 'Add Tax Record' to create the first annual assessment."
              }
            />
          ) : (
            <>
            <table
              className={cn(
                "w-full text-sm transition-opacity",
                isPlaceholderData && "opacity-60"
              )}
            >
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Year", "Establishment", "Payor", "Total Due", "Paid", "Balance", "Status"].map((h) => (
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
                {taxRecords.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    onClick={() => setSelectedRecordId(r.id)}
                  >
                    <td className="px-6 py-3.5 font-medium text-slate-800">{r.taxYear}</td>
                    <td className="px-6 py-3.5 text-slate-700">{r.establishmentName}</td>
                    <td className="px-6 py-3.5 text-slate-500">{r.ownerName}</td>
                    <td className="px-6 py-3.5 text-slate-700">{formatCurrency(r.taxDue)}</td>
                    <td className="px-6 py-3.5 text-green-700 font-medium">
                      {formatCurrency(r.totalPaid)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3.5 font-medium",
                        r.balance > 0 ? "text-red-600" : "text-slate-400"
                      )}
                    >
                      {formatCurrency(r.balance)}
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={STATUS_VARIANT[r.status] || "default"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          disabled={deleteTaxMutation.isPending}
                          title="Permanently delete this tax record and all its payments"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTaxRecord(r);
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pagination
              page={taxData.page}
              pageSize={taxData.pageSize}
              total={taxData.total}
              totalPages={taxData.totalPages}
              onChange={setPage}
            />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Tax Record modal (list-view add path) */}
      <Modal
        open={showTaxModal}
        onClose={closeTaxModal}
        title="Add Tax Record"
        className="max-w-lg"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Establishment *</Label>
            <EstablishmentPicker
              establishments={establishments}
              value={taxForm.establishmentId}
              onChange={(id) => setTaxForm((f) => ({ ...f, establishmentId: id }))}
            />
          </div>
          <div>
            <Label>Tax Year *</Label>
            <Input type="number" value={taxForm.taxYear} onChange={onTaxChange("taxYear")} />
          </div>
          <div>
            <Label>Tax Due (₱) *</Label>
            <Input type="number" value={taxForm.taxDue} onChange={onTaxChange("taxDue")} />
          </div>
          <div className="col-span-2">
            <Label>Payment Schedule *</Label>
            <select
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              value={taxForm.paymentSchedule}
              onChange={onTaxChange("paymentSchedule")}
            >
              <option value="full">Full Payment</option>
              <option value="quarterly">Quarterly</option>
              <option value="semi_annual">Semi-Annual</option>
            </select>
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeTaxModal}>Cancel</Button>
            <Button disabled={!isTaxFormValid || saveTaxMutation.isPending} onClick={handleSaveTax}>
              {saveTaxMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}