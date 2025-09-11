// src/pages/Login.tsx
import React, { useState, useEffect, useRef } from "react";
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
import { resendConfirmation } from "../helpers/api-communicators";

declare global {
  interface Window {
    google?: any;
  }
}

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


const Login: React.FC = () => {
  /* ---------- state ---------- */
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  const navigate = useNavigate();
  const auth     = useAuth();

  /* ---------- redirect if already logged in ---------- */
  useEffect(() => {
    if (auth?.user) navigate("/chat");
  }, [auth?.user, navigate]);

  // Initialize Google Identity Services button
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) return; // no client ID configured

    const init = () => {
      if (!window.google || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: any) => {
            const cred = response?.credential;
            if (!cred) return;
            try {
              setGoogleLoading(true);
              await auth?.loginWithGoogle(cred);
              navigate("/chat");
            } catch (e) {
              toast.error("Google sign‑in failed");
            } finally {
              setGoogleLoading(false);
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

    // If script not ready yet, poll briefly
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
      const status = err?.response?.status;
      const msg = extractErrorMsg(err);
      if (status === 403 && typeof msg === "string" && msg.toLowerCase().includes("confirm")) {
        setUnverified(true);
      }
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

      {/* Unverified email helper */}
      {unverified && (
        <Box
          sx={{
            mb: 2,
            p: 2,
            borderRadius: 2,
            bgcolor: "rgba(25,118,210,0.1)",
            border: "1px solid rgba(25,118,210,0.4)",
            color: "#e8e8e8",
          }}
        >
          <Typography sx={{ mb: 1 }}>
            Your email isn’t verified yet. Please check your inbox for the confirmation link.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            disabled={resending}
            onClick={async () => {
              try {
                setResending(true);
                await resendConfirmation(form.email);
                toast.success("Confirmation e‑mail sent");
              } catch {
                toast.error("Failed to resend e‑mail");
              } finally {
                setResending(false);
              }
            }}
            sx={{ borderColor: "#1976d2", color: "#90caf9" }}
          >
            {resending ? "Sending…" : "Resend confirmation"}
          </Button>
        </Box>
      )}

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
                sx={{ color: "#9ca3af", "&:hover": { color: "#1976d2" } }}
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
          {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} />
          ) : (
            <IconButton
              aria-label="Log in with Google"
              size="large"
              sx={{
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.12)",
                p: 1.5,
                "&:hover": { bgcolor: "rgba(167,139,250,0.12)" },
              }}
              onClick={() => toast("Set VITE_GOOGLE_CLIENT_ID to enable Google sign‑in")}
            >
              <FaGoogle />
            </IconButton>
          )}
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
          sx={{ color: "#e8e8e8", "&:hover": { color: "#1976d2" } }}
        >
          Sign up
        </Link>
      </Typography>
    </Box>
  );
};

export default Login;
