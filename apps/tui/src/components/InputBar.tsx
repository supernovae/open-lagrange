import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";

export function InputBar({ value, onChange, onSubmit, placeholder, width }: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (value: string) => void;
  readonly placeholder: string;
  readonly width: number;
}): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor={theme.border} paddingX={1} width={width}>
      <Text color={theme.title}>{"> "}</Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} placeholder={placeholder} />
    </Box>
  );
}
