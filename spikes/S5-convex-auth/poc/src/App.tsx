import { useState } from 'react';
import { useAuthActions, useAuthQuery } from '@convex-dev/auth/react';

function App() {
  const { signIn, signOut } = useAuthActions();
  const isAuthenticated = useAuthQuery("isAuthenticated");
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  if (isAuthenticated === undefined) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return (
      <div>
        <h1>Logged in</h1>
        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Login</h1>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <input value={code} onChange={e => setCode(e.target.value)} placeholder="Reset Code" />
      
      <button onClick={async () => {
        try {
          await signIn("password", { email, password, flow: "signUp" });
          setMessage("Signed up successfully");
        } catch (e: any) {
          setMessage(e.message);
        }
      }}>Sign Up</button>
      <button onClick={async () => {
        try {
          await signIn("password", { email, password, flow: "signIn" });
          setMessage("Signed in successfully");
        } catch (e: any) {
          setMessage(e.message);
        }
      }}>Sign In</button>
      
      <hr/>
      <button onClick={async () => {
        try {
          await signIn("password", { email, flow: "reset" });
          setMessage("Reset email sent. Check console for code.");
        } catch (e: any) {
          setMessage(e.message);
        }
      }}>Request Password Reset</button>
      <button onClick={async () => {
        try {
          // In actual flow, user enters new password. Here we reuse 'password' field as the new password.
          await signIn("password", { email, code, newPassword: password, flow: "reset-verification" });
          setMessage("Password reset successfully. Now sign in.");
        } catch (e: any) {
          setMessage(e.message);
        }
      }}>Submit Reset Code</button>

      <p>{message}</p>
    </div>
  );
}

export default App;
