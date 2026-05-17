export const greet = (name: string): string => `Hello, ${name}!`;

export const subtract = (a: number, b: number): number => a - b;

export const divide = (a: number, b: number): number => {
  if (b === 0) throw new Error("Cannot divide by zero");
  return a / b;
};
