// src/components/ui/uploadBox.tsx

import React from "react";
import { Box, Typography } from "@mui/material";
import { useDropzone } from "react-dropzone";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

interface UploadBoxProps {
  onFilesSelected: (files: FileList) => void;
}

const UploadBox: React.FC<UploadBoxProps> = ({ onFilesSelected }) => {
  // Handle files dropped or selected
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      // Create a FileList from the array of Files
      const dataTransfer = new DataTransfer();
      acceptedFiles.forEach((file) => dataTransfer.items.add(file));
      onFilesSelected(dataTransfer.files);
    }
  };

  // Initialize useDropzone
  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    isDragAccept,
  } = useDropzone({
    onDrop,
    multiple: true, // Allow multiple file uploads
    // Optionally, specify accepted file types
    // accept: {
    //   'application/pdf': ['.pdf'],
    //   'image/*': ['.png', '.jpg', '.jpeg'],
    // },
  });

  return (
    <Box
      {...getRootProps()}
      sx={{
        height: 200,
        width: "100%", // Fill the container's width
        display: "flex",
        flexDirection: "column",
        gap: 2, // Reduced gap for better spacing
        cursor: "pointer",
        alignItems: "center",
        justifyContent: "center",
        border: isDragActive
          ? "2px solid #1976d2" // Blue border when active
          : "2px dashed #e8e8e8", // Dashed border by default
        backgroundColor: isDragActive
          ? "#e3f2fd" // Light blue background when active
          : "#212121", // Dark background by default
        padding: 2,
        borderRadius: 2,
        transition: "border 0.3s ease, background-color 0.3s ease",
        "&:hover": {
          borderColor: "#1976d2", // Change border color on hover
        },
      }}
    >
      <input {...getInputProps()} />

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isDragReject ? "red" : "#e8e8e8", // Change icon color on reject
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 48 }} />
      </Box>

      <Typography
        variant="h6"
        sx={{
          color: isDragReject
            ? "red" // Red text on reject
            : isDragAccept
            ? "#1976d2" // Blue text on accept
            : "#e8e8e8", // Default light text
        }}
      >
        {isDragActive
          ? "Drop the files here..."
          : "Drag or choose files to upload"}
      </Typography>
    </Box>
  );
};

export default UploadBox;
