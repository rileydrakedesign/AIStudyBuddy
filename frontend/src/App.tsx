import Header from "./components/Header";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
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
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {auth?.isLoggedIn && auth.user && (
          <>
            <Route path="/chat" element={<Chat />} />
            <Route path="/upload" element={<UploadDocument />} />
            <Route path="/profile" element={<Profile />} />
          </>
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
  );
}

export default App;
