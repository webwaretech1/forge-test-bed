export const greet = (name: string): string => `Hello, ${name}!`;

export const factorial = (n: number): number => {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
};
