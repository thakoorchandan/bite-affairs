/**
 * LOCAL SHARED DATABASE (development & e2e only; never for production).
 *
 * Serves an in-process PGlite (real Postgres compiled to WASM) over the Postgres wire protocol so that the
 * store and admin apps (separate Node processes) can share ONE database without Docker:
 *
 *   npm run dev:db                 # fresh in-memory DB + real menu + sample data, prints DATABASE_URL
 *   npm run dev:db -- --persist    # keep data in ./.pglite between restarts
 *   npm run dev:db -- --empty      # migrations only (no menu / sample data)
 *
 * Then start both apps with   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres
 *
 * PGlite is a single session, so unlike a real server we must never interleave two connections' protocol
 * messages. Each client's messages are buffered until a complete request cycle (… Sync / Query) is available
 * and executed atomically; while a transaction is open the lock stays with the connection that opened it.
 */
import "./_env";
import net from "node:net";
import type { PGlite } from "@electric-sql/pglite";

const SSL_REQUEST = 80877103;
const CANCEL_REQUEST = 80877102;

export interface LocalDbServer {
  port: number;
  url: string;
  stop(): Promise<void>;
}

/** Wire-protocol server in front of a PGlite instance. */
export async function startLocalDbServer(db: PGlite, opts: { port?: number; host?: string } = {}): Promise<LocalDbServer> {
  const host = opts.host ?? "127.0.0.1";
  let nextId = 1;
  let owner = 0; // connection id that currently holds an open transaction (0 = none)
  const sockets = new Set<net.Socket>();

  /** Run `fn` with exclusive use of the session, waiting while another connection has a transaction open. */
  const waiters: (() => void)[] = [];
  let busy = false;
  const acquire = async (id: number) => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!busy && (owner === 0 || owner === id)) {
        busy = true;
        return;
      }
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  const release = () => {
    busy = false;
    const all = waiters.splice(0);
    for (const w of all) w();
  };

  const server = net.createServer((socket) => {
    const id = nextId++;
    sockets.add(socket);
    socket.setNoDelay(true);
    let buf = Buffer.alloc(0);
    let started = false;
    let queue: Promise<void> = Promise.resolve();

    /**
     * `midQuery`: the cycle ended with Flush (H), i.e. an extended-protocol query (Parse/Describe … Bind/Execute/Sync)
     * is still in progress. Keep the session until its Sync arrives: otherwise another connection's unnamed
     * prepared statement replaces this one in the shared PGlite session ("bind message supplies 1 parameters,
     * but prepared statement "" requires 2").
     */
    const exec = async (message: Uint8Array, midQuery = false) => {
      await acquire(id);
      try {
        const out = await db.execProtocolRaw(message);
        if (out.length && !socket.destroyed) socket.write(out);
        owner = db.isInTransaction() || midQuery ? id : 0;
      } finally {
        release();
      }
    };

    /** Split `buf` into complete client messages; returns the bytes of complete cycles ready to execute. */
    const drain = () => {
      if (!started) {
        while (buf.length >= 8) {
          const len = buf.readInt32BE(0);
          if (buf.length < len) return;
          const code = buf.readInt32BE(4);
          const packet = buf.subarray(0, len);
          buf = buf.subarray(len);
          if (code === SSL_REQUEST) {
            socket.write("N");
            continue;
          }
          if (code === CANCEL_REQUEST) {
            socket.end();
            return;
          }
          started = true;
          queue = queue.then(() => exec(new Uint8Array(packet)));
          break;
        }
        if (!started) return;
      }
      let end = 0;
      let cycleEnd = 0;
      let terminate = false;
      let midQuery = false;
      while (buf.length - end >= 5) {
        const type = String.fromCharCode(buf[end]);
        const len = buf.readInt32BE(end + 1);
        if (buf.length - end < len + 1) break;
        end += len + 1;
        if (type === "S" || type === "Q" || type === "F" || type === "H") {
          cycleEnd = end; // Sync, Query, FunctionCall, Flush end a cycle
          midQuery = type === "H";
        }
        if (type === "X") {
          terminate = true;
          cycleEnd = end;
          break;
        }
      }
      if (cycleEnd > 0) {
        const chunk = buf.subarray(0, cycleEnd);
        buf = buf.subarray(cycleEnd);
        if (terminate) {
          socket.end();
          return;
        }
        const bytes = new Uint8Array(chunk);
        queue = queue.then(() => exec(bytes, midQuery)).catch((error) => {
          console.error("[local-db] query failed:", error?.message ?? error);
          socket.destroy();
        });
      }
    };

    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      drain();
    });
    const cleanup = () => {
      sockets.delete(socket);
      queue = queue.then(async () => {
        // A dropped client must not leave a transaction (and the lock) behind.
        if (owner === id) {
          await acquire(id);
          try {
            if (db.isInTransaction()) await db.exec("ROLLBACK").catch(() => undefined);
          } finally {
            owner = 0;
            release();
          }
        }
      });
    };
    socket.on("close", cleanup);
    socket.on("error", () => socket.destroy());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolve());
  });
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    url: `postgres://postgres:postgres@${host}:${port}/postgres`,
    async stop() {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Create a PGlite (memory or ./.pglite), apply the repo migrations, and serve it. */
export async function createLocalDatabase(opts: { port?: number; persist?: boolean } = {}) {
  const [{ PGlite }, { drizzle }, { migrate }, { resolveMigrationsFolder }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("@/db/migrations-path"),
  ]);
  const client = new PGlite(opts.persist ? ".pglite" : undefined);
  await client.waitReady;
  await migrate(drizzle(client), { migrationsFolder: resolveMigrationsFolder() });
  const server = await startLocalDbServer(client, { port: opts.port });
  return { client, server, url: server.url, async stop() { await server.stop(); await client.close(); } };
}

