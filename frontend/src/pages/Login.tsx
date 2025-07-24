// src/pages/Login.tsx
import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Grid,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import { IoIosLogIn } from "react-icons/io";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "@/context/authContext";

const Login: React.FC = () => {
  /* ---------- local form state ---------- */
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const auth     = useAuth();

  /* ---------- redirect if already logged in ---------- */
  useEffect(() => {
    if (auth?.user) navigate("/chat");
  }, [auth?.user, navigate]);

  /* ---------- input handlers ---------- */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  /* ---------- submit ---------- */
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
        mt: 25,
        mx: "auto",
        maxWidth: 480,
        p: 4,
        backgroundColor: "#212121",
        borderRadius: 2,
        border: "2px dashed #e8e8e8",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at top, #0d1117 0%, #000 80%)",
      }}
    >
      <Typography variant="h4" sx={{ mb: 3, textAlign: "center", color: "#e8e8e8" }}>
        Welcome back
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
                input: { color: "#e8e8e8" },
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e8e8e8" },
                  "&:hover fieldset": { borderColor: "#1976d2" },
                  "&.Mui-focused fieldset": { borderColor: "#1976d2" },
                },
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
                input: { color: "#e8e8e8" },
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e8e8e8" },
                  "&:hover fieldset": { borderColor: "#1976d2" },
                  "&.Mui-focused fieldset": { borderColor: "#1976d2" },
                },
              }}
            />
          </Grid>

          {/* Submit */}
          <Grid item xs={12}>
            <Button
              fullWidth
              variant="contained"
              type="submit"
              disabled={loading}
              startIcon={<IoIosLogIn />}
              sx={{ backgroundColor: "#1976d2" }}
            >
              {loading ? "Signing in..." : "Login"}
            </Button>
          </Grid>

          {/* Switch to signup */}
          <Grid item xs={12} sx={{ textAlign: "center" }}>
            <Link
              component={RouterLink}
              to="/signup"
              underline="hover"
              sx={{ color: "#90caf9" }}
            >
              Don’t have an account? Sign up
            </Link>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default Login;
