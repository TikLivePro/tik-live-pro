import net from 'net';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { plans } from './schema.js';

const PLANS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'free',
    name: 'Free',
    priceCents: 0,
    features: [],
    maxSocialAccounts: 2,
    stripePriceId: null,
    isActive: true,
    sortOrder: 0,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    slug: 'premium',
    name: 'Pro',
    priceCents: 999,
    features: ['unlimited_accounts', 'analytics_dashboard', 'comment_moderation'],
    maxSocialAccounts: null,
    stripePriceId: null,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    slug: 'business',
    name: 'Business',
    priceCents: 2999,
    features: ['unlimited_accounts', 'analytics_dashboard', 'comment_moderation', 'stream_recording', 'priority_support'],
    maxSocialAccounts: null,
    stripePriceId: null,
    isActive: true,
    sortOrder: 2,
  },
] as const;

type Db = ReturnType<typeof drizzle> | ReturnType<typeof drizzleNeon>;

async function upsertPlans(db: Db): Promise<void> {
  console.log('Seeding billing plans…');
  for (const plan of PLANS) {
    const existing = await db.select().from(plans).where(eq(plans.slug, plan.slug));
    if (existing.length > 0) {
      await db.update(plans).set({
        name: plan.name,
        priceCents: plan.priceCents,
        features: plan.features,
        maxSocialAccounts: plan.maxSocialAccounts ?? null,
        stripePriceId: plan.stripePriceId,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
      }).where(eq(plans.slug, plan.slug));
      console.log(`  updated: ${plan.slug}`);
    } else {
      await db.insert(plans).values(plan);
      console.log(`  inserted: ${plan.slug}`);
    }
  }
}

async function seed(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL!;

  // Neon/pg hosts expose AAAA records but IPv6 is unreachable in most hosted
  // environments. Disable Happy Eyeballs so both TCP and fetch use IPv4 directly.
  net.setDefaultAutoSelectFamily(false);

  if (DATABASE_URL.includes('neon.tech')) {
    const db = drizzleNeon(neon(DATABASE_URL));
    await upsertPlans(db);
  } else {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool);
    await upsertPlans(db);
    await pool.end();
  }

  console.log('Done.');
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
