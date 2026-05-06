export function parseEditorCommand(value: string | undefined): readonly string[] {
  const input = value?.trim() || "vi";
  const args: string[] = [];
  let current = "";
  let quote: "\"" | "'" | undefined;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (quote) throw new Error("EDITOR contains an unterminated quote.");
  if (current.length > 0) args.push(current);
  return args.length > 0 ? args : ["vi"];
}
