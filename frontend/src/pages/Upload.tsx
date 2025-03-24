import React, { useState, useEffect } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Autocomplete,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../context/authContext";
import { uploadDocument, getUserClasses } from "../helpers/api-communicators"; // Ensure getUserClasses is imported
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

// Import your custom UploadBox component
import UploadBox from "../components/ui/uploadBox";

interface ClassOption {
  name: string;
}

const UploadDocument: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  // Local state: multiple files & class name
  const [files, setFiles] = useState<File[]>([]);
  const [className, setClassName] = useState<string | null>(null);
  const [classOptions, setClassOptions] = useState<string[]>([]); // Changed to string[]

  // Fetch user's existing classes via API
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const response = await getUserClasses(); // Assuming getUserClasses returns { classes: ClassOption[] }
        const classesData: ClassOption[] = response.classes; // Adjust based on actual response structure
        const classNames = classesData.map((cls) => cls.name);
        setClassOptions(classNames); // Set as string[]

        // Optionally, set a default or previously selected class
        const storedClass = localStorage.getItem("selectedClass");
        if (storedClass && classNames.includes(storedClass)) {
          setClassName(storedClass);
        } else {
          setClassName(null);
        }
      } catch (error) {
        console.error("Error fetching classes", error);
        toast.error("Failed to fetch classes");
      }
    };

    if (auth?.isLoggedIn) {
      fetchClasses();
    }
  }, [auth]);

  // Handle adding newly chosen files
  const handleFilesSelected = (fileList: FileList) => {
    const newFiles = Array.from(fileList);
    // Optionally, prevent duplicate files
    setFiles((prev) => [...prev, ...newFiles]);
  };

  // Remove a file from the list by index
  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Upload to server
  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error("Please select at least one file to upload");
      return;
    }
    if (!className || !className.trim()) {
      toast.error("Please enter the class name");
      return;
    }

    const formData = new FormData();
    // Append all files under the key "files" to match backend's expectation
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("className", className);

    try {
      toast.loading("Uploading document(s)...", { id: "uploadDoc" });
      await uploadDocument(formData);
      toast.success("Document(s) uploaded successfully!", { id: "uploadDoc" });
      // Reset the form
      setFiles([]);
      setClassName(null);
    } catch (error: any) {
      console.error(error);
      // Check if the error status is 409 to display the duplicate error message
      if (error.response && error.response.status === 409) {
        toast.error(error.response.data.message || "Document already exists in class", { id: "uploadDoc" });
      } else {
        toast.error("Failed to upload document(s)", { id: "uploadDoc" });
      }
    }
  };

  // Handle authentication redirect
  useEffect(() => {
    if (!auth?.isLoggedIn) {
      navigate("/login");
    }
  }, [auth, navigate]);

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
        Upload Document(s)
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
          border: "1px solid white", // White border around main container
        }}
      >
        {/* Use your custom UploadBox, passing in the callback */}
        <UploadBox onFilesSelected={handleFilesSelected} />

        {/* Display chosen files with name & delete icon */}
        {files.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {files.map((file, index) => (
              <Box
                key={index}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  bgcolor: "#2c2c2c",
                  borderRadius: 1,
                  p: 1,
                  my: 1,
                }}
              >
                <Typography sx={{ color: "white" }}>{file.name}</Typography>
                <IconButton
                  onClick={() => handleRemoveFile(index)}
                  sx={{ color: "white" }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        {/* Autocomplete for Class Name */}
        <Autocomplete
          options={classOptions}
          value={className}
          onChange={(event: any, newValue: string | null) => {
            setClassName(newValue);
            // Optionally, store the selected class in localStorage
            if (newValue) {
              localStorage.setItem("selectedClass", newValue);
            } else {
              localStorage.removeItem("selectedClass");
            }
          }}
          freeSolo
          renderInput={(params) => (
            <TextField
              {...params}
              label="Class Name"
              variant="outlined"
              sx={{
                bgcolor: "#212121",
                borderRadius: 1,
                color: "white", // Set input text color to white
                "& .MuiInputLabel-root": { color: "white" }, // Set label color to white
                "& .MuiOutlinedInput-root": {
                  "& fieldset": {
                    borderColor: "white", // Set border color to white
                  },
                  "&:hover fieldset": {
                    borderColor: "white", // Hover border color
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "white", // Focus border color
                  },
                },
                "& .MuiInputBase-input": {
                  color: "white", // Input text color
                },
              }}
            />
          )}
          ListboxProps={{
            // Apply styles directly to the listbox using ListboxProps
            sx: {
              backgroundColor: "white", // Set dropdown background to white
              "& .MuiAutocomplete-option": {
                color: "black", // Set dropdown option text color to black
              },
              "& .MuiAutocomplete-option[data-focus='true']": {
                backgroundColor: "#f0f0f0", // Optional: change background on hover/focus
              },
            },
          }}
          componentsProps={{
            clearIndicator: {
              sx: {
                color: "white", // Set clear (X) icon color to white
                "&:hover": {
                  color: "#cccccc", // Optional: change color on hover
                },
              },
            },
          }}
        />

        <Button
          variant="contained"
          onClick={handleSubmit}
          sx={{
            mt: 2,
            bgcolor: "primary.main",
            border: "1px solid white", // White border around the button
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
