import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isBetaEmail } from '../../lib/betaAccess';

/* Розділ лише для тестувальників: решту тихо відправляє на головну. */
export default function BetaOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: 420 }} />;
  if (!isBetaEmail(user?.email)) return <Navigate to="/app" replace />;
  return children;
}
