import { createTheme } from '@mui/material/styles';

export function makeTheme(dark: boolean) {
  return createTheme({
    palette: { mode: dark ? 'dark' : 'light', primary: { main: dark ? '#8ab4f8' : '#1a5fb4' } },
    typography: {
      fontFamily: '"Noto Sans JP","Yu Gothic UI","Meiryo UI","Hiragino Sans",system-ui,sans-serif',
      fontSize: 13,
    },
    shape: { borderRadius: 8 },
    components: {
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true, variant: 'outlined' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none' } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none' } } },
      MuiAccordion: { defaultProps: { disableGutters: true, variant: 'outlined' } },
    },
  });
}
