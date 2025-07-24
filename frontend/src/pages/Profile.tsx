import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { getUserProfile as apiGetUserProfile, logoutUser } from "../helpers/api-communicators";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const BORDER_BLUE = "#1976d2";

const Profile: React.FC = () => {
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGetUserProfile();
        if (data?.profile) {
          setProfile({
            name: data.profile.name,
            email: data.profile.email,
          });
        }
      } catch (err) {
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile((p) => ({ ...p, [name]: value }));
    setHasChanges(true);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      window.location.replace("/login");
    }
  };

  if (loading) {
    return (
      <Box sx={{ mt: 20, textAlign: "center", color: "#e8e8e8" }}>
        <Typography>Loading profile…</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        mt: 20,
        mx: "auto",
        maxWidth: 480,
        p: 4,
        borderRadius: 3,
        backgroundColor: "#0d1117",
        color: "#e8e8e8",
        boxShadow: 3,
        border: "2px dotted #e8e8e8",
      }}
    >
      <Typography
        variant="h4"
        fontWeight={700}
        sx={{ mb: 3, textAlign: "center", color: "#e8e8e8" }}
      >
        Profile Settings
      </Typography>

      <form>
        <Grid container spacing={2}>
          {/* Name */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Name"
              name="name"
              value={profile.name}
              onChange={handleChange}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  color: "#e8e8e8",
                  "& fieldset": { borderColor: "#374151" },
                  "&:hover fieldset": { borderColor: BORDER_BLUE },
                  "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}
            />
          </Grid>

          {/* Email */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Email"
              name="email"
              value={profile.email}
              onChange={handleChange}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  color: "#e8e8e8",
                  "& fieldset": { borderColor: "#374151" },
                  "&:hover fieldset": { borderColor: BORDER_BLUE },
                  "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}
            />
          </Grid>

          {/* Plan (disabled) */}
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Plan"
              value="Free Tier"
              disabled
              sx={{
                "& .MuiInputBase-input.Mui-disabled": {
                  WebkitTextFillColor: "#ffffff !important",
                },
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  "& fieldset": { borderColor: "#374151" },
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}
            />
          </Grid>
          <Grid
            item
            xs={12}
            sm={6}
            sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}
          >
            <Button variant="contained" sx={{ backgroundColor: BORDER_BLUE }}>
              Change Plan
            </Button>
          </Grid>

          {/* Reset password */}
          <Grid item xs={12}>
            <Button variant="contained" sx={{ backgroundColor: BORDER_BLUE }}>
              Reset Password
            </Button>
          </Grid>

          {/* Save changes */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              disabled={!hasChanges}
              sx={{
                backgroundColor: hasChanges ? BORDER_BLUE : "#536878 !important",
              }}
            >
              Save Changes
            </Button>
          </Grid>

          {/* Logout */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              sx={{ backgroundColor: "#d32f2f !important" }}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default Profile;
