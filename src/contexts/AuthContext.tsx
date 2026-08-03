import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  licenseExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenseExpired, setLicenseExpired] = useState(false);

  const checkLicense = async (userId: string) => {
    try {
      // Check if user is admin — admins bypass license check
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (isAdmin) {
        setLicenseExpired(false);
        return;
      }

      // Get user's organization
      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        setLicenseExpired(false);
        return;
      }

      // Check if org is active (suspended by super admin)
      const { data: orgData } = await supabase
        .from("organizations")
        .select("active")
        .eq("id", membership.organization_id)
        .single();

      if (orgData && !orgData.active) {
        setLicenseExpired(true);
        return;
      }

      // Check subscription
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("expires_at, status")
        .eq("organization_id", membership.organization_id)
        .maybeSingle();

      if (!sub) {
        // No subscription = expired (unless it's a fresh account with no sub yet)
        setLicenseExpired(true);
        return;
      }

      const expired = new Date(sub.expires_at) < new Date();
      setLicenseExpired(expired);
    } catch {
      setLicenseExpired(false);
    }
  };

  useEffect(() => {
    let recovering = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[auth]", event, session ? "session ok" : "sem sessão");

      // Perda de sessão sem logout explícito (falha de refresh em rede móvel/aba em background):
      // tenta recuperar antes de expulsar o usuário para a tela de login.
      if (!session && (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED")) {
        if (!recovering && localStorage.getItem("funecob_signed_out") !== "1") {
          recovering = true;
          supabase.auth.refreshSession().then(({ data, error }) => {
            recovering = false;
            if (data?.session) {
              console.log("[auth] sessão recuperada automaticamente");
              setSession(data.session);
              setUser(data.session.user);
              checkLicense(data.session.user.id);
              return;
            }
            console.warn("[auth] não foi possível recuperar a sessão", error?.message);
            setSession(null);
            setUser(null);
            setLicenseExpired(false);
            setLoading(false);
          });
          setLoading(false);
          return;
        }
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        localStorage.removeItem("funecob_signed_out");
        setTimeout(() => checkLicense(session.user.id), 0);
      } else {
        setLicenseExpired(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkLicense(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);


  const signIn = async (email: string, password: string) => {
    localStorage.removeItem("funecob_signed_out");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };


  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    return { error: error as Error | null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, licenseExpired, signIn, signUp, resetPassword, updatePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
