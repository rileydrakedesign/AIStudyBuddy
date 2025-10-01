import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from '@mui/material'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from "./context/authContext.tsx";
import { Toaster, ToastBar, toast } from "react-hot-toast";
import axios from "axios";
import { theme } from "./theme/muiTheme";

axios.defaults.baseURL = import.meta.env.VITE_API_URL;
axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter> 
        <ThemeProvider theme={theme}> 
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "#1E293B",
                color: "#CBD5E1",
                border: "1px solid #475569",
                borderRadius: "0.5rem",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.4)",
              },
              success: {
                iconTheme: {
                  primary: "#10B981",
                  secondary: "white",
                },
              },
              error: {
                iconTheme: {
                  primary: "#EF4444",
                  secondary: "white",
                },
              },
            }}
          >
            {(t) => (
              <ToastBar toast={t}>
                {({ icon, message }) => (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                    {icon}
                    <div style={{ flex: 1 }}>{message}</div>
                    <button
                      onClick={() => toast.dismiss(t.id)}
                      aria-label="Close notification"
                      title="Close"
                      style={{
                        appearance: "none",
                        background: "transparent",
                        border: "none",
                        color: "#cbd5e1",
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                        padding: 4,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </ToastBar>
            )}
          </Toaster>
          <App />
        </ThemeProvider>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
