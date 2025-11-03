import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const DebugRouter: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('🔍 DebugRouter: Current location:', location.pathname);
    console.log('🔍 DebugRouter: Location state:', location);
    console.log('🔍 DebugRouter: Navigate function available:', !!navigate);
  }, [location, navigate]);

  return null;
};
