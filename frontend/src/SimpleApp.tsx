import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

const HomePage = () => (
  <div style={{ padding: '40px' }}>
    <h1>Home Page</h1>
    <nav>
      <Link to="/test" style={{ marginRight: '20px' }}>Go to Test</Link>
      <Link to="/categories">Go to Categories</Link>
    </nav>
  </div>
);

const TestPage = () => (
  <div style={{ padding: '40px' }}>
    <h1>Test Page Works! ✅</h1>
    <Link to="/">Back to Home</Link>
  </div>
);

const CategoriesPageSimple = () => (
  <div style={{ padding: '40px' }}>
    <h1>Categories Page ✅</h1>
    <Link to="/">Back to Home</Link>
  </div>
);

export const SimpleApp: React.FC = () => {
  console.log('🔍 SimpleApp: Rendering');
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/categories" element={<CategoriesPageSimple />} />
      </Routes>
    </BrowserRouter>
  );
};
