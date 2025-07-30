// src/pages/Signup.tsx
import React, { useState, useEffect } from "react";
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
import { signupUser, resendConfirmation, verifyUser } from "../helpers/api-communicators";
import { useAuth } from "@/context/authContext";



const extractErrorMsg = (err: any): string => {
  // express‑validator returns { errors: [ { msg, param, … } ] }
  if (err?.response?.data?.errors?.length) {
    return err.response.data.errors[0].msg as string;
  }
  // generic message fallbacks
  return (
    err?.response?.data?.message ||
    err?.response?.data ||
    "Something went wrong — try again"
  );
};


const BORDER_BLUE = "#1976d2";

const Signup: React.FC = () => {
  /* ---------- local form state ---------- */
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    school: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const auth = useAuth();

  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const checkUser = async () => {
                        
      try {
        const data = await verifyUser();            // { emailVerified, email, … }
  
        if (data.emailVerified) {
          navigate("/chat");                        // logged‑in *and* verified
        } else {
          // logged‑in but NOT verified → show waiting panel + 30 s cooldown
          setForm((prev) => ({ ...prev, email: data.email }));
          setWaitingConfirm(true);
          setResendCooldown(30);
        }
      } catch {
        /* token invalid or server down → ignore */
      }
    };
  
    checkUser();
  }, [navigate]);
  
  

  useEffect(() => {
    if (resendCooldown === 0) return;
    const id = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  
    // Front‑end sanity checks
    if (
      !form.firstName ||
      !form.lastName ||
      !form.email ||
      !form.password ||
      !form.confirmPassword
    ) {
      toast.error("All required fields must be filled");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
  
    try {
      setLoading(true);
    
      await signupUser({
        firstName:       form.firstName,
        lastName:        form.lastName,
        school:          form.school || undefined,
        email:           form.email,
        password:        form.password,
        confirmPassword: form.confirmPassword,
      });
    
      toast.success("Account created — check your inbox to confirm.");
      setWaitingConfirm(true);
      setResendCooldown(30);  
    } catch (err: any) {
      toast.error(extractErrorMsg(err));
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
        maxWidth: 480,
        p: 4,
        borderRadius: 3,
        backgroundColor: "#0d1117",
        color: "#e8e8e8",
        boxShadow: 3,
        border: "2px dotted #e8e8e8", // same dotted border as login
      }}
    >
      <Typography 
        variant="h4" 
        fontWeight={700} 
        sx={{ mb: 3, textAlign: "center", color: "#e8e8e8" }}
      >
        Create your account
      </Typography>
      {!waitingConfirm ? (
        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            {/* First & Last name on same line */}
            <Grid item xs={12} sm={6}>
            <TextField
                fullWidth
                required
                name="firstName"
                label="First name"
                value={form.firstName}
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
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                name="lastName"
                label="Last name"
                value={form.lastName}
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

            {/* School (optional) */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                name="school"
                label="School (optional)"
                value={form.school}
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
                    "&:hover fieldset": { borderColor: BORDER_BLUE },
                    "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
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
                    "&:hover fieldset": { borderColor: BORDER_BLUE },
                    "&.Mui-focused fieldset": { borderColor: BORDER_BLUE },
                  },
                  "& .MuiInputLabel-root": { color: "#9ca3af" },
                }}
              />
            </Grid>

            {/* Confirm Password */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                name="confirmPassword"
                label="Confirm password"
                type="password"
                value={form.confirmPassword}
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

            {/* Submit */}
            <Grid item xs={12}>
              <Button
                fullWidth
                variant="contained"
                type="submit"
                disabled={loading}
                sx={{
                  backgroundColor: BORDER_BLUE,
                  fontWeight: 600,
                  ":hover": { backgroundColor: "#1565c0" },
                }}
              >
                {loading ? "Creating..." : "Sign Up"}
              </Button>
            </Grid>

            {/* Switch to login */}
            <Grid item xs={12} sx={{ textAlign: "center", fontSize: "0.75rem", color: "#9ca3af" }}>
              Already have an account?{" "}
              <Link
                component={RouterLink}
                to="/login"
                underline="hover"
                sx={{ color: "#e8e8e8", "&:hover": { color: "#1565c0" } }}
              >
                Log in
              </Link>
            </Grid>
          </Grid>
        </form>
      ) : (
        /* ---------- WAITING‑FOR‑CONFIRMATION PANEL ---------- */
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
            Confirm your e‑mail
          </Typography>
          <Typography sx={{ mb: 4 }}>
            We sent a link to <strong>{form.email}</strong>.<br />
            Please click it to activate your account.
          </Typography>
      
          <Button
            variant="contained"
            fullWidth
            disabled={resendCooldown > 0}
            sx={{
              fontWeight: 600,
              backgroundColor: BORDER_BLUE,
              ":hover": { backgroundColor: "#1565c0" },

              /* ---- styles when disabled ---- */
              "&.Mui-disabled": {
                backgroundColor: "#9ca3af",   // light grey, visible on dark bg
                color: "#1e293b",             // dark text for contrast
                cursor: "not-allowed",
              },
            }}
            onClick={async () => {
              if (resendCooldown > 0) return;
              try {
                await resendConfirmation(form.email);
                toast.success("Confirmation e‑mail sent");
                setResendCooldown(30);
              } catch {
                toast.error("Failed to resend e‑mail");
              }
            }}
          >
            {resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : "Send again"}
          </Button>


        </Box>
      )}
    </Box>
  );
};

export default Signup;
