import { Link } from "react-router-dom";
import Typography from "@mui/material/Typography";

const Logo = () => {
  return (
    <div
    style={{
      display: "flex",
      marginRight: "auto",
      alignItems: "center",
      gap: "15px",
    }}
    >
      <Typography
        sx={{
          display: { md: "block", sm: "none", xs: "none" },
          fontWeight: "800",
          textShadow: "2px 2px 20px #000",
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ fontSize: "20px" }}>classchat</span>-AI
      </Typography>
    </div>
  );
};

export default Logo;