async function main() {
  const persist = process.argv.includes("--persist");
  const empty = process.argv.includes("--empty");
  const port = Number(process.env.LOCAL_DB_PORT ?? 54329);
  const db = await createLocalDatabase({ port, persist });
  process.env.DATABASE_URL = db.url;
  process.env.DB_MODE = "remote"; // this process talks to the server it just started
  // Dev-only default so tracking links in the sample data match the apps you start with the same value.
  process.env.AUTH_SECRET ??= "demo-only-secret-not-for-production-0001";

  if (!empty) {
    const { getDb, closeDb } = await import("@/db");
    const { schema } = await import("@/db");
    const handle = await getDb();
    const existing = await handle.select({ id: schema.categories.id }).from(schema.categories).limit(1);
    if (!existing.length) {
      const { seed } = await import("./seed");
      const { loadDemoData, createDemoAdmin, DEMO_ADMIN, DEMO_CUSTOMER } = await import("./demo-data");
      console.log("🍜 Seeding the real menu and sample data…");
      await seed({ quiet: true });
      const summary = await loadDemoData();
      await createDemoAdmin();
      console.log(`   ${summary.orders} sample orders, ${summary.customers} sample customers`);
      console.log(`   Admin: ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}   Customer: ${DEMO_CUSTOMER.phone} / ${DEMO_CUSTOMER.password}`);
    } else {
      console.log("Database already has data (from --persist); skipping seed.");
    }
    await closeDb(); // the seeding connection; apps connect over the socket themselves
  }

  console.log(`
┌──────────────────────────────────────────────────────────────────────────┐
│  LOCAL SHARED DATABASE (PGlite over the Postgres protocol) — dev only      │
├──────────────────────────────────────────────────────────────────────────┤
│  DATABASE_URL=${db.url.padEnd(58)}│
│  Start both apps with that value, DATABASE_POOL_MAX=1 and one AUTH_SECRET  │
│  Data ${persist ? "persists in ./.pglite" : "is in memory and vanishes when this process stops"}${" ".repeat(persist ? 40 : 20)}│
└──────────────────────────────────────────────────────────────────────────┘
Ctrl+C to stop.`);
  const shutdown = async () => {
    await db.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1]?.includes("local-db")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
