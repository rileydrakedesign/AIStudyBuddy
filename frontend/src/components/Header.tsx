import React from 'react';
import { AppBar, Toolbar } from '@mui/material';
import { useAuth } from '../context/authContext';
import NavigationLink from "./shared/NavigationLink";
import Logo from "./shared/Logo";
import NewspaperIcon from '@mui/icons-material/Newspaper';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import StarIcon from '@mui/icons-material/Star';
import { useLocation } from 'react-router-dom';
import ChatBubble from '@mui/icons-material/ChatBubble';

const Header: React.FC = () => {
  const auth = useAuth();
  const location = useLocation();

  // Function to determine if a link is active
  const isActive = (path: string) => location.pathname === path;

  return (
    <AppBar
      sx={{ 
        bgcolor: "#061520", 
        position: "fixed", // Make the header fixed
        top: 0, 
        left: 0,
        width: "100%",
        boxShadow: "none",
        zIndex: 1300 // Higher z-index so it stays above the sidebar
      }}
    >
      <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
        <Logo />
        <div style={{ display: "flex", gap: "10px" }}>
          {auth?.isLoggedIn ? (
            <>
              <NavigationLink
                bg={isActive('/chat') ? '#2D3748' : '#1d2d44'}
                to="/chat"
                text="Go To Chat"
                textColor={isActive('/chat') ? '#00B5D8' : '#D1D5DB'} // Active and inactive text colors
                hoverTextColor="#00B5D8" // Equivalent to text-cyan-400
                icon={<ChatBubble sx={{ color: "#00B5D8" }} />} // Matching icon color
              />
              <NavigationLink
                bg={isActive('/upload') ? '#2D3748' : '#1d2d44'}
                to="/upload"
                text="Upload Document"
                textColor={isActive('/upload') ? '#00B5D8' : '#D1D5DB'}
                hoverTextColor="#00B5D8"
                icon={<NewspaperIcon sx={{ color: "#00B5D8" }} />}
              />
              <NavigationLink
                bg={isActive('/') ? '#2D3748' : '#51538f'}
                to="/"
                text="Logout"
                textColor={isActive('/') ? '#F6AD55' : '#D1D5DB'}
                onClick={auth.logout}
                hoverTextColor="#F6AD55" // Equivalent to text-yellow-400
                icon={<StarIcon sx={{ color: "#F6AD55" }} />} // Matching icon color
              />
            </>
          ) : (
            <>
              <NavigationLink
                bg="#00fffc"
                to="/login"
                text="Login"
                textColor="#1A202C" // Equivalent to text-black
                hoverTextColor="#00B5D8"
                icon={<ChatBubble sx={{ color: "#00B5D8" }} />} // Example Icon
              />
              <NavigationLink
                bg={isActive('/signup') ? '#2D3748' : '#51538f'}
                to="/signup"
                text="Signup"
                textColor={isActive('/signup') ? '#F6AD55' : '#D1D5DB'}
                hoverTextColor="#F6AD55"
                icon={<StickyNote2Icon sx={{ color: "#F6AD55" }} />} // Example Icon
              />
            </>
          )}
        </div>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
