import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import 'aws-amplify/auth/enable-oauth-listener';
import App from './App.jsx';
import './index.css';
import { resolveOAuthRedirectUrl } from './lib/oauthRedirect.js';

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const domain = import.meta.env.VITE_COGNITO_DOMAIN;
const redirectUrl = resolveOAuthRedirectUrl(
  window.location.origin,
  import.meta.env.VITE_LOGIN_URL || '/login',
);

if (userPoolId && userPoolClientId) {
  const authConfig = {
    Cognito: {
      userPoolId,
      userPoolClientId,
    },
  };
  if (domain) {
    authConfig.Cognito.loginWith = {
      oauth: {
        domain,
        scopes: ['openid', 'email', 'profile'],
        redirectSignIn: redirectUrl ? [redirectUrl] : undefined,
        redirectSignOut: redirectUrl ? [redirectUrl] : undefined,
        responseType: 'code',
        providers: ['Google'],
      },
    };
  }
  Amplify.configure({ Auth: authConfig });
}

async function bootstrap() {
  if (import.meta.env.DEV && (import.meta.env.VITE_USE_MOCKS === 'true' || !import.meta.env.VITE_API_BASE_URL)) {
    const { startMocks } = await import('./mocks/browser.js');
    await startMocks();
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
