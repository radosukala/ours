// FIXTURE — a disclosure to an allowed origin, carrying a field the disclosure does not list.
declare const layer: {
  read(cls: string, fields?: string[]): Promise<Record<string, unknown>[]>;
  disclose(origin: string, fields: string[]): Promise<void>;
};

export async function publish(): Promise<void> {
  await layer.read("booking", ["id", "machine", "member", "start", "end", "status"]);
  await layer.disclose("https://calendar.dilna.example", ["machine", "start", "end", "member"]); // member leaks
}
