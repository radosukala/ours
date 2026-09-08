// FIXTURE — an implementation that stays inside its contract.
// The layer client is the application's only reach into the store.
declare const layer: {
  read(cls: string, fields?: string[]): Promise<Record<string, unknown>[]>;
  write(cls: string, record: Record<string, unknown>): Promise<void>;
  disclose(origin: string, fields: string[]): Promise<void>;
};

export async function book(memberId: string, machineId: string, start: string, end: string): Promise<void> {
  const machines = await layer.read("machine", ["id", "name", "status"]);
  if (!machines.some((m) => m["id"] === machineId && m["status"] === "in service")) return;
  const today = await layer.read("booking", ["id", "machine", "member", "start", "end", "status"]);
  if (today.some((b) => b["member"] === memberId && b["machine"] === machineId)) return; // t-fair-1
  await layer.write("booking", { machine: machineId, member: memberId, start, end, status: "booked" });
  await layer.disclose("https://calendar.dilna.example", ["machine", "start", "end"]); // t-private-2
}

export async function whoIsHere(): Promise<string[]> {
  const members = await layer.read("member", ["id", "name"]);
  return members.map((m) => String(m["name"]));
}
