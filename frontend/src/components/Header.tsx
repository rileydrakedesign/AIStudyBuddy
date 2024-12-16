import React from 'react'
import { AppBar } from '@mui/material'
import { Toolbar } from '@mui/material';
import { useAuth } from '../context/authContext';
import NavigationLink from "./shared/NavigationLink";
import Logo from "./shared/Logo";



const Header = () => {
  const auth = useAuth();
  return (
    <AppBar
      sx={{ 
        bgcolor: "transparent", 
        position: "fixed", // Make the header fixed
        top: 0, 
        left: 0,
        width: "100%",
        boxShadow: "none",
        zIndex: 1300 // Higher z-index so it stays above the sidebar
      }}
    >
    <Toolbar sx={{ display: "flex" }}>
      <Logo />
      <div>
        {auth?.isLoggedIn ? (
          <>
            <NavigationLink
              bg="#1d2d44"
              to="/chat"
              text="Go To Chat"
              textColor="white"
            />
            <NavigationLink
                bg="#1d2d44"
                to="/upload"
                text="Upload Document"
                textColor="white"
              />
            <NavigationLink
              bg="#51538f"
              textColor="white"
              to="/"
              text="logout"
              onClick={auth.logout}
            />
          </>
        ) : (
          <>
            <NavigationLink
              bg="#00fffc"
              to="/login"
              text="Login"
              textColor="black"
            />
            <NavigationLink
              bg="#51538f"
              textColor="white"
              to="/signup"
              text="Signup"
            />
          </>
        )}
      </div>
    </Toolbar>
  </AppBar>
  );
};

export default Header;