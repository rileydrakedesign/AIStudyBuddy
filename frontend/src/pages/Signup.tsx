import React, { useState } from "react";
import {
  Box,
  Button,
  Grid,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import toast from "react-hot-toast";
import { signupUser } from "../helpers/api-communicators";

const Signup: React.FC = () => {
  /* ---------- local form state ---------- */
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error("All fields are required");
      return;
    }

    try {
      setLoading(true);
      await signupUser(form.name, form.email, form.password);
      toast.success("Account created – you're logged in!");
      navigate("/");                 // land on dashboard/home
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data ||
        "Signup failed — try again";
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
        Create your account
      </Typography>

      <form onSubmit={handleSubmit}>
        <Grid container spacing={2}>
          {/* Name */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              name="name"
              label="Name"
              value={form.name}
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
              sx={{ backgroundColor: "#1976d2" }}
            >
              {loading ? "Creating..." : "Sign Up"}
            </Button>
          </Grid>

          {/* Switch to login */}
          <Grid item xs={12} sx={{ textAlign: "center" }}>
            <Link
              component={RouterLink}
              to="/login"
              underline="hover"
              sx={{ color: "#90caf9" }}
            >
              Already have an account? Log in
            </Link>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default Signup;
