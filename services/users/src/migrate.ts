import net from "net";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { migrate } from "drizzle-orm/neon-http/migrator";

// Node.js v19+ enables Happy Eyeballs (autoSelectFamily) by default, which tries
// IPv6 first. Neon hosts expose AAAA records but IPv6 is unreachable in most
// hosted environments, causing ENETUNREACH before IPv4 is attempted. Disable it.
net.setDefaultAutoSelectFamily(false);

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const main = async (): Promise<void> => {
  try {
    await migrate(db, { migrationsFolder: "./src/infrastructure/db/migrations" });
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

main();
