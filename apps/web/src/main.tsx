import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Boot } from './app/Boot';
import { routes } from './app/routes';
import { ThemeProvider } from './app/ThemeProvider';
import { createDb } from './data/db';
import { DbProvider } from './data/hooks';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './kit/kit.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
const db = createDb();
const router = createBrowserRouter(routes);
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <Boot db={db}>
        <DbProvider db={db}>
          <RouterProvider router={router} />
        </DbProvider>
      </Boot>
    </ThemeProvider>
  </StrictMode>,
);
