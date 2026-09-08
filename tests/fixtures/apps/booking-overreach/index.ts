// FIXTURE — an implementation that reaches past its contract.
declare const layer: {
  read(cls: string, fields?: string[]): Promise<Record<string, unknown>[]>;
  write(cls: string, record: Record<string, unknown>): Promise<void>;
};

export async function profile(memberId: string): Promise<unknown> {
  const members = await layer.read("member", ["id", "name", "email"]); // email is not in the contract
  const payments = await layer.read("payments"); // payments is not a declared class
  await layer.write("booking", { member: memberId });
  return { members, payments };
}
