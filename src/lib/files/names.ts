const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_NAME = 200;

/**
 * Make a user-supplied file name safe to store and to use as a download name:
 * no path separators, control characters, bidi overrides, reserved Windows names,
 * trailing dots/spaces, and a bounded length that preserves the extension.
 */
export function sanitizeFileName(input: string): string {
  let name = input.normalize("NFC");
  name = name.split(/[\\/]/).pop() ?? "";
  name = name.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "");
  name = name.replace(/[<>:"|?*]/g, "_");
  name = name.replace(/^[\s.]+/, "").replace(/[\s.]+$/, "");
  if (!name) name = "file";
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;
  if (name.length > MAX_NAME) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : "";
    name = name.slice(0, MAX_NAME - ext.length) + ext;
  }
  return name;
}

export function sanitizeFolderName(input: string): string {
  const cleaned = sanitizeFileName(input).replace(/\.+$/, "");
  return cleaned || "Folder";
}

export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: "" };
}

export function copyName(name: string): string {
  const { base, ext } = splitName(name);
  return `${base} (copy)${ext}`;
}
