import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { LoadingPage } from './components/LoadingPage';
import Layout from './components/Layout';

const ListenerPage = lazy(() => import('./pages/ListenerPage'));
const BroadcasterPage = lazy(() => import('./pages/BroadcasterPage'));

const App = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingPage />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<ListenerPage />} />
            <Route path="/dj" element={<BroadcasterPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;