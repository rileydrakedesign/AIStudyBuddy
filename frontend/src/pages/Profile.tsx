import React, { useEffect, useState } from "react";
import { Box, Typography, TextField, Button, Grid } from "@mui/material";
import { getUserProfile as apiGetUserProfile, logoutUser } from "../helpers/api-communicators";
import { useNavigate } from "react-router-dom";

const Profile: React.FC = () => {
  // Local state using "name" and "email"
  const [profile, setProfile] = useState({
    name: "",
    email: "",
  });
  
  // Track changes to enable the save button.
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch the current user's profile on mount.
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await apiGetUserProfile();
        if (data && data.profile) {
          setProfile({
            name: data.profile.name,
            email: data.profile.email,
          });
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // Handler for field changes.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
    setHasChanges(true);
  };

  // Logout handler: calls API and navigates to login page.
  const handleLogout = async () => {
    try {
      await logoutUser();              // clear server cookie/session
    } catch (error) {
      console.error("Logout error", error);
      // optional: toast.error("Server logout failed; session cleared locally.");
    } finally {
      // Force a full reload into the login route so stale auth state can't redirect back.
      window.location.replace("/login");
    }
  };

  if (loading) {
    return (
      <Box sx={{ mt: 10, textAlign: "center", color: "#e8e8e8" }}>
        <Typography>Loading profile...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 10, mx: "auto", maxWidth: 600, p: 3 }}>
      <Box
        sx={{
          p: 4,
          backgroundColor: "#212121",
          border: "2px dashed #e8e8e8",
          borderRadius: 2,
          transition: "border 0.3s ease, background-color 0.3s ease",
        }}
      >
        <Typography variant="h5" sx={{ mb: 3, color: "#e8e8e8" }}>
          Profile Settings
        </Typography>
        <Grid container spacing={2}>
          {/* Name Field */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" sx={{ color: "#e8e8e8" }}>
              Name
            </Typography>
            <TextField
              fullWidth
              name="name"
              value={profile.name}
              onChange={handleChange}
              variant="outlined"
              sx={{
                input: { color: "#e8e8e8" },
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e8e8e8" },
                  "&:hover fieldset": { borderColor: "#1976d2" },
                  "&.Mui-focused fieldset": { borderColor: "#1976d2" },
                },
                mb: 2,
              }}
            />
          </Grid>

          {/* Email Field */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" sx={{ color: "#e8e8e8" }}>
              Email
            </Typography>
            <TextField
              fullWidth
              name="email"
              value={profile.email}
              onChange={handleChange}
              variant="outlined"
              sx={{
                input: { color: "#e8e8e8" },
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e8e8e8" },
                  "&:hover fieldset": { borderColor: "#1976d2" },
                  "&.Mui-focused fieldset": { borderColor: "#1976d2" },
                },
                mb: 2,
              }}
            />
          </Grid>

          {/* Plan Field with Change Plan Button */}
          <Grid item xs={12} container alignItems="center" spacing={1}>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle1" sx={{ color: "#e8e8e8" }}>
                Plan
              </Typography>
              <TextField
                fullWidth
                value="Free Tier"
                variant="outlined"
                disabled
                sx={{
                  // Override the default disabled styling for white text
                  "& .MuiInputBase-input.Mui-disabled": {
                    WebkitTextFillColor: "#ffffff !important",
                  },
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "#ffffff !important" },
                    "&:hover fieldset": { borderColor: "#ffffff !important" },
                    "&.Mui-focused fieldset": { borderColor: "#ffffff !important" },
                  },
                  mb: 2,
                }}
              />
            </Grid>
            <Grid
              item
              xs={12}
              sm={6}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: { xs: "flex-start", sm: "flex-end" },
              }}
            >
              <Button variant="contained" sx={{ backgroundColor: "#1976d2" }}>
                Change Plan
              </Button>
            </Grid>
          </Grid>

          {/* Reset Password Section */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" sx={{ color: "#e8e8e8" }}>
              Password
            </Typography>
            <Button variant="contained" sx={{ backgroundColor: "#1976d2", mt: 1 }}>
              Reset Password
            </Button>
          </Grid>

          {/* Logout Button */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              sx={{
                backgroundColor: "#d32f2f !important", // red
                mt: 2,
              }}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </Grid>

          {/* Save Changes Button */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              disabled={!hasChanges}
              sx={{
                backgroundColor: hasChanges ? "#1976d2" : "#536878 !important",
              }}
            >
              Save Changes
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default Profile;
