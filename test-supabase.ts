/**
 * Supabase Connection Test
 * Verifies database is accessible and tables exist
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local file not found!');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');

  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  }

  return env;
}

const envVars = loadEnv();
const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseAnonKey = envVars['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Set' : '✗ Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log('🔌 Testing Supabase Connection...\n');
  console.log('URL:', supabaseUrl);
  console.log('---\n');

  try {
    // Test 1: Check if we can connect
    console.log('1️⃣  Testing database connection...');
    const { count, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('   ❌ Connection failed:', countError.message);
      process.exit(1);
    }
    console.log('   ✅ Database connection successful!\n');

    // Test 2: Check if tables exist
    console.log('2️⃣  Checking for required tables...\n');

    const requiredTables = [
      'users',
      'trades',
      'stock_trades',
      'option_trades',
      'option_legs',
      'news_articles',
      'stock_setups',
      'community_sources',
      'user_preferences',
    ];

    const results: { table: string; exists: boolean }[] = [];

    for (const table of requiredTables) {
      const { data, error } = await supabase
        .from(table)
        .select('count()', { count: 'exact', head: true })
        .limit(0);

      const exists = !error;
      results.push({ table, exists });
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
    }

    const allTablesExist = results.every((r) => r.exists);

    if (allTablesExist) {
      console.log('\n✨ SUCCESS! All tables exist and database is ready!\n');

      // Test 3: Try inserting test user
      console.log('3️⃣  Testing write access...');
      const testEmail = `test-${Date.now()}@test.local`;

      const { data: insertData, error: insertError } = await supabase
        .from('users')
        .insert([
          {
            email: testEmail,
            display_name: 'Test User',
          },
        ])
        .select();

      if (insertError) {
        console.log('   ⚠️  Write test failed (this might be normal):', insertError.message);
      } else {
        console.log('   ✅ Write access working!\n');

        // Clean up test record
        await supabase.from('users').delete().eq('email', testEmail);
      }

      console.log('🎉 Database is ready for development!\n');
      console.log('Next steps:');
      console.log('  1. Run: npm run dev');
      console.log('  2. Open: http://localhost:3000');
      console.log('  3. Start building features!\n');

      process.exit(0);
    } else {
      console.log('\n❌ Some tables are missing!');
      console.log('\nMissing tables:');
      results.filter((r) => !r.exists).forEach((r) => {
        console.log(`   - ${r.table}`);
      });
      console.log(
        '\nRun the SQL migration in Supabase SQL Editor with: /supabase/migrations/001_initial_schema.sql\n'
      );
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Connection test failed:', error.message);
    console.error('\nMake sure:');
    console.error('  1. Supabase project is created');
    console.error('  2. Credentials are correct in .env.local');
    console.error('  3. Database is initialized\n');
    process.exit(1);
  }
}

testConnection();
