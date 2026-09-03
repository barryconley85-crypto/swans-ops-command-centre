export function isTaskTemplate(template: any) {
  return template?.kind !== "rota";
}
