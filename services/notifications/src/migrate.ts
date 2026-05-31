import net from "net";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";

// Node.js v19+ enables Happy Eyeballs (autoSelectFamily) by default, which tries
// IPv6 first. Neon hosts expose AAAA records but IPv6 is unreachable in most
// hosted environments, causing ENETUNREACH before IPv4 is attempted. Disable it.
net.setDefaultAutoSelectFamily(false);

const DATABASE_URL = process.env.DATABASE_URL!;
const MIGRATIONS_FOLDER = "./src/infrastructure/db/migrations";

const main = async (): Promise<void> => {
  try {
    if (DATABASE_URL.includes("neon.tech")) {
      const sql = neon(DATABASE_URL);
      const db = drizzleNeon(sql);
      await migrateNeon(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } else {
      const pool = new Pool({ connectionString: DATABASE_URL });
      const db = drizzlePg(pool);
      await migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
      await pool.end();
    }
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

main();
