import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/layouts/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import BarangaysPage from "@/pages/BarangaysPage";
import BusinessRegistryPage from "@/pages/BusinessRegistryPage";
import TaxCollectionPage from "@/pages/TaxCollectionPage";
import ReportsPage from "@/pages/ReportsPage";
import BackupPage from "@/pages/BackupPage";
import ActivityLogsPage from "@/pages/ActivityLogsPage";
import UsersPage from "@/pages/UsersPage";
import FeeOptionsPage from "@/pages/FeeOptionsPage";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/* User management is administrators only. Non-admins who navigate directly to
   /users are bounced to the dashboard (the API also enforces this server-side). */
function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== "administrator") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="barangays" element={<BarangaysPage />} />
        <Route path="business-registry" element={<BusinessRegistryPage />} />
        <Route path="tax-collection" element={<TaxCollectionPage />} />
        <Route path="fee-options" element={<FeeOptionsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="backup" element={<BackupPage />} />
        <Route path="activity-logs" element={<ActivityLogsPage />} />
        <Route
          path="users"
          element={
            <AdminRoute>
              <UsersPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}