/** Mask host:port for public API */
export function maskAddress(address: string): string {
  const trimmed = address.trim();
  const [host, port] = trimmed.includes(":") ? trimmed.split(":") : [trimmed, "25565"];
  const parts = host.split(".").filter(Boolean);
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    return `***.***.***.*:${port || "25565"}`;
  }
  const left = host.slice(0, 2);
  return `${left}***.${port ? port : ""}`;
}
