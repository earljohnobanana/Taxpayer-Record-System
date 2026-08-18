import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Users } from "lucide-react";
import { apiRequest } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

const emptyForm = { fullName: "", address: "", contactNumber: "", tin: "", notes: "" };

export default function OwnersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data = [], isLoading } = useQuery({
    queryKey: ["owners", search],
    queryFn: () => apiRequest(`/owners?search=${encodeURIComponent(search)}`),
  });

  const openAdd = () => { setForm(emptyForm); setEditTarget(null); setShowModal(true); };
  const openEdit = (o) => {
    setForm({ fullName: o.fullName, address: o.address, contactNumber: o.contactNumber || "", tin: o.tin || "", notes: o.notes || "" });
    setEditTarget(o);
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditTarget(null); setForm(emptyForm); };
  const onChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const saveMutation = useMutation({
    mutationFn: (body) =>
      editTarget
        ? apiRequest(`/owners/${editTarget.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiRequest("/owners", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(editTarget ? "Owner updated" : "Owner registered");
      closeModal();
      qc.invalidateQueries({ queryKey: ["owners"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Owners / Taxpayers" subtitle="Manage registered business owners">
        <Button onClick={openAdd}><Plus size={16} /> Register Owner</Button>
      </PageHeader>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search by name or TIN..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading...</div>
          ) : data.length === 0 ? (
            <EmptyState icon={Users} title="No owners found" description="Register an owner to get started." />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  {["Full Name", "Address", "Contact", "TIN", ""].map((h) => (
                    <th key={h} className="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-6 font-medium text-slate-800">{o.fullName}</td>
                    <td className="py-3.5 px-6 text-slate-500 max-w-[200px] truncate">{o.address}</td>
                    <td className="py-3.5 px-6 text-slate-500">{o.contactNumber || "—"}</td>
                    <td className="py-3.5 px-6 text-slate-500 font-mono text-xs">{o.tin || "—"}</td>
                    <td className="py-3.5 px-6 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(o)}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={closeModal} title={editTarget ? "Edit Owner" : "Register Owner"} className="max-w-xl">
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
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={!form.fullName.trim() || !form.address.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}