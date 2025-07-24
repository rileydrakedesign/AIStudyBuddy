// src/pages/Login.tsx
import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import { IoIosLogIn } from "react-icons/io";
import { FaGoogle } from "react-icons/fa";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/context/authContext";

const Login: React.FC = () => {
  /* ---------- state ---------- */
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const auth     = useAuth();

  /* ---------- redirect if already logged in ---------- */
  useEffect(() => {
    if (auth?.user) navigate("/chat");
  }, [auth?.user, navigate]);

  /* ---------- handlers ---------- */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error("Both fields are required");
      return;
    }
    try {
      setLoading(true);
      await auth?.login(form.email, form.password);
      navigate("/chat");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data ||
        "Login failed — check your credentials";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <Box
      sx={{
        mt: 20,
        mx: "auto",
        maxWidth: 400,
        p: 4,
        borderRadius: 3,
        backgroundColor: "#0d1117",
        color: "#e8e8e8",
        boxShadow: 3,
        border: "2px dotted #e8e8e8",
      }}
    >
      <Typography variant="h4" fontWeight={700} textAlign="center" gutterBottom>
        Login
      </Typography>

      <form onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          {/* Email */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              name="email"
              label="Email"
              type="email"
              value={form.email}
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

          {/* Password */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              name="password"
              label="Password"
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
            <Box
              sx={{
                mt: 1,
                display: "flex",
                justifyContent: "flex-end",
                fontSize: "0.75rem",
              }}
            >
              <Link
                component={RouterLink}
                to="/forgot-password"
                underline="hover"
                sx={{ color: "#9ca3af", "&:hover": { color: "#a78bfa" } }}
              >
                Forgot Password&nbsp;?
              </Link>
            </Box>
          </Grid>

          {/* Submit */}
          <Grid item xs={12}>
            <Button
              fullWidth
              variant="contained"
              type="submit"
              disabled={loading}
              startIcon={<IoIosLogIn />}
              sx={{
                backgroundColor: "#1976d2",
                color: "#111827",
                fontWeight: 600,
                ":hover": { backgroundColor: "#1565c0" },
              }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </Grid>
        </Grid>
      </form>

      {/* Social separator */}
      <Box sx={{ mt: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "#9ca3af",
            fontSize: "0.875rem",
          }}
        >
          <Divider sx={{ flex: 1, bgcolor: "#374151" }} />
          <span>Login with social accounts</span>
          <Divider sx={{ flex: 1, bgcolor: "#374151" }} />
        </Box>

        {/* Google sign‑in */}
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <IconButton
            aria-label="Log in with Google"
            size="large"
            sx={{
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
              p: 1.5,
              "&:hover": { bgcolor: "rgba(167,139,250,0.12)" },
            }}
            onClick={() => toast("Google sign‑in coming soon")}
          >
            <FaGoogle />
          </IconButton>
        </Box>
      </Box>

      {/* Sign‑up link */}
      <Typography
        sx={{
          mt: 3,
          textAlign: "center",
          fontSize: "0.75rem",
          color: "#9ca3af",
        }}
      >
        Don’t have an account?{" "}
        <Link
          component={RouterLink}
          to="/signup"
          underline="hover"
          sx={{ color: "#e8e8e8", "&:hover": { color: "#a78bfa" } }}
        >
          Sign up
        </Link>
      </Typography>
    </Box>
  );
};

export default Login;
