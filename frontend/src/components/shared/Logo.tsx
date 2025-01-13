import { Link } from "react-router-dom";
import Typography from "@mui/material/Typography";
import { Box } from "@mui/material";

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
          fontWeight: 800,
          textShadow: "2px 2px 20px #000",
          fontFamily: "sans-serif",
          // any other typography styling you want
        }}
      >
        {/* "classchat" in plain text */}
        <span style={{ fontSize: "20px" }}>classchat</span>
        {/* "AI" in a blue, rounded box */}
        <Box
          component="span"
          sx={{
            display: "inline-block",
            ml: 0.75,              // margin-left: 1
            px: 1.2,            // horizontal padding
            py: 0.15,            // vertical padding
            borderRadius: 2,    // numeric => theme spacing; or e.g., "5px"
            backgroundColor: "blue",
            color: "white",
            fontWeight: "bold",
            fontSize: "1rem",
          }}
        >
          AI
        </Box>
      </Typography>
    </div>
  );
};

export default Logo;
