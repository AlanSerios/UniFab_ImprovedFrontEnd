/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getCurrentUser, loginUser, logoutUser } from "../api/auth";

const AuthContext = createContext(null);

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    name:
      user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email,
    role: user.isAdmin ? "admin" : "client",
    isEmailVerified: Boolean(user.isEmailVerified),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const reloadCurrentUser = useCallback(async () => {
    try {
      const data = await getCurrentUser();
      const currentUser = normalizeUser(data.data?.user || data.user);

      setUser(currentUser);

      return currentUser;
    } catch {
      setUser(null);

      return null;
    }
  }, []);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        await reloadCurrentUser();
      } finally {
        setIsAuthLoading(false);
      }
    }

    loadCurrentUser();
  }, [reloadCurrentUser]);

  const login = async ({ email, password }) => {
    const data = await loginUser({ email, password });
    const loggedInUser = normalizeUser(data.data?.user || data.user);

    setUser(loggedInUser);

    return loggedInUser;
  };

  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    isAuthLoading,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === "admin",
    login,
    logout,
    reloadCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
