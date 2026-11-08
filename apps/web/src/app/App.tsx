import { Outlet } from 'react-router-dom';
import { InkFilter } from '../kit';
import { TopBar } from './TopBar';

export function App() {
  return (
    <>
      <InkFilter />
      <TopBar />
      <Outlet />
    </>
  );
}
