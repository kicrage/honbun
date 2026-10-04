import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { makeTheme } from './theme';

const mode = document.body.dataset.mode === 'sidepanel' ? 'sidepanel' : 'popup';

// ポップアップは固定サイズ（Chrome の上限は 800x600）。サイドパネルは領域いっぱいに広げる。
if (mode === 'popup') {
  document.documentElement.style.width = '480px';
  document.documentElement.style.height = '600px';
}
document.body.style.margin = '0';

function Root() {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  return (
    <ThemeProvider theme={makeTheme(dark)}>
      <CssBaseline />
      <App mode={mode} />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
