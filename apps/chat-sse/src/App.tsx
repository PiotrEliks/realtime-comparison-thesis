import React from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@realtime-thesis/shared-ui/src/contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { AuthScreen } from './components/AuthScreen';
import { RoomList } from './components/RoomList';
import { ChatInterface } from './components/ChatInterface';
import { MetricsPanel } from './components/MetricsPanel';

const ChatApp: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <ChatProvider>
      <div className="h-screen flex overflow-hidden">
        <RoomList />
        <ChatInterface />
        <MetricsPanel />
      </div>
    </ChatProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <ChatApp />
    </AuthProvider>
  );
}

export default App;