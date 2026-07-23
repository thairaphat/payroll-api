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

import { useEffect } from "react";

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

import { useAuth } from "@/store/auth";

import ProtectedRoute from "@/components/ProtectedRoute";

import AppLayout from "@/layouts/AppLayout";

import Login from "./pages/Login";

import Dashboard from "./pages/Dashboard";

import Employees from "./pages/Employees";

import Attendance from "./pages/Attendance";
import FieldAttendanceEntry from "./pages/FieldAttendanceEntry";
import Payroll from "./pages/Payroll";
import NotFound from "./pages/NotFound.tsx";
import AccessDenied from "./pages/AccessDenied";
import AdminCompanies from "./pages/AdminCompanies";
import AdminUsers from "./pages/AdminUsers";
import AdminCompanyWages from "./pages/AdminCompanyWages";


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
  );
};

/**
 * Main App
 */

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        {/* Global Background */}
        <div
            className="
            min-h-screen
            bg-[#f4f6f9]
            text-[#0f172a]
          ">
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
  );
};

export default App;
