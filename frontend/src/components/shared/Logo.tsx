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
          textShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
          fontFamily: "var(--font-primary)",
          letterSpacing: '-0.025em',
        }}
      >
        {/* "classchat" in plain text */}
        <span style={{
          fontSize: "22px",
          color: "#CBD5E1",
        }}>
          classchat
        </span>
        {/* "AI" in a blue, rounded box */}
        <Box
          component="span"
          sx={{
            display: "inline-block",
            ml: 1,
            px: 1.2,
            py: 0.25,
            borderRadius: 'var(--radius-md)',
            backgroundColor: "primary.main",
            color: "white",
            fontWeight: 700,
            fontSize: "1rem",
            boxShadow: '0 0 20px rgba(14, 165, 233, 0.4)',
          }}
        >
          AI
        </Box>
      </Typography>
    </div>
  );
};

export default Logo;
