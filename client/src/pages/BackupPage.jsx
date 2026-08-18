import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, RotateCcw, HardDrive } from "lucide-react";
import { apiRequest } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

/* Formats bytes into a readable size — KB/MB, matching a typical SQLite file size range. */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupPage() {
  const qc = useQueryClient();

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn:  () => apiRequest("/backup/list"),
  });

  const backupMutation = useMutation({
    mutationFn: () => apiRequest("/backup/manual", { method: "POST" }),
    onSuccess: (data) => {
      toast.success(`Backup saved: ${data.path}`);
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const restoreMutation = useMutation({
    mutationFn: (sourcePath) =>
      apiRequest("/backup/restore", {
        method: "POST",
        body: JSON.stringify({ sourcePath }),
      }),
    onSuccess: async () => {
      const canRelaunch = !!window.electronAPI?.relaunch;
      const restartNow =
        canRelaunch &&
        window.confirm(
          "Restore prepared. The app needs to restart to finish restoring the database.\n\nRestart now?"
        );
      if (restartNow) {
        await window.electronAPI.relaunch();
      } else {
        toast.success(
          "Restore prepared. Please close and reopen the app to complete it."
        );
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleRestore = async () => {
    if (!window.electronAPI?.openBackupDialog) {
      toast.error("Restore file picker is available in the Electron app only.");
      return;
    }
    const filePath = await window.electronAPI.openBackupDialog();
    if (filePath) restoreMutation.mutate(filePath);
  };

  const mostRecent = backups[0];

  return (
    <div className="space-y-6">

      <PageHeader
        title="Backup & Restore"
        subtitle="Protect taxpayer records with automatic weekly and manual database backups"
      />

      <div className="grid gap-4 lg:grid-cols-2">

        {/* Manual Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database size={18} /> Manual Backup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-1 text-sm text-slate-500">
              The system automatically creates a backup once every 7 days when the
              application starts. You can also create one manually at any time.
            </p>
            <p className="mb-4 text-xs text-slate-400">
              Backing up more than once on the same day replaces that day's file —
              it will not create duplicates.
            </p>
            {mostRecent && (
              <p className="mb-4 text-xs font-medium text-slate-600">
                Last backup: {mostRecent.date} ({formatSize(mostRecent.sizeBytes)})
              </p>
            )}
            <Button
              onClick={() => backupMutation.mutate()}
              disabled={backupMutation.isPending}
            >
              {backupMutation.isPending ? "Creating Backup..." : "Create Backup Now"}
            </Button>
          </CardContent>
        </Card>

        {/* Restore */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RotateCcw size={18} /> Restore Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-slate-500">
              Select a <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.db</code> backup
              file to restore. The application must be restarted afterward for changes to take effect.
            </p>
            <Button
              variant="outline"
              onClick={handleRestore}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? "Restoring..." : "Choose Backup File"}
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Backup history */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <HardDrive size={18} /> Backup History
        </h2>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-slate-500">Loading...</div>
            ) : backups.length === 0 ? (
              <EmptyState
                icon={HardDrive}
                title="No Backups Yet"
                description="A backup will be created automatically, or click 'Create Backup Now' above."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    {["Date", "Filename", "Size"].map((h) => (
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
                  {backups.map((b) => (
                    <tr
                      key={b.filename}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3.5 font-medium text-slate-800">{b.date}</td>
                      <td className="px-6 py-3.5 text-slate-500 font-mono text-xs">{b.filename}</td>
                      <td className="px-6 py-3.5 text-slate-500">{formatSize(b.sizeBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}