// src/App.tsx
import Header from "./components/Header";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";
import UploadDocument from "./pages/Upload";
import Profile from "./pages/Profile";
import { useAuth } from "./context/authContext";

function App() {
  const auth = useAuth();

  return (
    <main>
      <Header />

      <Routes>
        <Route
          path="/"
          element={
            auth?.isLoggedIn && auth.user ? (
              <Chat />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* auth-free routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* logged-in only */}
        {auth?.isLoggedIn && auth.user && (
          <>
            <Route path="/chat" element={<Chat />} /> {/* alias */}
            <Route path="/upload" element={<UploadDocument />} />
            <Route path="/profile" element={<Profile />} />
          </>
        )}

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
  );
}

export default App;
