import React, { useMemo, useState } from "react";
import { Box, Button, Grid, TextField, Typography, Link } from "@mui/material";
import { useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
import toast from "react-hot-toast";
import { submitPasswordReset } from "@/helpers/api-communicators";

const useQuery = () => new URLSearchParams(useLocation().search);

const ResetPassword: React.FC = () => {
  const query = useQuery();
  const token = useMemo(() => query.get("token") || "", [query]);
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Invalid or missing reset token");
      return;
    }
    if (!form.password || !form.confirmPassword) {
      toast.error("Please fill both password fields");
      return;
    }
    try {
      setLoading(true);
      await submitPasswordReset(token, form.password, form.confirmPassword);
      toast.success("Password updated. Please sign in.");
      navigate("/login");
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to reset password";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 64px)",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        p: 2,
      }}
    >
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Reset Password
      </Typography>
      <Typography sx={{ color: "#9ca3af", mb: 2 }}>
        Set a new password for your account.
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%", maxWidth: 480 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              name="password"
              label="New Password"
              type="password"
              value={form.password}
              onChange={handleChange}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  color: "#e8e8e8",
                  "& fieldset": { borderColor: "#374151" },
                  "&:hover fieldset": { borderColor: "#1976d2" },
                  "&.Mui-focused fieldset": { borderColor: "#1976d2" },
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: "#111827",
                  color: "#e8e8e8",
                  "& fieldset": { borderColor: "#374151" },
                  "&:hover fieldset": { borderColor: "#1976d2" },
                  "&.Mui-focused fieldset": { borderColor: "#1976d2" },
                },
                "& .MuiInputLabel-root": { color: "#9ca3af" },
              }}
            />
          </Grid>
          <Grid item xs={12}>
            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ backgroundColor: "#1976d2", fontWeight: 600, ":hover": { backgroundColor: "#1565c0" } }}
            >
              {loading ? "Updating..." : "Update password"}
            </Button>
          </Grid>
        </Grid>
      </Box>

      <Typography sx={{ mt: 2, fontSize: "0.85rem", color: "#9ca3af" }}>
        <Link component={RouterLink} to="/login" underline="hover" sx={{ color: "#e8e8e8", "&:hover": { color: "#1976d2" } }}>
          Back to login
        </Link>
      </Typography>
    </Box>
  );
};

export default ResetPassword;

