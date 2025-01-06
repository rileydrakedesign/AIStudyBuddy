import React from 'react';
import { Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import PropTypes from 'prop-types';

interface NavigationLinkProps {
  to: string;
  text: string;
  textColor?: string;
  bg?: string;
  onClick?: () => Promise<void>;
  icon?: React.ReactElement;
  hoverTextColor?: string;
}

const NavigationLink: React.FC<NavigationLinkProps> = ({
  to,
  text,
  textColor = '#D1D5DB', // Default to text-gray-300
  bg = '#1d2d44', // Default background color
  onClick,
  icon,
  hoverTextColor = '#00B5D8', // Default hover text color (e.g., text-cyan-400)
}) => {
  return (
    <Button
      component={RouterLink}
      to={to}
      onClick={onClick}
      startIcon={icon}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px', // Equivalent to gap-2
        backgroundColor: bg,
        color: textColor,
        padding: '0 16px', // Equivalent to px-4
        height: '36px', // Equivalent to h-9 (36px)
        borderRadius: '8px', // Equivalent to rounded-lg
        fontSize: '0.875rem', // Equivalent to text-sm
        fontWeight: '500', // Equivalent to font-medium
        transition: 'background-color 0.3s, color 0.3s',
        '&:hover': {
          backgroundColor: '#4a5568', // Equivalent to hover:bg-gray-700
          color: hoverTextColor, // Changes text color on hover
        },
        '&:focus-visible': {
          outline: 'none',
          boxShadow: '0 0 0 2px #3182ce', // Equivalent to focus-visible:ring-2 ring-ring
        },
        '&:disabled': {
          pointerEvents: 'none',
          opacity: 0.5, // Equivalent to disabled:opacity-50
        },
      }}
    >
      {text}
    </Button>
  );
};

export default NavigationLink;
