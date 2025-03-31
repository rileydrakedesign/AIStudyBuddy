import React from "react";
import { AppBar, Toolbar, Box } from "@mui/material";
import { useAuth } from "../context/authContext";
import NavigationLink from "./shared/NavigationLink";
import Logo from "./shared/Logo";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import StickyNote2Icon from "@mui/icons-material/StickyNote2";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useLocation } from "react-router-dom";
import ChatBubble from "@mui/icons-material/ChatBubble";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = () => {
  const auth = useAuth();
  const location = useLocation();

  // Function to determine if a link is active
  const isActive = (path: string) => location.pathname === path;

  return (
    <AppBar
      sx={{
        bgcolor: "#061520",
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        boxShadow: "none",
        zIndex: 1300, // Higher z-index so it stays above the sidebar
      }}
    >
      <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
        {/* Left side: Logo only */}
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Logo />
        </Box>

        {/* Right side: Navigation Links */}
        <div style={{ display: "flex", gap: "10px" }}>
          {auth?.isLoggedIn ? (
            <>
              <NavigationLink
                bg={isActive("/chat") ? "#2D3748" : "#1d2d44"}
                to="/chat"
                text="Chat"
                textColor={isActive("/chat") ? "#00B5D8" : "#D1D5DB"}
                hoverTextColor="#00B5D8"
                icon={<ChatBubble sx={{ color: "#00B5D8" }} />}
              />
              <NavigationLink
                bg={isActive("/upload") ? "#2D3748" : "#1d2d44"}
                to="/upload"
                text="Upload"
                textColor={isActive("/upload") ? "#00B5D8" : "#D1D5DB"}
                hoverTextColor="#00B5D8"
                icon={<NewspaperIcon sx={{ color: "#00B5D8" }} />}
              />
              <NavigationLink
                bg={isActive("/profile") ? "#2D3748" : "#1d2d44"}
                to="/profile"
                text=""
                icon={<AccountCircleIcon sx={{ color: "#00B5D8", fontSize: 40 }} />}
              />
            </>
          ) : (
            <>
              <NavigationLink
                bg="#00fffc"
                to="/login"
                text="Login"
                textColor="#1A202C"
                hoverTextColor="#00B5D8"
                icon={<ChatBubble sx={{ color: "#00B5D8" }} />}
              />
              <NavigationLink
                bg={isActive("/signup") ? "#2D3748" : "#51538f"}
                to="/signup"
                text="Signup"
                textColor={isActive("/signup") ? "#F6AD55" : "#D1D5DB"}
                hoverTextColor="#F6AD55"
                icon={<StickyNote2Icon sx={{ color: "#F6AD55" }} />}
              />
            </>
          )}
        </div>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
