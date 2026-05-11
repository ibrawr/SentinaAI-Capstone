/**
 * Defines the main application router, role-based redirects, and protected route
 * structure for admin, operations, SOC, sustainability, and exhibitor flows.
 * This file wires shared layouts, guarded routes, nested dashboard pages, and
 * report, alert, navigation, and digital twin pages across the full frontend app.
 */

import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Admin from "./pages/Admin";

import AppLayout from "./layouts/AppLayout";
import ExhibitorLayout from "./layouts/ExhibitorLayout";

import DashboardPage from "./pages/DashboardPage";
import DevicesPage from "./pages/DevicesPage";
import EventsPage from "./pages/EventsPage";
import ExhibitorsPage from "./pages/ExhibitorsPage";
import BoothsPage from "./pages/BoothsPage";
import AlertsPage from "./pages/AlertsPage";
import NavigationPage from "./pages/NavigationPage";
import EventDetails from "./pages/EventDetails";
import ExhibitorDashboard from "./pages/ExhibitorDashboard";
import ExhibitorHeatMapPage from "./pages/ExhibitorHeatMapPage";
import ExhibitorAnalyticsPage from "./pages/ExhibitorAnalyticsPage";
import ExhibitorReportsPage from "./pages/ExhibitorReportsPage";
import SustainabilityDashboard from "./pages/SustainabilityDashboard";
import AlertDetailsPage from "./pages/AlertDetailsPage";
import SustainabilityHallDetails from "./pages/SustainabilityHallDetails";
import EnergyPage from "./pages/EnergyPage";
import EnvironmentalPage from "./pages/EnvironmentalPage";
import ReportsPage from "./pages/ReportsPage";
import GenerateReportPage from "./pages/GenerateReportPage";
import DigitalTwinPage from "./pages/DigitalTwinPage";
import SOCDashboardPage from "./pages/SOCDashboardPage";
import SOCAnalyticsPage from "./pages/SOCAnalyticsPage";
import SOCLogsPage from "./pages/SOCLogsPage";

export default function App() {
  const role = sessionStorage.getItem("role");

  const redirectByRole = () => {
    switch (role) {
      case "super_admin":
        return "/admin";
      case "operations_manager":
        return "/operations";
      case "soc_analyst":
        return "/soc";
      case "sustainability_manager":
        return "/sustainability";
      case "exhibitor":
        return "/exhibitor";
      default:
        return "/";
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={role ? <Navigate to={redirectByRole()} replace /> : <Login />}
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["super_admin"]}>
              <Admin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/operations/*"
          element={
            <ProtectedRoute allowedRoles={["operations_manager"]}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:id" element={<EventDetails />} />
          <Route path="exhibitors" element={<ExhibitorsPage />} />
          <Route path="booths" element={<BoothsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="navigation" element={<NavigationPage />} />
          <Route path="digital-twin" element={<DigitalTwinPage />} />
          <Route path="alerts/:id" element={<AlertDetailsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/new" element={<GenerateReportPage />} />
          <Route path="reports/:reportId/edit" element={<GenerateReportPage />} />
        </Route>

        <Route
          path="/soc/*"
          element={
            <ProtectedRoute allowedRoles={["soc_analyst"]}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SOCDashboardPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="alerts/:id" element={<AlertDetailsPage />} />
          <Route path="analytics" element={<SOCAnalyticsPage />} />
          <Route path="map" element={<DigitalTwinPage />} />
          <Route path="logs" element={<SOCLogsPage />} />
          <Route path="digital-twin" element={<DigitalTwinPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/new" element={<GenerateReportPage />} />
          <Route path="reports/:reportId/edit" element={<GenerateReportPage />} />
        </Route>

        <Route
          path="/sustainability/*"
          element={
            <ProtectedRoute allowedRoles={["sustainability_manager"]}>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SustainabilityDashboard />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="alerts/:id" element={<AlertDetailsPage />} />
          <Route path="hall/:id" element={<SustainabilityHallDetails />} />
          <Route path="energy" element={<EnergyPage />} />
          <Route path="environment" element={<EnvironmentalPage />} />
          <Route path="map" element={<NavigationPage />} />
          <Route path="digital-twin" element={<DigitalTwinPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/new" element={<GenerateReportPage />} />
          <Route path="reports/:reportId/edit" element={<GenerateReportPage />} />
        </Route>

        <Route
          path="/exhibitor/*"
          element={
            <ProtectedRoute allowedRoles={["exhibitor"]}>
              <ExhibitorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ExhibitorDashboard />} />
          <Route path="heatmap" element={<ExhibitorHeatMapPage />} />
          <Route path="analytics" element={<ExhibitorAnalyticsPage />} />
          <Route path="navigation" element={<NavigationPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/new" element={<GenerateReportPage />} />
          <Route path="reports/:reportId/edit" element={<GenerateReportPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}