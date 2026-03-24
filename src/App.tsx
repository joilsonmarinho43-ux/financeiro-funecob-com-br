import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Clients from "./pages/Clients";
import Settings from "./pages/Settings";
import Plans from "./pages/Plans";
import Invoices from "./pages/Invoices";
import Reports from "./pages/Reports";
import Transactions from "./pages/Transactions";
import WhatsApp from "./pages/WhatsApp";
import BillingSettings from "./pages/BillingSettings";
import V3Pay from "./pages/V3Pay";
import Gateways from "./pages/Gateways";
import WebHooks from "./pages/WebHooks";
import SMS from "./pages/SMS";
import SystemLogs from "./pages/SystemLogs";
import AdminPanel from "./pages/AdminPanel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, licenseExpired } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (licenseExpired) return <Navigate to="/license-expired" replace />;
  if (adminOnly) return <AdminGuard>{children}</AdminGuard>;
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => setIsAdmin(!!data));
  }, [user]);
  if (isAdmin === null) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LicenseExpiredPage() {
  const { user, signOut, licenseExpired } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (!licenseExpired) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto h-20 w-20 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Licença Expirada</h1>
        <p className="text-muted-foreground">
          Sua licença de acesso ao FuneCob expirou. Entre em contato com o administrador para renovar seu acesso.
        </p>
        <button
          onClick={signOut}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
            <Route path="/license-expired" element={<LicenseExpiredPage />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/clientes/planos" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="/financeiro" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/movimentacoes" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
            <Route path="/whatsapp" element={<ProtectedRoute><WhatsApp /></ProtectedRoute>} />
            <Route path="/cobranca" element={<ProtectedRoute><BillingSettings /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/v3pay" element={<ProtectedRoute><V3Pay /></ProtectedRoute>} />
            <Route path="/gateways" element={<ProtectedRoute><Gateways /></ProtectedRoute>} />
            <Route path="/webhooks" element={<ProtectedRoute><WebHooks /></ProtectedRoute>} />
            <Route path="/sms" element={<ProtectedRoute><SMS /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute><SystemLogs /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
