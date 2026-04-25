import { AuthProvider, AuthGate } from './components/Auth';
import ChatRoom from './pages/ChatRoom';

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <ChatRoom />
      </AuthGate>
    </AuthProvider>
  );
}
