import { Outlet } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { InkFilter } from '../kit';
import { TopBar } from './TopBar';
import { UpdateChip } from './UpdateChip';

export function App() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <>
      <InkFilter />
      <TopBar />
      <Outlet />
      <UpdateChip
        needRefresh={needRefresh}
        onReload={() => void updateServiceWorker(true)}
        onDismiss={() => setNeedRefresh(false)}
      />
    </>
  );
}
