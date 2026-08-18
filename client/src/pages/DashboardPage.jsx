import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  MapPin, Users, Building2, Receipt,
  Wallet, CheckCircle, Clock, AlertCircle,
} from "lucide-react";
import { apiRequest } from "@/services/api";
import { formatCurrency } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

/* ── Custom tooltip for area chart ── */
function CollectionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-lg text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-blue-600">{formatCurrency(payload[0]?.value || 0)}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest("/dashboard/summary"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm">Loading dashboard...</div>
      </div>
    );
  }
  if (error) {
    return <p className="text-red-500 text-sm">{error.message}</p>;
  }

  /* Build area chart data from recent payments grouped by date */
  const paymentsByDate = {};
  (data.recentPayments || []).forEach((p) => {
    const date = p.paymentDate?.slice(0, 7) ?? "Unknown"; // YYYY-MM
    paymentsByDate[date] = (paymentsByDate[date] || 0) + p.amount;
  });
  const areaData = Object.entries(paymentsByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of taxpayer records and collections — Santa Catalina MTO"
      />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Barangays"      value={data.totalBarangays}     icon={MapPin}    accent="blue" />
        <StatCard title="Owners"         value={data.totalOwners}        icon={Users}     accent="purple" />
        <StatCard title="Establishments" value={data.totalEstablishments} icon={Building2} accent="slate" />
        <StatCard title="Tax Records"    value={data.totalTaxRecords}    icon={Receipt}   accent="amber" />
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Collections"
          value={formatCurrency(data.totalCollections)}
          icon={Wallet}
          accent="green"
          subtitle="All recorded payments"
        />
        <StatCard
          title="Fully Paid"
          value={data.fullyPaid}
          icon={CheckCircle}
          accent="green"
          subtitle="Tax records settled"
        />
        <StatCard
          title="Partially Paid"
          value={data.partiallyPaid}
          icon={Clock}
          accent="amber"
          subtitle="With remaining balance"
        />
        <StatCard
          title="Unpaid"
          value={data.unpaid}
          icon={AlertCircle}
          accent="red"
          subtitle="No payment recorded"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid gap-6">
        {/* Area chart — collections over time */}
        <Card>
          <CardHeader>
            <CardTitle>Collections Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {areaData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-slate-400 text-sm">
                No payment data available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={areaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="collectionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0F4C81" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0F4C81" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CollectionTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#0F4C81"
                    strokeWidth={2.5}
                    fill="url(#collectionGrad)"
                    dot={{ r: 4, fill: "#0F4C81", strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent payments ── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.recentPayments?.length ? (
            <p className="text-sm text-slate-400 py-6 text-center">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">OR Number</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 text-slate-600">{p.paymentDate}</td>
                    <td className="py-3 px-3 font-medium text-slate-800">OR {p.orNumber}</td>
                    <td className="py-3 px-3 text-right font-semibold text-green-700">
                      {formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}