export function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function roleStyles(role: string) {
  const hue = hashHue(role || "role");
  const saturation = 60;
  const lightness = 55;
  const background = `hsl(${hue}deg ${saturation}% ${lightness}% / 0.2)`;
  const border = `hsl(${hue}deg ${saturation}% ${lightness - 15}%)`;
  const text = `hsl(${hue}deg ${saturation}% ${Math.max(20, lightness - 25)}%)`;
  return { bg: background, border, text };
}
