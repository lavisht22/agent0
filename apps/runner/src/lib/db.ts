import type { Database } from '@repo/database';
import { createClient } from '@supabase/supabase-js';

// biome-ignore lint/style/noNonNullAssertion: <>
export const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_API_KEY!);
