
import React, { useRef, useState } from "react";
import { Box, TextField, Button, Typography } from "@mui/material";
import { useAuth } from "../context/authContext";
import { uploadDocument } from "../helpers/api-communicators";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const UploadDocument = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [className, setClassName] = useState("");

  const handleSubmit = async () => {
    if (!fileInputRef.current || !fileInputRef.current.files?.length) {
      toast.error("Please select a file to upload");
      return;
    }

    const file = fileInputRef.current.files[0];

    if (!className) {
      toast.error("Please enter the class name");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("className", className);

    try {
      toast.loading("Uploading document...", { id: "uploadDoc" });
      await uploadDocument(formData);
      toast.success("Document uploaded successfully!", { id: "uploadDoc" });
      // Reset form fields
      setClassName("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload document", { id: "uploadDoc" });
    }
  };

  // Redirect to login if not authenticated
  if (!auth?.user) {
    navigate("/login");
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        mt: 20,
        gap: 3,
        width: "100%",
      }}
    >
      <Typography
        sx={{
          fontSize: "40px",
          color: "white",
          mb: 2,
          fontWeight: "600",
        }}
      >
        Upload Document
      </Typography>

      <Box
        sx={{
          width: { md: "50%", xs: "90%" },
          bgcolor: "rgb(17,27,39)",
          p: 4,
          borderRadius: 3,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <input
          type="file"
          accept=".pdf"
          ref={fileInputRef}
          style={{ color: "white" }}
        />

        <TextField
          label="Class Name"
          variant="outlined"
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          sx={{ bgcolor: "white", borderRadius: 1 }}
        />

        <Button
          variant="contained"
          onClick={handleSubmit}
          sx={{
            mt: 2,
            bgcolor: "primary.main",
            ":hover": {
              bgcolor: "primary.dark",
            },
          }}
        >
          Upload
        </Button>
      </Box>
    </Box>
  );
};

export default UploadDocument;
