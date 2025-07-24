import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Grid,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Edit as EditIcon } from "@mui/icons-material";
import toast from "react-hot-toast";
import {
  getUserProfile as apiGetUserProfile,
  logoutUser,
} from "../helpers/api-communicators";
import { useNavigate } from "react-router-dom";

const BORDER_BLUE = "#1976d2";

const Profile: React.FC = () => {
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [editName, setEditName] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
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
      } catch {
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
    } finally {
      window.location.replace("/login");
    }
  };

  const handleDelete = () => {
    toast("Delete account coming soon");
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
        sx={{ mb: 3, textAlign: "center" }}
      >
        Profile Settings
      </Typography>

      <form>
        <Grid container spacing={2}>
          {/* Name (inline edit) */}
          <Grid item xs={11}>
            <TextField
              fullWidth
              label="Name"
              name="name"
              value={profile.name}
              onChange={handleChange}
              disabled={!editName}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  color: "#e8e8e8",                 // editable text colour
                  "& fieldset": { borderColor: "#374151" },
                  "&:hover fieldset": { borderColor: BORDER_BLUE },
                  "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
                },
                "& .MuiInputBase-input": {         // white text always…
                  color: "#e8e8e8",
                },
                "& .MuiInputBase-input.Mui-disabled": {
                  WebkitTextFillColor: "#e8e8e8 !important", // …even when disabled
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}              
            />
          </Grid>
          <Grid item xs={1} sx={{ display: "flex", alignItems: "center" }}>
            <IconButton
              onClick={() => setEditName((v) => !v)}
              sx={{ color: "#9ca3af" }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Grid>

          {/* Email (inline edit) */}
          <Grid item xs={11}>
            <TextField
              fullWidth
              label="Email"
              name="email"
              value={profile.email}
              onChange={handleChange}
              disabled={!editEmail}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  color: "#e8e8e8",                 // editable text colour
                  "& fieldset": { borderColor: "#374151" },
                  "&:hover fieldset": { borderColor: BORDER_BLUE },
                  "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
                },
                "& .MuiInputBase-input": {         // white text always…
                  color: "#e8e8e8",
                },
                "& .MuiInputBase-input.Mui-disabled": {
                  WebkitTextFillColor: "#e8e8e8 !important", // …even when disabled
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}              
            />
          </Grid>
          <Grid item xs={1} sx={{ display: "flex", alignItems: "center" }}>
            <IconButton
              onClick={() => setEditEmail((v) => !v)}
              sx={{ color: "#9ca3af" }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Grid>

          {/* Plan */}
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
          <Grid item xs={12} sm={6} sx={{ display: "flex", alignItems: "center" }}>
            <Button variant="contained" fullWidth sx={{ backgroundColor: BORDER_BLUE }}>
              Change Plan
            </Button>
          </Grid>

          {/* Change Password */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              sx={{ backgroundColor: BORDER_BLUE }}
            >
              Change Password
            </Button>
          </Grid>

          {/* Save Changes */}
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

          {/* Delete Account */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              sx={{ backgroundColor: "#b71c1c !important" }}
              onClick={handleDelete}
            >
              Delete Account
            </Button>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default Profile;
