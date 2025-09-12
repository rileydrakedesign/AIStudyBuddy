// src/App.tsx
import Header from "./components/Header";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";
import UploadDocument from "./pages/Upload";
import Profile from "./pages/Profile";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { useAuth } from "./context/authContext";

function App() {
  const auth = useAuth();
  const location = useLocation();

  // Guard for protecting routes
  const RequireAuth = ({ children }: { children: JSX.Element }) => {
    if (auth?.loading) return null; // avoid showing loader globally
    if (!(auth?.isLoggedIn && auth.user)) {
      return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return children;
  };

  return (
    <main>
      <Header />

      <Routes>
        {/* Root: send users to chat if authed, else login */}
        <Route
          path="/"
          element={
            auth?.loading ? (
              <></>
            ) : auth?.isLoggedIn && auth.user ? (
              <Navigate to="/chat" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* auth-free routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* logged-in only (always defined, guarded) */}
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <Chat />
            </RequireAuth>
          }
        />
        <Route
          path="/upload"
          element={
            <RequireAuth>
              <UploadDocument />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />

        {/* 404: if not authed, funnel to login */}
        <Route
          path="*"
          element={
            auth?.isLoggedIn && auth.user ? (
              <NotFound />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </main>
  );
}

export default App;
