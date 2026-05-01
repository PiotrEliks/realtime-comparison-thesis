import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useWhiteboardStore } from './store/useWhiteboardStore';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashBoardPage'
import WhiteboardPage from './pages/WhiteBoardPage';

function App() {
  const user = useWhiteboardStore(state => state.user);

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={!user ? <LoginPage /> : <Navigate to="/dashboard" />} 
        />
        <Route 
          path="/dashboard" 
          element={user ? <DashboardPage /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/board/:boardId" 
          element={user ? <WhiteboardPage /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/" 
          element={<Navigate to={user ? "/dashboard" : "/login"} />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;