import React, { useState, useEffect } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Autocomplete,
  LinearProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAuth } from "../context/authContext";
import {
  uploadDocument,
  getUserClasses,
  getUserDocuments,
  verifyUser,
} from "../helpers/api-communicators";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import UploadBox from "../components/ui/uploadBox";

interface ClassOption {
  name: string;
}

const UploadDocument: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  /* local file + class state */
  const [files, setFiles] = useState<File[]>([]);
  const [className, setClassName] = useState<string>("");
  const [inputClass, setInputClass] = useState<string>("");
  const [classOptions, setClassOptions] = useState<string[]>([]);

  /* NEW – free-plan doc counter */
  const [docUsage, setDocUsage] = useState<{ count: number; limit: number } | null>(null);

  /* ──────────────────── fetch classes */
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const { classes }: { classes: ClassOption[] } = await getUserClasses();
        const names = classes.map((c) => c.name);
        setClassOptions(names);
        const stored = localStorage.getItem("selectedClass");
        if (stored && names.includes(stored)) {
          setClassName(stored);
          setInputClass(stored);
        }
      } catch (err) {
        console.error("Error fetching classes", err);
        toast.error("Failed to fetch classes");
      }
    };
    if (auth?.isLoggedIn) fetchClasses();
  }, [auth]);

  /* ──────────────────── fetch doc usage (free plan) */
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const user = await verifyUser();
        if (user.plan !== "free") return; // premium users: no bar
        const { documents } = await getUserDocuments();
        setDocUsage({ count: documents.length, limit: 3 });
      } catch (err) {
        console.error("Failed to fetch document usage", err);
      }
    };
    if (auth?.isLoggedIn) fetchUsage();
  }, [auth]);

  /* add files */
  const handleFilesSelected = (fileList: FileList) =>
    setFiles((prev) => [...prev, ...Array.from(fileList)]);

  /* remove file */
  const handleRemoveFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  /* submit upload */
  const handleSubmit = async () => {
    /* ── limit check ───────────────────────────── */
    if (docUsage && docUsage.count >= docUsage.limit) {
      toast.error("Document upload limit reached for the free plan");
      return;
    }

    if (!files.length) return toast.error("Please select at least one file");
    if (!inputClass.trim()) return toast.error("Please enter the class name");

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("className", inputClass.trim());

    try {
      toast.loading("Uploading document(s)…", { id: "uploadDoc" });
      await uploadDocument(formData);
      toast.success("Document(s) uploaded successfully!", { id: "uploadDoc" });

      /* → automatically return to chat */
      navigate("/chat");                    //  ← added line

      /* bump usage counter for free plan */
      setDocUsage((prev) =>
        prev ? { ...prev, count: Math.min(prev.count + files.length, prev.limit) } : prev
      );

      /* reset form */
      setFiles([]);
      setClassName("");
      setInputClass("");
      localStorage.removeItem("selectedClass");
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        toast.error(
          err.response.data.message || "Document upload limit reached for the free plan",
          { id: "uploadDoc" }
        );
      } else if (err.response && err.response.status === 409) {
        toast.error(err.response.data.message || "Document already exists in class", {
          id: "uploadDoc",
        });
      } else {
        toast.error("Failed to upload document(s)", { id: "uploadDoc" });
      }
    }
  };

  /* redirect if not logged in */
  useEffect(() => {
    if (!auth) return;
    if (!auth.loading && !auth.isLoggedIn) navigate("/login");
  }, [auth, navigate]);

  /* ──────────────────── JSX */
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mt: 20, gap: 3 }}>
      {/* counter on its own line */}
      {docUsage && (
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <Typography sx={{ mr: 1, color: "white" }}>
            {`${docUsage.count}/${docUsage.limit}`}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(docUsage.count / docUsage.limit) * 100}
            sx={{ width: 100, height: 8, bgcolor: "#424242", borderRadius: 1 }}
          />
        </Box>
      )}

      {/* centered header */}
      <Typography
        sx={{
          fontSize: 40,
          color: "white",
          mb: 2,
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        Upload Document(s)
      </Typography>

      {/* main upload card */}
      <Box
        sx={{
          width: { md: "50%", xs: "90%" },
          bgcolor: "rgb(17,27,39)",
          p: 4,
          borderRadius: 3,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          border: "1px solid white",
          position: "relative",
        }}
      >
        {/* file drop zone */}
        <UploadBox onFilesSelected={handleFilesSelected} />

        {/* selected files list */}
        {files.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {files.map((file, idx) => (
              <Box
                key={idx}
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
                <IconButton onClick={() => handleRemoveFile(idx)} sx={{ color: "white" }}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        {/* class selector */}
        <Autocomplete
          options={classOptions}
          freeSolo
          value={className}
          inputValue={inputClass}
          onInputChange={(_, newInput) => {
            setInputClass(newInput);
            setClassName(newInput);
          }}
          onChange={(_, newVal) => {
            const val = typeof newVal === "string" ? newVal : "";
            setClassName(val);
            setInputClass(val);
            val
              ? localStorage.setItem("selectedClass", val)
              : localStorage.removeItem("selectedClass");
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Class Name"
              variant="outlined"
              sx={{
                bgcolor: "#212121",
                borderRadius: 1,
                color: "white",
                "& .MuiInputLabel-root": { color: "white" },
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "white" },
                  "&:hover fieldset": { borderColor: "white" },
                  "&.Mui-focused fieldset": { borderColor: "white" },
                },
                "& .MuiInputBase-input": { color: "white" },
              }}
            />
          )}
          ListboxProps={{
            sx: {
              backgroundColor: "white",
              "& .MuiAutocomplete-option": { color: "black" },
              "& .MuiAutocomplete-option[data-focus='true']": { backgroundColor: "#f0f0f0" },
            },
          }}
          componentsProps={{
            clearIndicator: { sx: { color: "white", "&:hover": { color: "#ccc" } } },
          }}
        />

        {/* upload button */}
        <Button
          variant="contained"
          onClick={handleSubmit}
          sx={{
            mt: 2,
            bgcolor: "primary.main",
            border: "1px solid white",
            ":hover": { bgcolor: "primary.dark" },
          }}
        >
          Upload
        </Button>
      </Box>
    </Box>
  );
};

export default UploadDocument;
