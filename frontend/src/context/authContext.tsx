import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  checkAuthStatus,
  loginUser,
  logoutUser,
  signupUser,
  loginWithGoogle,
} from "../helpers/api-communicators";

type User = {
  name: string;
  email: string;
};
type UserAuth = {
  isLoggedIn: boolean;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<UserAuth | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ----------------------------------------------------
     On first load, ask the server if our cookie is valid.
     If the server also returns a fresh JWT, stash it so
     the WebSocket handshake has something to send.
  ---------------------------------------------------- */
  useEffect(() => {
    async function checkStatus() {
      try {
        const data = await checkAuthStatus();
        if (data) {
          setUser({ email: data.email, name: data.name });
          setIsLoggedIn(true);

          if (data.token) {
            localStorage.setItem("token", data.token);
          }
        }
      } catch (e) {
        // not logged in / token invalid – remain logged out
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await loginUser(email, password);
    if (data) {
      setUser({ email: data.email, name: data.name });
      setIsLoggedIn(true);

      if (data.token) {
        localStorage.setItem("token", data.token);   // ★ store JWT
      }
    }
  };

  const loginGoogle = async (credential: string) => {
    try {
      const data = await loginWithGoogle(credential);
      if (data) {
        setUser({ email: data.email, name: data.name });
        setIsLoggedIn(true);
      }
    } catch (err) {
      // Let pages decide how to show errors; keep a console for debugging
      console.error("[Google] authContext.loginWithGoogle failed", err);
      throw err;
    }
  };

  const signup = async (name: string, email: string, password: string) => {
    const data = await signupUser(name, email, password);
    if (data) {
      setUser({ email: data.email, name: data.name });
      setIsLoggedIn(true);

      if (data.token) {
        localStorage.setItem("token", data.token);   // ★ store JWT
      }
    }
  };

  const logout = async () => {
    await logoutUser();
    localStorage.removeItem("token");                // ★ clear JWT
    setIsLoggedIn(false);
    setUser(null);
    window.location.reload();
  };

  const value = {
    user,
    isLoggedIn,
    loading,
    login,
    loginWithGoogle: loginGoogle,
    logout,
    signup,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
