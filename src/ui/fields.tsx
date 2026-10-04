import {
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export function SelectField<T extends string | number>(props: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  help?: ReactNode;
  disabled?: boolean;
}) {
  const { label, value, options, onChange, help, disabled } = props;
  return (
    <FormControl size="small" fullWidth disabled={disabled}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}
        MenuProps={{ disablePortal: false }}
      >
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
      {help && <FormHelperText>{help}</FormHelperText>}
    </FormControl>
  );
}

export function SwitchField(props: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={props.checked}
            disabled={props.disabled}
            onChange={(e) => props.onChange(e.target.checked)}
          />
        }
        label={props.label}
      />
      {props.help && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 5.5, mt: -0.5 }}>
          {props.help}
        </Typography>
      )}
    </div>
  );
}

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  help?: ReactNode;
  error?: boolean;
  disabled?: boolean;
}) {
  const { label, value, onChange, min, max, help, error, disabled } = props;
  return (
    <TextField
      label={label}
      type="number"
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      error={error}
      helperText={help}
      disabled={disabled}
      slotProps={{ htmlInput: { min, max, step: 1 } }}
    />
  );
}

export function ToggleField<T extends string>(props: {
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      {props.label && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {props.label}
        </Typography>
      )}
      <ToggleButtonGroup
        size="small"
        exclusive
        fullWidth
        color="primary"
        value={props.value}
        disabled={props.disabled}
        onChange={(_, v: T | null) => v && props.onChange(v)}
      >
        {props.options.map((o) => (
          <ToggleButton key={o.value} value={o.value} sx={{ textTransform: 'none' }}>
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
