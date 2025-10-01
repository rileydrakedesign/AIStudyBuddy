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
  textColor = 'neutral.300',
  bg = 'neutral.700',
  onClick,
  icon,
  hoverTextColor = 'neutral.100',
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
        gap: 1,
        backgroundColor: bg,
        color: textColor,
        px: 2,
        py: 0.75,
        minHeight: '36px',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.875rem',
        fontWeight: 600,
        textTransform: 'none',
        letterSpacing: '0.025em',
        transition: 'all 150ms cubic-bezier(0.0, 0, 0.2, 1)',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        '&:hover': {
          backgroundColor: 'neutral.600',
          color: hoverTextColor,
          transform: 'translateY(-1px)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
        },
        '&:active': {
          transform: 'translateY(0)',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '2px',
          boxShadow: '0 0 20px rgba(14, 165, 233, 0.4)',
        },
        '&:disabled': {
          pointerEvents: 'none',
          opacity: 0.5,
        },
      }}
    >
      {text}
    </Button>
  );
};

export default NavigationLink;
