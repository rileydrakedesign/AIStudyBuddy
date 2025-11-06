import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Edit as EditIcon } from "@mui/icons-material";
import toast from "react-hot-toast";
import {
  getUserProfile as apiGetUserProfile,
  updateUserProfile as apiUpdateUserProfile,
  logoutUser,
  sendPasswordResetForCurrentUser,
  changeEmail,
  deleteAccount,
} from "../helpers/api-communicators";
import { useNavigate } from "react-router-dom";

const BORDER_BLUE = "#1976d2";

const Profile: React.FC = () => {
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [originalProfile, setOriginalProfile] = useState({ name: "", email: "" });
  const [editName, setEditName] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resetLoading, setResetLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Change Email dialog state
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);

  // Delete Account dialog state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGetUserProfile();
        if (data?.profile) {
          const profileData = {
            name: data.profile.name,
            email: data.profile.email,
          };
          setProfile(profileData);
          setOriginalProfile(profileData);
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
    const newProfile = { ...profile, [name]: value };
    setProfile(newProfile);
    // Only mark as changed if name is different from original
    setHasChanges(newProfile.name !== originalProfile.name);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } finally {
      window.location.replace("/login");
    }
  };

  const handleChangePassword = async () => {
    try {
      setResetLoading(true);
      await sendPasswordResetForCurrentUser();
      toast.success("If the account exists, a reset link was sent");
    } catch (e) {
      // keep non-enumerating message
      toast.success("If the account exists, a reset link was sent");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!profile.name || profile.name.trim().length === 0) {
      toast.error("Name cannot be empty");
      return;
    }

    try {
      setSaveLoading(true);
      const response = await apiUpdateUserProfile(profile.name);
      toast.success("Profile updated successfully");
      setOriginalProfile({ ...profile });
      setHasChanges(false);
      setEditName(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to update profile";
      toast.error(message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleChangeEmailSubmit = async () => {
    if (!newEmail || !emailPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    try {
      setEmailChangeLoading(true);
      const response = await changeEmail(newEmail, emailPassword);
      toast.success(response.message);
      setChangeEmailOpen(false);
      setNewEmail("");
      setEmailPassword("");
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to request email change";
      toast.error(message);
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const handleDeleteAccountSubmit = async () => {
    if (deleteConfirmation !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    try {
      setDeleteLoading(true);
      await deleteAccount();
      toast.success("Account deleted successfully");
      window.location.replace("/login");
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to delete account. Please try again or contact support.";
      toast.error(message);
    } finally {
      setDeleteLoading(false);
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

          {/* Email (read-only, use Change Email button or pencil icon) */}
          <Grid item xs={11}>
            <TextField
              fullWidth
              label="Email"
              name="email"
              value={profile.email}
              disabled
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  "& fieldset": { borderColor: "#374151" },
                },
                "& .MuiInputBase-input.Mui-disabled": {
                  WebkitTextFillColor: "#e8e8e8 !important",
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}
            />
          </Grid>
          <Grid item xs={1} sx={{ display: "flex", alignItems: "center" }}>
            <IconButton
              onClick={() => setChangeEmailOpen(true)}
              sx={{ color: "#9ca3af" }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Grid>

          {/* Change Email Button */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              sx={{ backgroundColor: BORDER_BLUE }}
              onClick={() => setChangeEmailOpen(true)}
            >
              Change Email
            </Button>
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
              disabled={resetLoading}
              onClick={handleChangePassword}
            >
              {resetLoading ? "Sending…" : "Change Password"}
            </Button>
          </Grid>

          {/* Save Changes */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              fullWidth
              disabled={!hasChanges || saveLoading}
              onClick={handleSaveChanges}
              sx={{
                backgroundColor: hasChanges ? BORDER_BLUE : "#536878 !important",
              }}
            >
              {saveLoading ? "Saving..." : "Save Changes"}
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
              onClick={() => setDeleteAccountOpen(true)}
            >
              Delete Account
            </Button>
          </Grid>
        </Grid>
      </form>

      {/* Change Email Dialog */}
      <Dialog
        open={changeEmailOpen}
        onClose={() => !emailChangeLoading && setChangeEmailOpen(false)}
        PaperProps={{
          sx: {
            backgroundColor: "#0d1117",
            color: "#e8e8e8",
            border: "2px solid #374151",
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ color: "#e8e8e8", fontWeight: 600 }}>
          Change Email Address
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Email Address"
            type="email"
            fullWidth
            variant="outlined"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={emailChangeLoading}
            sx={{
              "& .MuiOutlinedInput-root": {
                bgcolor: "#111827",
                color: "#e8e8e8",
                "& fieldset": { borderColor: "#374151" },
                "&:hover fieldset": { borderColor: BORDER_BLUE },
                "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
              },
              "& .MuiInputBase-input": { color: "#e8e8e8" },
              "& .MuiInputLabel-root": { color: "#9ca3af" },
            }}
          />
          <TextField
            margin="dense"
            label="Current Password"
            type="password"
            fullWidth
            variant="outlined"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            disabled={emailChangeLoading}
            sx={{
              mt: 2,
              "& .MuiOutlinedInput-root": {
                bgcolor: "#111827",
                color: "#e8e8e8",
                "& fieldset": { borderColor: "#374151" },
                "&:hover fieldset": { borderColor: BORDER_BLUE },
                "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
              },
              "& .MuiInputBase-input": { color: "#e8e8e8" },
              "& .MuiInputLabel-root": { color: "#9ca3af" },
            }}
          />
          <Typography variant="body2" sx={{ mt: 2, color: "#9ca3af" }}>
            You will need to verify your new email address before the change takes effect.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setChangeEmailOpen(false);
              setNewEmail("");
              setEmailPassword("");
            }}
            disabled={emailChangeLoading}
            sx={{ color: "#9ca3af" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleChangeEmailSubmit}
            variant="contained"
            disabled={emailChangeLoading || !newEmail || !emailPassword}
            sx={{ backgroundColor: BORDER_BLUE }}
          >
            {emailChangeLoading ? "Sending..." : "Update Email"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog
        open={deleteAccountOpen}
        onClose={() => !deleteLoading && setDeleteAccountOpen(false)}
        PaperProps={{
          sx: {
            backgroundColor: "#0d1117",
            color: "#e8e8e8",
            border: "2px solid #d32f2f",
            borderRadius: 2,
          },
        }}
      >
        <DialogTitle sx={{ color: "#ef5350", fontWeight: 600 }}>
          Delete Account
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2, color: "#e8e8e8" }}>
            Are you sure? This action cannot be undone. All your classes, documents, and chats will be permanently deleted.
          </Typography>
          <TextField
            margin="dense"
            label='Type "DELETE" to confirm'
            type="text"
            fullWidth
            variant="outlined"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
            disabled={deleteLoading}
            placeholder="DELETE"
            sx={{
              "& .MuiOutlinedInput-root": {
                bgcolor: "#111827",
                color: "#e8e8e8",
                "& fieldset": { borderColor: "#d32f2f" },
                "&:hover fieldset": { borderColor: "#ef5350" },
                "&.Mui-focused fieldset": { borderColor: "#ef5350" },
              },
              "& .MuiInputBase-input": { color: "#e8e8e8" },
              "& .MuiInputLabel-root": { color: "#9ca3af" },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDeleteAccountOpen(false);
              setDeleteConfirmation("");
            }}
            disabled={deleteLoading}
            sx={{ color: "#9ca3af" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteAccountSubmit}
            variant="contained"
            disabled={deleteLoading || deleteConfirmation !== "DELETE"}
            sx={{
              backgroundColor: deleteConfirmation === "DELETE" ? "#d32f2f" : "#536878",
            }}
          >
            {deleteLoading ? "Deleting..." : "Permanently Delete Account"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Profile;
