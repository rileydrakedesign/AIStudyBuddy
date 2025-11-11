// src/pages/Signup.tsx
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
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
import { FaGoogle } from "react-icons/fa";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import toast from "react-hot-toast";
import { signupUser, resendConfirmation, verifyUser } from "../helpers/api-communicators";
import { useAuth } from "@/context/authContext";

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (element: HTMLElement, config: { theme: string; size: string; width: number }) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}


const extractErrorMsg = (err: unknown): string => {
  const error = err as { response?: { data?: { errors?: Array<{ msg: string }>; message?: string }; message?: string } };
  // express‑validator returns { errors: [ { msg, param, … } ] }
  if (error?.response?.data?.errors?.length) {
    return error.response.data.errors[0].msg;
  }
  // generic message fallbacks
  return (
    error?.response?.data?.message ||
    error?.response?.message ||
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
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const checkUser = async () => {
                        
      try {
        const data = await verifyUser();            // { emailVerified, email, … }
  
        if (data.emailVerified) {
          navigate("/chat");                        // verified → dashboard
          return;                     
        } else {
          // logged-in but NOT verified - show waiting panel + 30 s cooldown
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
  
  // Initialize Google Identity Services button (same as Login page)
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return; // no client ID configured

    const init = () => {
      if (!window.google || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            const cred = response?.credential;
            if (!cred) return;
            try {
              console.log("[Google] GIS callback received credential (Signup)", {
                baseURL: axios.defaults.baseURL,
                credPrefix: cred?.slice?.(0, 12),
              });
              await auth?.loginWithGoogle(cred);
              navigate("/chat");
            } catch (e) {
              console.error("[Google] Signup page Google sign‑in failed", e);
              const err = e as { response?: { data?: { message?: string } }; message?: string };
              const msg = err?.response?.data?.message || err?.message || "Google sign‑in failed";
              toast.error(msg);
            }
          },
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
          type: "standard",
        });
      } catch (e) {
        // ignore
      }
    };

    let tries = 0;
    const id = setInterval(() => {
      if (window.google && googleBtnRef.current) {
        clearInterval(id);
        init();
      } else if (tries++ > 50) {
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [auth, navigate]);

  

  useEffect(() => {
    if (resendCooldown === 0) return;
    const id = setInterval(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Auto-navigate once the user confirms via e-mail (polling)
  useEffect(() => {
    if (!waitingConfirm) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const data = await verifyUser(); // expects { emailVerified }
        if (!cancelled && (data as { emailVerified?: boolean }).emailVerified) {
          clearInterval(id);
          navigate("/chat");
        }
      } catch {
        // ignore transient errors
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [waitingConfirm, navigate]);


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
    } catch (err: unknown) {
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
        <>
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
        {/* Social separator & Google sign-up */}
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
            <span>Sign up with social accounts</span>
            <Divider sx={{ flex: 1, bgcolor: "#374151" }} />
          </Box>

          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <div ref={googleBtnRef} />
            ) : (
              <IconButton
                aria-label="Sign up with Google"
                size="large"
                sx={{
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.12)",
                  p: 1.5,
                  "&:hover": { bgcolor: "rgba(167,139,250,0.12)" },
                }}
                onClick={() => {/* no-op if not configured */}}
              >
                <FaGoogle />
              </IconButton>
            )}
          </Box>
        </Box>
        </>
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
          <Typography sx={{ mb: 3, color: "#9ca3af" }}>
            reload the page after confirming
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
