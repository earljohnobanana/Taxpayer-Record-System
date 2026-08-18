import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, Wallet, AlertCircle } from "lucide-react";

import { apiRequest, downloadReport } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

/* ── Simple, no-filter reports ── */
const simpleReports = [
  { id: "barangay-summary",    label: "Barangay Summary" },
  { id: "owner-list",          label: "Owner List" },
  { id: "establishment-list",  label: "Establishment List" },
];

export default function ReportsPage() {
  const { data: barangays = [] } = useQuery({
    queryKey: ["barangays"],
    queryFn:  () => apiRequest("/barangays"),
  });

  /* ── Shared barangay selection, used by both advanced reports ── */
  const [selectedBarangayIds, setSelectedBarangayIds] = useState(new Set());

  /* ── Payment Report filters ── */
  const [paymentDateFrom, setPaymentDateFrom] = useState("");
  const [paymentDateTo,   setPaymentDateTo]   = useState("");

  /* ── Outstanding Balances filters ── */
  const [balanceYear, setBalanceYear] = useState("");

  const [downloadingType, setDownloadingType] = useState(null);

  function toggleBarangay(id) {
    setSelectedBarangayIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildBarangayQueryParam() {
    return selectedBarangayIds.size > 0
      ? `barangayIds=${Array.from(selectedBarangayIds).join(",")}`
      : "";
  }

  async function handleSimpleDownload(id) {
    setDownloadingType(id);
    try {
      await downloadReport(id);
      toast.success("Report downloaded.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDownloadingType(null);
    }
  }

  async function handlePaymentReportDownload() {
    const params = [buildBarangayQueryParam()];
    if (paymentDateFrom) params.push(`dateFrom=${paymentDateFrom}`);
    if (paymentDateTo)   params.push(`dateTo=${paymentDateTo}`);
    const query = params.filter(Boolean).join("&");

    setDownloadingType("payment-detail");
    try {
      await downloadReport("payment-detail", query ? `?${query}` : "");
      toast.success("Payment report downloaded.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDownloadingType(null);
    }
  }

  async function handleOutstandingBalancesDownload() {
    const params = [buildBarangayQueryParam()];
    if (balanceYear) params.push(`year=${balanceYear}`);
    const query = params.filter(Boolean).join("&");

    setDownloadingType("outstanding-balances");
    try {
      await downloadReport("outstanding-balances", query ? `?${query}` : "");
      toast.success("Outstanding balances report downloaded.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDownloadingType(null);
    }
  }

  return (
    <div className="space-y-6">

      <PageHeader
        title="Reports"
        subtitle="Generate Excel reports for the Treasurer's Office"
      />

      {/* ── Shared Barangay / Location Filter ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location Filter</CardTitle>
          <p className="text-sm text-slate-500">
            Applies to Payment Report and Outstanding Balances below. Leave everything
            unchecked to include all barangays.
          </p>
        </CardHeader>
        <CardContent>
          {barangays.length === 0 ? (
            <p className="text-sm text-slate-400">No barangays available.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {barangays.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    checked={selectedBarangayIds.has(b.id)}
                    onChange={() => toggleBarangay(b.id)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          )}
          {selectedBarangayIds.size > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {selectedBarangayIds.size} barangay{selectedBarangayIds.size > 1 ? "ies" : ""} selected.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Advanced Reports ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Payment Report */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet size={18} /> Payment Report
            </CardTitle>
            <p className="text-sm text-slate-500">
              All recorded payments with owner, establishment, and location details.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={paymentDateFrom}
                  onChange={(e) => setPaymentDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={paymentDateTo}
                  onChange={(e) => setPaymentDateTo(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handlePaymentReportDownload}
              disabled={downloadingType === "payment-detail"}
            >
              {downloadingType === "payment-detail" ? "Generating..." : "Download Excel"}
            </Button>
          </CardContent>
        </Card>

        {/* Outstanding Balances */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle size={18} /> Outstanding Balances
            </CardTitle>
            <p className="text-sm text-slate-500">
              Tax records with an unpaid or partially paid balance.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Tax Year (optional)</Label>
              <Input
                type="number"
                placeholder="e.g. 2026"
                value={balanceYear}
                onChange={(e) => setBalanceYear(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleOutstandingBalancesDownload}
              disabled={downloadingType === "outstanding-balances"}
            >
              {downloadingType === "outstanding-balances" ? "Generating..." : "Download Excel"}
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* ── Simple Reports ── */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <FileSpreadsheet size={18} /> Quick Reports
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {simpleReports.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="text-base">{r.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => handleSimpleDownload(r.id)}
                  disabled={downloadingType === r.id}
                >
                  {downloadingType === r.id ? "Generating..." : "Download Excel"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

    </div>
  );
}