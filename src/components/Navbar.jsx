import { useNavigate } from 'react-router-dom';
import { logout } from '../lib/auth.js';
import './Navbar.css';

export default function Navbar({ user }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => navigate('/playlists')}>
        🎲 TrueRandom
      </div>
      {user && (
        <div className="nav-user">
          <span className="nav-username">{user.display_name}</span>
          <button className="nav-logout" onClick={handleLogout}>Logout</button>
        </div>
      )}
    </nav>
  );
}
