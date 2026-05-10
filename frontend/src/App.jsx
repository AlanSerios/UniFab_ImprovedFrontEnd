import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home";
import UploadQuote from "./pages/UploadQuote";
import QuoteReview from "./pages/QuoteReview";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AccountSettings from "./pages/AccountSettings";
import VerifyEmail from "./pages/VerifyEmail";

import ClientDashboard from "./pages/ClientDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPrintRequests from "./pages/admin/AdminPrintRequests";
import AdminPrintRequestDetail from "./pages/admin/AdminPrintRequestDetail";
import AdminDesignRequests from "./pages/admin/AdminDesignRequests";
import AdminDesignRequestDetail from "./pages/admin/AdminDesignRequestDetail";
import AdminLocalDesigns from "./pages/admin/AdminLocalDesigns";
import AdminLocalDesignForm from "./pages/admin/AdminLocalDesignForm";
import AdminCommunityDesigns from "./pages/admin/AdminCommunityDesigns";
import AdminCommunityDesignDetail from "./pages/admin/AdminCommunityDesignDetail";
import AdminMmfOverrides from "./pages/admin/AdminMmfOverrides";
import AdminMaterials from "./pages/admin/AdminMaterials";
import AdminSlicerProfiles from "./pages/admin/AdminSlicerProfiles";
import AdminPricingConfig from "./pages/admin/AdminPricingConfig";
import AdminMaintenance from "./pages/admin/AdminMaintenance";
import AdminPrinters from "./pages/admin/AdminPrinters";

import ProtectedRoute from "./components/routes/ProtectedRoute";
import AdminRoute from "./components/routes/AdminRoute";
import PrintRequestDetail from "./pages/PrintRequestDetail";
import PrintRequests from "./pages/PrintRequests";
import CustomDesignRequest from "./pages/CustomDesignRequest";
import DesignRequests from "./pages/DesignRequests";
import DesignRequestDetail from "./pages/DesignRequestDetail";
import DesignLibrary from "./pages/DesignLibrary";
import LocalDesignDetail from "./pages/LocalDesignDetail";
import MmfDesignDetail from "./pages/MmfDesignDetail";
import NotFound from "./pages/NotFound";
import Printers from "./pages/Printers";
import SystemStatus from "./pages/SystemStatus";
import MyDesigns from "./pages/MyDesigns";
import MyDesignForm from "./pages/MyDesignForm";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/quote" element={<UploadQuote />} />
            <Route path="/quote/:quoteToken" element={<QuoteReview />} />
            <Route path="/printers" element={<Printers />} />

            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route
              path="/reset-forgot-password/:resetToken"
              element={<ResetPassword />}
            />
            <Route
              path="/account-settings"
              element={
                <ProtectedRoute>
                  <AccountSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/verify-email/:verificationToken"
              element={<VerifyEmail />}
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ClientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/print-requests"
              element={
                <AdminRoute>
                  <AdminPrintRequests />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/print-requests/:requestId"
              element={
                <AdminRoute>
                  <AdminPrintRequestDetail />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/design-requests"
              element={
                <AdminRoute>
                  <AdminDesignRequests />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/design-requests/:requestId"
              element={
                <AdminRoute>
                  <AdminDesignRequestDetail />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/local-designs"
              element={
                <AdminRoute>
                  <AdminLocalDesigns />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/local-designs/new"
              element={
                <AdminRoute>
                  <AdminLocalDesignForm />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/local-designs/:designId"
              element={
                <AdminRoute>
                  <AdminLocalDesignForm />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/community-designs"
              element={
                <AdminRoute>
                  <AdminCommunityDesigns />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/community-designs/:designId"
              element={
                <AdminRoute>
                  <AdminCommunityDesignDetail />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/mmf-overrides"
              element={
                <AdminRoute>
                  <AdminMmfOverrides />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/materials"
              element={
                <AdminRoute>
                  <AdminMaterials />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/slicer-profiles"
              element={
                <AdminRoute>
                  <AdminSlicerProfiles />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/pricing"
              element={
                <AdminRoute>
                  <AdminPricingConfig />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/printers"
              element={
                <AdminRoute>
                  <AdminPrinters />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/maintenance"
              element={
                <AdminRoute>
                  <AdminMaintenance />
                </AdminRoute>
              }
            />
            <Route path="admin/status" element={<SystemStatus />} />
            <Route
              path="/requests/:requestId"
              element={
                <ProtectedRoute>
                  <PrintRequestDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requests"
              element={
                <ProtectedRoute>
                  <PrintRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/custom-design"
              element={
                <ProtectedRoute>
                  <CustomDesignRequest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/design-requests"
              element={
                <ProtectedRoute>
                  <DesignRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/design-requests/:requestId"
              element={
                <ProtectedRoute>
                  <DesignRequestDetail />
                </ProtectedRoute>
              }
            />
            <Route path="/designs" element={<DesignLibrary />} />
            <Route
              path="/my-designs"
              element={
                <ProtectedRoute>
                  <MyDesigns />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-designs/new"
              element={
                <ProtectedRoute>
                  <MyDesignForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-designs/:designId"
              element={
                <ProtectedRoute>
                  <MyDesignForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/designs/local/:designId"
              element={<LocalDesignDetail />}
            />
            <Route
              path="/designs/mmf/:objectId"
              element={<MmfDesignDetail />}
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
