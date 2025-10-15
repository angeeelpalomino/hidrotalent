import { createClient } from "@supabase/supabase-js";

// Sustituye con tu URL y API key pública de Supabase
const supabaseUrl = "https://uwqhxxztojwsxzeeexor.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cWh4eHp0b2p3c3h6ZWVleG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0OTUxNjMsImV4cCI6MjA3NjA3MTE2M30.PDXF2xgUhn1a9U4Utii2E0pYNL2J0h06hwH4OrS3CXw";

export const supabase = createClient(supabaseUrl, supabaseKey);
