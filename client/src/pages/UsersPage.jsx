import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Users as UsersIcon, KeyRound, Trash2, Eye, EyeOff } from "lucide-react";

import { apiRequest } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

const ROLES = [
  { value: "administrator", label: "Administrator" },
  { value: "treasurer", label: "Treasurer" },
  { value: "cashier", label: "Cashier" },
  { value: "encoder", label: "Encoder" },
];

const ROLE_VARIANT = {
  administrator: "purple",
  treasurer: "info",
  cashier: "success",
  encoder: "default",
};

const emptyForm = { username: "", fullName: "", role: "cashier", password: "", isActive: true };

function RoleSelect({ value, onChange, id }) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

function PasswordInput({ value, onChange, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        className="pr-10"
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const [showEdit, setShowEdit] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = add
  const [form, setForm] = useState(emptyForm);

  const [showReset, setShowReset] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiRequest("/users"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const saveMutation = useMutation({
    mutationFn: (body) =>
      editTarget
        ? apiRequest(`/users/${editTarget.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiRequest("/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success(editTarget ? "User updated." : "User created.");
      invalidate();
      closeEdit();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/users/${resetTarget.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      }),
    onSuccess: () => {
      toast.success(`Password reset for "${resetTarget.username}".`);
      closeReset();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiRequest(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("User deleted.");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowEdit(true);
  }

  function openEdit(u) {
    setEditTarget(u);
    setForm({
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      password: "",
      isActive: u.isActive,
    });
    setShowEdit(true);
  }

  function closeEdit() {
    setShowEdit(false);
    setEditTarget(null);
    setForm(emptyForm);
  }

  function openReset(u) {
    setResetTarget(u);
    setNewPassword("");
    setShowReset(true);
  }

  function closeReset() {
    setShowReset(false);
    setResetTarget(null);
    setNewPassword("");
  }

  function submitSave() {
    if (editTarget) {
      // Editing: username & password are not changed here.
      saveMutation.mutate({
        fullName: form.fullName,
        role: form.role,
        isActive: form.isActive,
      });
    } else {
      saveMutation.mutate({
        username: form.username,
        fullName: form.fullName,
        role: form.role,
        password: form.password,
      });
    }
  }

  const canSave = editTarget
    ? form.fullName.trim()
    : form.username.trim().length >= 3 &&
      form.fullName.trim() &&
      form.password.length >= 6;

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Manage staff accounts and access">
        <Button onClick={openAdd}>
          <Plus size={16} className="mr-2" />
          Add User
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
          ) : users.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No users" description="Add a staff account to get started." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left">Username</th>
                  <th className="px-6 py-3 text-left">Full Name</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium">
                      {u.username}
                      {u.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-slate-400">(you)</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{u.fullName}</td>
                    <td className="px-6 py-4">
                      <Badge variant={ROLE_VARIANT[u.role] || "default"}>
                        {ROLES.find((r) => r.value === u.role)?.label || u.role}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={u.isActive ? "success" : "danger"}>
                        {u.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openReset(u)}>
                          <KeyRound size={15} className="mr-1" />
                          Reset
                        </Button>
                        {u.id !== currentUser?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600"
                            onClick={() => {
                              if (confirm(`Delete user "${u.username}"? This cannot be undone.`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit */}
      <Modal open={showEdit} onClose={closeEdit} title={editTarget ? "Edit User" : "Add User"}>
        <div className="space-y-4">
          <div>
            <Label>Username</Label>
            <Input
              value={form.username}
              disabled={!!editTarget}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            {editTarget && (
              <p className="mt-1 text-xs text-slate-400">Username cannot be changed.</p>
            )}
          </div>

          <div>
            <Label>Full Name</Label>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>

          <div>
            <Label>Role</Label>
            <RoleSelect value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>

          {!editTarget && (
            <div>
              <Label>Password</Label>
              <PasswordInput
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">At least 6 characters.</p>
            </div>
          )}

          {editTarget && (
            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="isActive" className="mb-0">
                Account active
              </Label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button disabled={!canSave || saveMutation.isPending} onClick={submitSave}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset password */}
      <Modal
        open={showReset}
        onClose={closeReset}
        title={resetTarget ? `Reset password — ${resetTarget.username}` : "Reset password"}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Set a new password for this user. Give it to them so they can sign in; they can
            keep it or you can reset it again anytime.
          </p>
          <div>
            <Label>New password</Label>
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">At least 6 characters.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeReset}>
              Cancel
            </Button>
            <Button
              disabled={newPassword.length < 6 || resetMutation.isPending}
              onClick={() => resetMutation.mutate()}
            >
              {resetMutation.isPending ? "Saving..." : "Reset password"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
