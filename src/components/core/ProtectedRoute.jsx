import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    /* Незалогінений — на вхід. Запамʼятовуємо, куди він ішов,
       щоб після входу повернути саме туди, а не на головну. */
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return children;
}