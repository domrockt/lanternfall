// M10-acceptance-g-sync K3: Guard-Test für den Port-Retry in scripts/harness.mjs
// startServer (Befund B5 der Nachabnahme G: Serverstart-Fehler bei Port-Konflikt
// mit Parallel-Lane). Mock: belegter Port -> Retry auf nächste Port-Nummer ->
// Erfolg; Erschöpfung nach 3 Versuchen -> erwartete Fehlermeldung.
import { describe, expect, test, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  execFileSync: vi.fn(),
}));

// @ts-expect-error – reine JS-Helfer aus dem Harness-Skript, keine d.ts vorhanden
import { startServer } from "../scripts/harness.mjs";

interface FakeServer {
  once?: (event: string, cb: () => void) => void;
  kill: () => void;
}

function fakeServer(): FakeServer & { killed: boolean } {
  const server = {} as FakeServer & { killed: boolean };
  server.killed = false;
  server.once = () => {};
  server.kill = () => { server.killed = true; };
  return server;
}

describe("startServer Port-Retry", () => {
  test("belegter Port -> Retry auf nächste Port-Nummer -> Erfolg", async () => {
    const servers: Array<ReturnType<typeof fakeServer>> = [];
    spawnMock.mockImplementation(() => {
      const s = fakeServer();
      servers.push(s);
      return s;
    });
    // Probe: Port 7000 nie bereit (belegt), Port 7001 sofort ok.
    const probe = vi.fn(async (port: number) => port === 7001);
    const result = await startServer({ basePort: 7000, probe, pollTries: 2, pollMs: 1 });

    expect(result.port).toBe(7001);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    // Erster Versuch wächst von basePort, zweiter von basePort + 1:
    expect(String(spawnMock.mock.calls[0][1][2])).toBe("7000");
    expect(String(spawnMock.mock.calls[1][1][2])).toBe("7001");
    // Der fehlgeschlagene erste Server wurde sauber gestoppt:
    expect(servers[0].killed).toBe(true);
    expect(servers[1].killed).toBe(false);
  });

  test("sofort beendeter Prozess (Bind-Fehler) bricht den Poll früh ab", async () => {
    const servers: Array<FakeServer & { killed: boolean }> = [];
    spawnMock.mockImplementation(() => {
      let exitCb: (() => void) | null = null;
      void exitCb;
      const s = {
        once: (_event: string, cb: () => void) => { exitCb = cb; },
        kill: () => {},
      };
      servers.push(s as FakeServer & { killed: boolean });
      // Bind-Fehler: Prozess beendet sich sofort ("address in use").
      queueMicrotask(() => exitCb?.());
      return s;
    });
    // Nur der erste Spawn beendet sich sofort; Port 8001 ist sofort bereit.
    // Der exit bricht den Poll des ersten Versuchs nach 1 Probe ab:
    let probeCalls = 0;
    const probe = vi.fn(async (port: number) => { probeCalls += 1; return port === 8001; });
    const result = await startServer({ basePort: 8000, probe, pollTries: 60, pollMs: 1 });

    expect(result.port).toBe(8001);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(probeCalls).toBeLessThanOrEqual(2);
  });

  test("Erschöpfung nach 3 Versuchen -> erwartete Fehlermeldung", async () => {
    spawnMock.mockImplementation(() => fakeServer());
    const probe = vi.fn(async () => false); // nie bereit
    await expect(
      startServer({ basePort: 9000, probe, pollTries: 1, pollMs: 1 }),
    ).rejects.toThrow(/Port-Konflikt auch nach 3 Versuchen \(Ports 9000-9002\)/);
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });
});
