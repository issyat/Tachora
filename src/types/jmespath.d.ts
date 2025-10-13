declare module "jmespath" {
  export function search(data: unknown, expression: string): unknown;
  const jmespath: {
    search: typeof search;
  };
  export default jmespath;
}
