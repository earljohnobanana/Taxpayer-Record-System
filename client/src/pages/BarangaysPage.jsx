import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, MapPin, Archive } from "lucide-react";

import { apiRequest } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

const emptyForm = {
  name: "",
  description: "",
};

export default function BarangaysPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data = [], isLoading } = useQuery({
    queryKey: ["barangays", search],
    queryFn: () =>
      apiRequest(`/barangays?search=${encodeURIComponent(search)}`),
  });

  const saveMutation = useMutation({
    mutationFn: (body) =>
      editTarget
        ? apiRequest(`/barangays/${editTarget.id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          })
        : apiRequest("/barangays", {
            method: "POST",
            body: JSON.stringify(body),
          }),

    onSuccess: () => {
      toast.success(
        editTarget
          ? "Barangay updated successfully."
          : "Barangay added successfully."
      );

      queryClient.invalidateQueries({
        queryKey: ["barangays"],
      });

      closeModal();
    },

    onError: (err) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id) =>
      apiRequest(`/barangays/${id}/archive`, {
        method: "PATCH",
      }),

    onSuccess: () => {
      toast.success("Barangay archived.");

      queryClient.invalidateQueries({
        queryKey: ["barangays"],
      });
    },

    onError: (err) => toast.error(err.message),
  });

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(item) {
    setEditTarget(item);
    setForm({
      name: item.name,
      description: item.description || "",
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setForm(emptyForm);
  }

  return (
    <div className="space-y-6">

      <PageHeader
        title="Barangays"
        subtitle="Manage barangay records for Santa Catalina"
      >
        <Button onClick={openAdd}>
          <Plus size={16} className="mr-2" />
          Add Barangay
        </Button>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />

        <Input
          className="pl-9"
          placeholder="Search barangay..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">

          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Loading...
            </div>
          ) : data.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No Barangays"
              description="Click 'Add Barangay' to create your first barangay."
            />
          ) : (
            <table className="w-full text-sm">

              <thead className="bg-slate-50 border-b">

                <tr>

                  <th className="px-6 py-3 text-left">
                    Barangay
                  </th>

                  <th className="px-6 py-3 text-left">
                    Description
                  </th>

                  <th className="px-6 py-3 text-right">
                    Actions
                  </th>

                </tr>

              </thead>

              <tbody>

                {data.map((barangay) => (

                  <tr
                    key={barangay.id}
                    className="border-b hover:bg-slate-50"
                  >

                    <td className="px-6 py-4 font-medium">
                      {barangay.name}
                    </td>

                    <td className="px-6 py-4 text-slate-500">
                      {barangay.description || "—"}
                    </td>

                    <td className="px-6 py-4">

                      <div className="flex justify-end gap-2">

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(barangay)}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          onClick={() => {
                            if (
                              confirm(
                                `Archive "${barangay.name}"?`
                              )
                            ) {
                              archiveMutation.mutate(barangay.id);
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

      <Modal
        open={showModal}
        onClose={closeModal}
        title={
          editTarget
            ? "Edit Barangay"
            : "Add Barangay"
        }
      >

        <div className="space-y-4">

          <div>

            <Label>Barangay Name</Label>

            <Input
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
            />

          </div>

          <div>

            <Label>Description</Label>

            <Input
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
            />

          </div>

          <div className="flex justify-end gap-2">

            <Button
              variant="outline"
              onClick={closeModal}
            >
              Cancel
            </Button>

            <Button
              disabled={
                !form.name.trim() ||
                saveMutation.isPending
              }
              onClick={() =>
                saveMutation.mutate(form)
              }
            >
              {saveMutation.isPending
                ? "Saving..."
                : "Save"}
            </Button>

          </div>

        </div>

      </Modal>

    </div>
  );
}