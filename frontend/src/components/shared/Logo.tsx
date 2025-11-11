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
          display: "block",
          fontWeight: 800,
          textShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
          fontFamily: "var(--font-primary)",
          letterSpacing: '-0.025em',
        }}
      >
        {/* "classchat" in plain text */}
        <span style={{
          fontSize: "28px",
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
            px: 1.5,
            py: 0.35,
            borderRadius: 'var(--radius-md)',
            backgroundColor: "primary.main",
            color: "white",
            fontWeight: 700,
            fontSize: "1.25rem",
            boxShadow: '0 0 20px rgba(14, 165, 233, 0.4)',
            opacity: 0,
            animation: 'fadeInLogo 150ms ease-in-out 200ms forwards',
            '@keyframes fadeInLogo': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
        >
          AI
        </Box>
      </Typography>
    </div>
  );
};

export default Logo;
