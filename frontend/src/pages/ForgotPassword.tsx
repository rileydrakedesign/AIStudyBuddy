import React, { useState } from "react";
import { Box, Button, Grid, TextField, Typography, Link } from "@mui/material";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import toast from "react-hot-toast";
import { requestPasswordReset } from "@/helpers/api-communicators";

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Email is required");
      return;
    }
    try {
      setLoading(true);
      await requestPasswordReset(email);
      toast.success("If the account exists, a reset link was sent");
      navigate("/login");
    } catch (err: unknown) {
      // still show generic success to avoid enumeration
      toast.success("If the account exists, a reset link was sent");
      navigate("/login");
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
        Forgot Password
      </Typography>
      <Typography sx={{ color: "#9ca3af", mb: 2 }}>
        Enter your email and we’ll send a reset link.
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ width: "100%", maxWidth: 480 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              name="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </Grid>
        </Grid>
      </Box>

      <Typography sx={{ mt: 2, fontSize: "0.85rem", color: "#9ca3af" }}>
        Remembered your password? {" "}
        <Link component={RouterLink} to="/login" underline="hover" sx={{ color: "#e8e8e8", "&:hover": { color: "#1976d2" } }}>
          Back to login
        </Link>
      </Typography>
    </Box>
  );
};

export default ForgotPassword;

