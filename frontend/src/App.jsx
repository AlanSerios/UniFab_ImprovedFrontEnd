import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import AppLayout from "./components/layout/AppLayout";
import Home from "./pages/Home";
import About from "./pages/About";
import UploadQuote from "./pages/UploadQuote";
import QuoteReview from "./pages/QuoteReview";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AccountSettings from "./pages/AccountSettings";
import VerifyEmail from "./pages/VerifyEmail";
import VerifyRequired from "./pages/VerifyRequired";
import Terms from "./pages/Terms";
import Cart from "./pages/Cart";
import PrintRequestSubmission from "./pages/PrintRequestSubmission";

import ClientDashboard from "./pages/ClientDashboard";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPrintRequests from "./pages/admin/AdminPrintRequests";
import AdminPrintRequestDetail from "./pages/admin/AdminPrintRequestDetail";
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
import AdminQuoteReadiness from "./pages/admin/AdminQuoteReadiness";
import AdminDesignTaxonomy from "./pages/admin/AdminDesignTaxonomy";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminContent from "./pages/admin/AdminContent";

import ProtectedRoute from "./components/routes/ProtectedRoute";
import AdminRoute from "./components/routes/AdminRoute";
import PrintRequestDetail from "./pages/PrintRequestDetail";
import PrintRequests from "./pages/PrintRequests";
import DesignLibrary from "./pages/DesignLibrary";
import LocalDesignDetail from "./pages/LocalDesignDetail";
import MmfDesignDetail from "./pages/MmfDesignDetail";
import NotFound from "./pages/NotFound";
import Printers from "./pages/Printers";
import SystemStatus from "./pages/SystemStatus";
import MyDesigns from "./pages/MyDesigns";
import MyDesignForm from "./pages/MyDesignForm";
import SavedDesigns from "./pages/SavedDesigns";

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/quote" element={<UploadQuote />} />
            <Route path="/quote/:quoteToken" element={<QuoteReview />} />
            <Route path="/printers" element={<Printers />} />
            <Route path="/terms" element={<Terms />} />
            <Route
              path="/cart"
              element={
                <ProtectedRoute>
                  <Cart />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requests/new"
              element={
                <ProtectedRoute>
                  <PrintRequestSubmission />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requests/new/:draftToken"
              element={
                <ProtectedRoute>
                  <PrintRequestSubmission />
                </ProtectedRoute>
              }
            />

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
              path="/verify-required"
              element={
                <ProtectedRoute requireVerified={false}>
                  <VerifyRequired />
                </ProtectedRoute>
              }
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
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="print-requests" element={<AdminPrintRequests />} />
              <Route
                path="print-requests/:requestId"
                element={<AdminPrintRequestDetail />}
              />
              <Route path="local-designs" element={<AdminLocalDesigns />} />
              <Route path="lab-designs" element={<AdminLocalDesigns />} />
              <Route
                path="local-designs/new"
                element={<AdminLocalDesignForm />}
              />
              <Route
                path="local-designs/:designId"
                element={<AdminLocalDesignForm />}
              />
              <Route
                path="community-designs"
                element={<AdminCommunityDesigns />}
              />
              <Route
                path="community-designs/:designId"
                element={<AdminCommunityDesignDetail />}
              />
              <Route path="mmf-overrides" element={<AdminMmfOverrides />} />
              <Route path="design-taxonomy" element={<AdminDesignTaxonomy />} />
              <Route path="materials" element={<AdminMaterials />} />
              <Route path="slicer-profiles" element={<AdminSlicerProfiles />} />
              <Route path="pricing" element={<AdminPricingConfig />} />
              <Route
                path="lab-designs/new"
                element={<AdminLocalDesignForm />}
              />
              <Route
                path="lab-designs/:designId"
                element={<AdminLocalDesignForm />}
              />
              <Route path="quote-readiness" element={<AdminQuoteReadiness />} />
              <Route path="printers" element={<AdminPrinters />} />
              <Route path="maintenance" element={<AdminMaintenance />} />
              <Route path="status" element={<SystemStatus />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="audit" element={<AdminAudit />} />
              <Route path="content" element={<AdminContent />} />
            </Route>
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
              path="/saved-designs"
              element={
                <ProtectedRoute>
                  <SavedDesigns />
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
      </CartProvider>
    </AuthProvider>
  );
}
