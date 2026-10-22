/** A call's problem with a second sentence after it when there is one (when minutes come back). */
export function withLine(problem: string, line: string | null): string {
  return line ? `${problem} ${line}` : problem;
}
