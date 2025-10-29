import React from "react";
import { Box, Typography, Button } from "@mui/material";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import Logo from "./Logo";
import toast from "react-hot-toast";

/**
 * MobileBlockingPage
 *
 * Displays a blocking page for mobile users informing them that
 * Class Chat AI requires a desktop browser for the best experience.
 *
 * This component is shown when viewport width is <768px or mobile
 * user agent is detected.
 */
const MobileBlockingPage: React.FC = () => {
  const handleEmailMeLink = () => {
    toast.success("Feature coming soon! We'll notify you when mobile is ready.", {
      duration: 4000,
    });
  };

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 3,
        textAlign: "center",
      }}
    >
      {/* Logo */}
      <Box sx={{ mb: 4 }}>
        <Logo />
      </Box>

      {/* Mobile Icon */}
      <PhoneIphoneIcon
        sx={{
          fontSize: 80,
          color: "primary.main",
          mb: 3,
          opacity: 0.8,
        }}
      />

      {/* Heading */}
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          color: "text.primary",
          mb: 2,
        }}
      >
        Mobile Not Supported Yet
      </Typography>

      {/* Explanation Text */}
      <Typography
        variant="body1"
        sx={{
          color: "text.secondary",
          maxWidth: 500,
          mb: 4,
          lineHeight: 1.6,
        }}
      >
        Class Chat AI requires a desktop browser for the best experience. Please visit on your
        laptop or desktop computer.
      </Typography>

      {/* Action Buttons */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
        <Button
          variant="outlined"
          href="#"
          sx={{
            color: "primary.main",
            borderColor: "primary.main",
            "&:hover": {
              borderColor: "primary.dark",
              bgcolor: "rgba(25, 118, 210, 0.1)",
            },
          }}
        >
          Learn More
        </Button>

        <Button
          variant="contained"
          onClick={handleEmailMeLink}
          sx={{
            color: "white",
            bgcolor: "primary.main",
            "&:hover": {
              bgcolor: "primary.dark",
            },
          }}
        >
          Email Me a Link
        </Button>
      </Box>
    </Box>
  );
};

export default MobileBlockingPage;
