/**
 * App.tsx
 *
 * NOTE:
 * - Responsive Layout Ready
 * - Global Background
 * - Better QueryClient Config
 * - Clean Structure
 * - รองรับ Mobile / Tablet / Desktop
 */

import { lazy, Suspense, useEffect } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";

import { Toaster } from "@/components/ui/toaster";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";

import { useAuth } from "@/store/auth";

import ProtectedRoute from "@/components/ProtectedRoute";

import AppLayout from "@/layouts/AppLayout";

import { StatePanel } from "@/components/layout/StatePanel";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Employees = lazy(() => import("./pages/Employees"));
const Attendance = lazy(() => import("./pages/Attendance"));
const FieldAttendanceEntry = lazy(() => import("./pages/FieldAttendanceEntry"));
const Payroll = lazy(() => import("./pages/Payroll"));
const PayrollRuns = lazy(() => import("./pages/PayrollRuns"));
const PayrollRunDetail = lazy(() => import("./pages/PayrollRunDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const AdminCompanies = lazy(() => import("./pages/AdminCompanies"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminCompanyWages = lazy(() => import("./pages/AdminCompanyWages"));


/**
 * App Routes
 */

const AppRoutes = () => {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    /**
     * Initialize auth state
     *
     * TODO:
     * - Validate token
     * - Fetch profile
     * - Restore session
     */

    init();
  }, [init]);

  return (
    <Suspense
      fallback={
        <div className="page-shell">
          <StatePanel kind="loading" title="กำลังเปิดหน้า" message="กรุณารอสักครู่" />
        </div>
      }
    >
    <Routes>
      {/* Redirect */}
      <Route
        path="/"
        element={
          <Navigate
            to="/dashboard"
            replace
          />
        }
      />

      {/* Public */}
      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/access-denied"
        element={<AccessDenied />}
      />

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route element={<ProtectedRoute allowedRoles={["cyd_admin", "admin", "viewer"]} />}>
            <Route
              path="/dashboard"
              element={<Dashboard />}
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["cyd_admin", "admin", "hr"]} />}>
            <Route
              path="/employees"
              element={<Employees />}
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["cyd_admin", "admin", "hr", "accounting"]} />}>
            <Route
              path="/attendance"
              element={<Attendance />}
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["admin", "hr", "field_staff"]} />}>
            <Route
              path="/field-attendance"
              element={<FieldAttendanceEntry />}
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["cyd_admin", "admin", "hr", "accounting"]} />}>
            <Route
              path="/payroll"
              element={<Payroll />}
            />
            <Route path="/payroll-runs" element={<PayrollRuns />} />
            <Route path="/payroll-runs/:runId" element={<PayrollRunDetail />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["cyd_admin"]} />}>
            <Route
              path="/admin/companies"
              element={<AdminCompanies />}
            />
            <Route
              path="/admin/users"
              element={<AdminUsers />}
            />
            <Route
              path="/admin/company-wages"
              element={<AdminCompanyWages />}
            />
          </Route>
        </Route>
      </Route>

      {/* 404 */}
      <Route
        path="*"
        element={<NotFound />}
      />
    </Routes>
    </Suspense>
  );
};

/**
 * Main App
 */

const App = () => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
        {/* Global Background */}
        <div className="min-h-screen bg-background text-foreground">
          {/* Toast */}
          <Toaster />

          {/* Sonner */}
          <Sonner
            position="top-right"
            richColors
            closeButton
          />

          {/* Router */}
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </div>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
