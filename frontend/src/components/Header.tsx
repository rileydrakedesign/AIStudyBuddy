// src/components/Header.tsx
import React from "react";
import { AppBar, Toolbar, Box } from "@mui/material";
import { useAuth } from "../context/authContext";
import NavigationLink from "./shared/NavigationLink";
import Logo from "./shared/Logo";
import StickyNote2Icon from "@mui/icons-material/StickyNote2";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import { useLocation } from "react-router-dom";
import ChatBubble from "@mui/icons-material/ChatBubble";
import DriveFolderUploadIcon from "@mui/icons-material/DriveFolderUpload";

/** 
 * Props are now **optional** so `<Header />` can be used without
 * passing anything.  They remain available for a future sidebar-toggle.
 */
interface HeaderProps {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

const Header: React.FC<HeaderProps> = () => {
  const auth = useAuth();
  const location = useLocation();

  // Function to determine if a link is active
  const isActive = (path: string) => location.pathname === path;
  const hideNav = location.pathname === "/login" || location.pathname === "/signup"; // Hide nav on auth pages

  return (
    <AppBar
      sx={{
        bgcolor: "rgba(0, 77, 86, 0.07) !important",
        background: "rgba(0, 77, 86, 0.07) !important",
        backdropFilter: "blur(10px)",
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.2)",
        borderBottom: "1px solid",
        borderColor: "divider",
        zIndex: 1200,
      }}
    >
      <Toolbar sx={{ display: "flex", justifyContent: "flex-end", py: 1 }}>
        {/* Right side: Navigation Links (hidden on /login) */}
        {!hideNav && (
          <div style={{ display: "flex", gap: "8px" }}>
            {auth?.isLoggedIn ? (
              <>
                <NavigationLink
                  bg={isActive("/chat") ? "primary.bg" : "neutral.700"}
                  to="/chat"
                  text="Chat"
                  textColor={isActive("/chat") ? "primary.light" : "neutral.300"}
                  hoverTextColor="neutral.100"
                  icon={<ChatBubble sx={{ color: "primary.main", fontSize: 20 }} />}
                />
                <NavigationLink
                  bg={isActive("/upload") ? "primary.bg" : "neutral.700"}
                  to="/upload"
                  text="Upload"
                  textColor={isActive("/upload") ? "primary.light" : "neutral.300"}
                  hoverTextColor="neutral.100"
                  icon={<DriveFolderUploadIcon sx={{ color: "primary.main", fontSize: 20 }} />}
                />
                <NavigationLink
                  bg={isActive("/profile") ? "primary.bg" : "neutral.700"}
                  to="/profile"
                  text=""
                  icon={<AccountCircleIcon sx={{ color: "primary.main", fontSize: 36 }} />}
                />
              </>
            ) : (
              <>
                <NavigationLink
                  bg="primary.main"
                  to="/login"
                  text="Login"
                  textColor="white"
                  hoverTextColor="white"
                  icon={<ChatBubble sx={{ color: "white", fontSize: 20 }} />}
                />
                <NavigationLink
                  bg={isActive("/signup") ? "primary.bg" : "neutral.700"}
                  to="/signup"
                  text="Signup"
                  textColor={isActive("/signup") ? "primary.light" : "neutral.300"}
                  hoverTextColor="neutral.100"
                  icon={<StickyNote2Icon sx={{ color: "primary.main", fontSize: 20 }} />}
                />
              </>
            )}
          </div>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Header;
