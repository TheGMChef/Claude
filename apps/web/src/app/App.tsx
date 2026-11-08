import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';

export function App() {
  return (
    <>
      <TopBar />
      <Outlet />
    </>
  );
}
