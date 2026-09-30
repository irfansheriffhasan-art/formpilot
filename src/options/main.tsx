import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OptionsApp from './OptionsApp';
import '../styles/base.css';
import './styles/options.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
