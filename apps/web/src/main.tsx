import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { routes } from './app/routes';
import { ThemeProvider } from './app/ThemeProvider';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={createBrowserRouter(routes)} future={{ v7_startTransition: true }} />
    </ThemeProvider>
  </StrictMode>,
);
